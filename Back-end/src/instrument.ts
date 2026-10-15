// Error tracking. Imported first in main.ts so Sentry can hook into everything loaded after it.
// Off unless SENTRY_DSN is set; only unexpected (500) errors are reported, from the exception filters.
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  // never send request bodies or auth headers (card details, passwords, contract signatures)
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) delete event.request.headers.authorization;
    }
    return event;
  },
});
