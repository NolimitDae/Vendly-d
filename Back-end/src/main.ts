// must be first: error tracking hooks into modules loaded after it
import './instrument';
// external imports
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join, resolve } from 'path';
// internal imports
import { AppModule } from './app.module';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import { CustomExceptionFilter } from './common/exception/custom-exception.filter';
import { TanvirStorage } from './common/lib/Disk/TanvirStorage';
import { storageSettings } from './common/lib/Disk/storage-settings';
import appConfig from './config/app.config';
import { PrismaExceptionFilter } from './common/exception/prisma-exception.filter';
import { AllExceptionsFilter } from './common/exception/all-exceptions.filter';

async function bootstrap() {
  console.log('[Bootstrap] Creating NestJS application...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  console.log('[Bootstrap] Connecting Redis WebSocket adapter...');
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  console.log('[Bootstrap] Redis WebSocket adapter connected.');
  app.setGlobalPrefix('api');

  // Body size limits
  // Nest's own parsers keep req.rawBody, which Stripe webhook signature checks need
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });

  // The website's address, plus any extra ones in CORS_ORIGINS (comma-separated), e.g. the old
  // Railway address while moving to a custom domain.
  const origins = [appConfig().app.client_app_url, ...(process.env.CORS_ORIGINS ?? '').split(',')]
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 1 ? origins : origins[0],
    credentials: true,
    maxAge: 86400, // 24h preflight cache
  });

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // inline styles needed by many UI libs
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
    }),
  );

  // only public/storage is served; public/private holds contracts and signatures.
  // STORAGE_DIR moves uploads onto a persistent volume (Railway wipes the container disk on deploy).
  app.useStaticAssets(process.env.STORAGE_DIR ? resolve(process.env.STORAGE_DIR) : join(__dirname, "..", "..", "public", "storage"), {
    index: false,
    prefix: "/public/storage",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new CustomExceptionFilter(),
    new PrismaExceptionFilter(),
  );

  // storage setup
  // local disk in development; Cloudflare R2 (or any S3) when STORAGE_DRIVER=s3
  const store = storageSettings();
  TanvirStorage.config({
    driver: store.driver,
    connection: {
      rootUrl: appConfig().storageUrl.rootUrl,
      publicUrl: appConfig().storageUrl.rootUrlPublic,
      awsBucket: store.bucket,
      awsAccessKeyId: store.accessKeyId,
      awsSecretAccessKey: store.secretAccessKey,
      awsDefaultRegion: store.region,
      awsEndpoint: store.endpoint,
      awsPublicUrl: store.publicUrl,
      // path-style addressing (bucket in the path) works for R2 and MinIO
      minio: true,
    },
  });

  // swagger
  const options = new DocumentBuilder()
    .setTitle(`${process.env.APP_NAME} api`)
    .setDescription(`${process.env.APP_NAME} api docs`)
    .setVersion('1.0')
    .addTag(`${process.env.APP_NAME}`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Admin access token (UserType: ADMIN)',
      },
      'admin-token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Customer access token (UserType: CUSTOMER)',
      },
      'customer-token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Vendor access token (UserType: VENDOR)',
      },
      'vendor-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
bootstrap();
