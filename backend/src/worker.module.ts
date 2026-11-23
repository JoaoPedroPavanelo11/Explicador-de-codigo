import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module.js';
import { ANALYSIS_QUEUE } from './analyses/analyses.constants.js';
import { AnalysesRepository } from './analyses/analyses.repository.js';
import { AnalysisProcessor } from './analyses/analysis.processor.js';
import { ConfigRootModule, QueueRootModule } from './config/root-modules.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

// O worker: consome a fila e roda o motor de análise. Fica num processo
// separado da API porque a análise é cálculo síncrono e travaria o event loop,
// deixando login, listagem e polling esperando até ela terminar.
// Não tem HTTP, auth nem rate limit.
@Module({
  imports: [
    ConfigRootModule,
    PrismaModule,
    QueueRootModule,
    BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
    IngestionModule,
    AiModule,
  ],
  providers: [AnalysesRepository, AnalysisProcessor],
})
export class WorkerModule {}
