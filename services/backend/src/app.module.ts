/**
 * Root application module that wires together all feature modules, database, event emitter,
 * Sentry, Redis, queue processing, auth, and WebSocket communication.
 * Registers global interceptors for request context and response transformation.
 */
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SentryModule } from '@sentry/nestjs/setup';

import { TypedConfigModule } from './config/typed-config.module';
import {
  ContextInterceptor,
  TransformAndValidateResponseInterceptor
} from './libs/interceptors';
import { RequestContextModule } from './libs/context';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDatabaseConfig } from './database/database.setup';

import { RedisModule } from '@modules/redis/redis.module';
import { QueueModule } from '@modules/queue/queue.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UserModule } from '@modules/user/user.module';
import { OrganizationModule } from '@modules/organization/organization.module';
import { ProjectModule } from '@modules/project/project.module';
import { TicketModule } from '@modules/ticket/ticket.module';
import { ChatModule } from '@modules/chat/chat.module';
import { WebSocketModule } from '@modules/websocket/websocket.module';

const interceptors = [
  {
    provide: APP_INTERCEPTOR,
    useClass: ContextInterceptor
  },
  {
    provide: APP_INTERCEPTOR,
    useClass: TransformAndValidateResponseInterceptor
  }
];

@Module({
  imports: [
    SentryModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true }),
    TypedConfigModule,
    TypeOrmModule.forRoot(getDatabaseConfig()),
    RequestContextModule,
    RedisModule,
    QueueModule,
    AuthModule,
    UserModule,
    OrganizationModule,
    ProjectModule,
    TicketModule,
    ChatModule,
    WebSocketModule
  ],
  controllers: [AppController],
  providers: [...interceptors, AppService],
  exports: []
})
export class AppModule {}
