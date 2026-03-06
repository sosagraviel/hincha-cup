/**
 * Application entry point. Initializes Sentry, creates the NestJS app, configures
 * the WebSocket adapter, global pipes/filters, CORS, runs DB migrations, and starts listening.
 */
import 'tsconfig-paths/register';
import 'reflect-metadata';
import './config/sentry.init';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { appConfig } from './config/app.config';
import { runMigrations } from './database/utils';
import { GlobalExceptionsFilter } from './libs/exceptions/global.exceptions.filter';
import { AuthenticatedSocketIoAdapter } from '@modules/websocket/websocket.adapter';

/**
 * Bootstrap the NestJS application with all middleware, guards, and adapters configured.
 * Runs pending database migrations before the server starts listening on API_PORT.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new AuthenticatedSocketIoAdapter(app));

  app.useGlobalFilters(new GlobalExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  app.enableShutdownHooks();
  app.enableCors();
  app.setGlobalPrefix(appConfig().API_PREFIX);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gira API')
    .setDescription(
      'Full-stack project management tool — organizations, projects, tickets, comments, and real-time chat.'
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${appConfig().API_PREFIX}/docs`, app, document);

  await runMigrations();

  await app.listen(appConfig().API_PORT);
}
bootstrap();
