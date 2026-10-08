function redisConfig() {
  // Railway's Redis service exposes REDIS_URL and REDISHOST/REDISPORT/REDISPASSWORD
  const url = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
  return {
    host: process.env.REDIS_HOST || process.env.REDISHOST || url?.hostname || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || process.env.REDISPORT || url?.port || 6379),
    username: process.env.REDIS_USERNAME || process.env.REDISUSER || (url?.username ? decodeURIComponent(url.username) : undefined),
    password:
      process.env.REDIS_PASSWORD ||
      process.env.REDISPASSWORD ||
      (url?.password ? decodeURIComponent(url.password) : ''),
    // 0 = IPv4 or IPv6; Railway private networking (*.railway.internal) is IPv6-only
    family: 0,
  };
}

export default () => ({
  app: {
    name: process.env.APP_NAME,
    key: process.env.APP_KEY,
    url: process.env.APP_URL,
    client_app_url: process.env.CLIENT_APP_URL,
    port: parseInt(process.env.PORT, 10) || 3000,
  },

  fileSystems: {
    public: {},
    s3: {
      driver: 's3',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION,
      bucket: process.env.AWS_BUCKET,
      url: process.env.AWS_URL,
      endpoint: process.env.AWS_ENDPOINT,
    },
    gcs: {
      driver: 'gcs',
      projectId: process.env.GCP_PROJECT_ID,
      keyFile: process.env.GCP_KEY_FILE,
      apiEndpoint: process.env.GCP_API_ENDPOINT,
      bucket: process.env.GCP_BUCKET,
    },
  },

  database: {
    url: String(process.env.DATABASE_URL),
  },

  redis: redisConfig(),

  security: {
    salt: 10,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY,
  },

  mail: {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: process.env.MAIL_PORT || 587,
    user: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM_ADDRESS,
  },

  auth: {
    google: {
      app_id: process.env.GOOGLE_APP_ID,
      app_secret: process.env.GOOGLE_APP_SECRET,
      callback: process.env.GOOGLE_CALLBACK_URL,
    },
    facebook: {
      app_id: process.env.FACEBOOK_APP_ID,
      app_secret: process.env.FACEBOOK_APP_SECRET,
      callback: process.env.FACEBOOK_CALLBACK_URL,
    },
  },

  payment: {
    stripe: {
      secret_key: process.env.STRIPE_SECRET_KEY,
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
    },
    paypal: {
      client_id: process.env.PAYPAL_CLIENT_ID,
      secret: process.env.PAYPAL_SECRET,
      api: process.env.PAYPAL_API,
    },
  },

  /**
   * Storage directory
   */
  storageUrl: {
    rootUrl: './public/storage',
    rootUrlPublic: '/public/storage',
    // storage directory
    package: '/package',
    license: '/license',
    destination: '/destination',
    blog: '/blog',
    avatar: '/avatar',
    portfolio: '/portfolio',
    websiteInfo: '/website-info',
    // chat
    attachment: 'attachment/',
    jobPhoto: 'job-photo/',
  },

  defaultUser: {
    system: {
      username: process.env.SYSTEM_USERNAME,
      email: process.env.SYSTEM_EMAIL,
      password: process.env.SYSTEM_PASSWORD,
    },
  },
});
