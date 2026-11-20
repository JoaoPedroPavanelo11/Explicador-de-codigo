import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  /** Liveness: responde se o processo está de pé (sem checar dependências). */
  @Get('health')
  live() {
    return { status: 'ok' };
  }
}
