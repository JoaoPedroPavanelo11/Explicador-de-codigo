import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnalysesModule } from './analyses/analyses.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv, type Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { RateLimitModule } from './security/rate-limit.module.js';
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
    RateLimitModule, // precisa vir depois do AuthModule
    BullModule.forRootAsync({
      inject: [ConfigService],
      // bullmq 6 em ESM só aceita instância pronta do ioredis
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: new Redis({
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
          maxRetriesPerRequest: null, // exigido pelo worker do bullmq
        }),
      }),
    }),
    AnalysesModule,
    HealthModule,
  ],
})
export class AppModule {}
