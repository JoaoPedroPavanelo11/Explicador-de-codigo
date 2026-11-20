import { Controller, Get, Injectable } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  isHealthy(key: string) {
    return this.indicators
      .check(key)
      .attempt(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      })
      .withTimeout('2s');
  }
}

@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /** Liveness: responde se o processo está de pé (sem checar dependências). */
  @Get('health')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: só fica "ok" quando o banco responde. Usado pelo Docker. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
