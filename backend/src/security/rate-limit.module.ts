import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';

// tem que ser importado depois do AuthModule (guards globais rodam na ordem
// dos módulos), senão req.user ainda não existe e tudo conta por IP
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        getTracker: (req: Record<string, any>) =>
          req.user?.id ? `user:${String(req.user.id)}` : `ip:${String(req.ip)}`,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
