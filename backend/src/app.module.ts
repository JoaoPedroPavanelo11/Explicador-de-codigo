import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnalysesModule } from './analyses/analyses.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv, type Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    // Fila de análises (BullMQ + Redis)
    BullModule.forRootAsync({
      inject: [ConfigService],
      // Em ESM o BullMQ 6 pede uma instância do cliente Redis já criada.
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: new Redis({
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
          maxRetriesPerRequest: null, // exigido pelos workers do BullMQ
        }),
      }),
    }),
    AnalysesModule,
    HealthModule,
  ],
})
export class AppModule {}
