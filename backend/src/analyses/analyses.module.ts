import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Env } from '../config/env.js';
import { AiModule } from '../ai/ai.module.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { ANALYSIS_QUEUE } from './analyses.constants.js';
import { AnalysesController } from './analyses.controller.js';
import { AnalysesRepository } from './analyses.repository.js';
import { AnalysesService } from './analyses.service.js';
import { AnalysisProcessor } from './analysis.processor.js';
import { MetaController } from './meta.controller.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('UPLOAD_MAX_MB', { infer: true }) * 1024 * 1024,
          files: 1,
          fields: 5,
          fieldSize: 1024,
          parts: 8,
        },
      }),
    }),
    IngestionModule,
    AiModule,
  ],
  controllers: [AnalysesController, MetaController],
  providers: [AnalysesService, AnalysesRepository, AnalysisProcessor],
})
export class AnalysesModule {}
