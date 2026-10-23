import {
  Controller,
  Get,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AppService } from './app.service';
import { createReadStream } from 'fs';
import { join } from 'path';
import { Response } from 'express';
import { Readable } from 'stream';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('test-chunk-stream')
  async chunkStream(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders(); // make sure headers are sent immediately

    const stream = new Readable({
      read() {},
    });

    // Pipe the stream to the response
    stream.pipe(res);

    let counter = 0;
    const interval = setInterval(() => {
      if (counter >= 10) {
        stream.push('Stream complete.\n');
        stream.push(null); // ends the stream
        clearInterval(interval);
      } else {
        stream.push(`Chunk ${counter + 1} at ${new Date().toISOString()}\n`);
        counter++;
      }
    }, 500);
  }

  @Get('test-file-stream')
  testFileStream(@Res({ passthrough: true }) res: Response) {
    const file = createReadStream(join(process.cwd(), 'package.json'));
    return new StreamableFile(file, {
      type: 'application/json',
      disposition: 'attachment; filename="package.json"',
    });
  }
}
