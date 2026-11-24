import { Module } from '@nestjs/common';
import { AnalysesModule } from './analyses/analyses.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigRootModule, QueueRootModule } from './config/root-modules.js';
import { HealthModule } from './health/health.module.js';
import { RateLimitModule } from './security/rate-limit.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

// a API HTTP. Ela só enfileira análises; quem processa é o WorkerModule.
@Module({
  imports: [
    ConfigRootModule,
    PrismaModule,
    AuthModule,
    RateLimitModule, // precisa vir depois do AuthModule
    QueueRootModule,
    AnalysesModule,
    HealthModule,
  ],
})
export class AppModule {}
