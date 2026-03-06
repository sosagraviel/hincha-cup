/**
 * Initializes the Sentry error tracking SDK for the NestJS backend.
 * Reads SENTRY_DSN and NODE_ENV from process.env. Must be imported before
 * the NestJS application bootstraps (imported in main.ts).
 */
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});
