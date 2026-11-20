import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CurrentUser,
  Public,
  RefreshTokenError,
  TokenService,
} from '@nestjs/authentication';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import type { PublicUser } from '../users/users.repository.js';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './auth.schemas.js';
import { CredentialsService } from './credentials.service.js';

export const REFRESH_COOKIE = 'explicador_rt';

// access token no corpo (front guarda em memória), refresh token em cookie httpOnly
@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body({ schema: registerSchema }) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.credentials.register(body);
    return this.startSession(user, res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.credentials.verify(body.email, body.password);
    // mesma resposta para e-mail inexistente e senha errada
    if (!user) throw new UnauthorizedException('E-mail ou senha inválidos');
    return this.startSession(user, res);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const current = this.readRefreshCookie(req);
    if (!current) throw new UnauthorizedException('Sessão expirada');
    try {
      const pair = await this.tokens.refresh(current);
      this.setRefreshCookie(res, pair.refreshToken);
      return { accessToken: pair.accessToken, expiresIn: pair.expiresIn };
    } catch (error) {
      if (error instanceof RefreshTokenError) {
        this.clearRefreshCookie(res);
        throw new UnauthorizedException('Sessão expirada');
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const current = this.readRefreshCookie(req);
    if (current) await this.tokens.revoke(current);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: PublicUser) {
    return user;
  }

  private async startSession(user: PublicUser, res: Response) {
    const issued = await this.tokens.issue(user.id, { method: 'password' });
    this.setRefreshCookie(res, issued.refreshToken);
    return {
      user,
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
    };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict',
      path: '/api/auth', // o navegador só envia o cookie para as rotas de auth
    };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
