import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import { AiExplainerService } from '../ai/ai-explainer.service.js';
import { ENGINE_VERSION } from '../analyzer/engine/analyzer.js';
import type { Env } from '../config/env.js';
import { MAX_PENDING_PER_USER } from './analyses.constants.js';

@Public()
@Controller('meta')
export class MetaController {
  constructor(
    private readonly ai: AiExplainerService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  get() {
    return {
      engineVersion: ENGINE_VERSION,
      aiAvailable: this.ai.isEnabled,
      limits: {
        uploadMaxMb: this.config.get('UPLOAD_MAX_MB', { infer: true }),
        maxPendingPerUser: MAX_PENDING_PER_USER,
        pasteMaxFiles: 100,
      },
    };
  }
}
