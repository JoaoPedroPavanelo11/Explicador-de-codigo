import { Module } from '@nestjs/common';
import { AiExplainerService } from './ai-explainer.service.js';

@Module({
  providers: [AiExplainerService],
  exports: [AiExplainerService],
})
export class AiModule {}
