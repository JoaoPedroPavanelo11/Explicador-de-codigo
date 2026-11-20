import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import type { Env } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { JwtAuthProvider } from './jwt-auth.provider.js';
import { PrismaRefreshTokenStore } from './prisma-refresh-token.store.js';
import './auth.types.js';

@Module({
  imports: [
    // guard global: tudo exige login, exceto rotas com @Public()
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          ttl: config.get('JWT_TTL', { infer: true }),
          issuer: 'explicador-de-codigo',
        },
        refreshToken: {
          ttl: config.get('REFRESH_TTL', { infer: true }),
          absoluteTtl: '30d',
        },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [CredentialsService, JwtAuthProvider, PrismaRefreshTokenStore],
})
export class AuthModule {}
