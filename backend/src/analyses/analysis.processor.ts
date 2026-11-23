import { readFile, unlink } from 'node:fs/promises';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import { analyzeProject } from '../analyzer/engine/analyzer.js';
import {
  IngestError,
  type NormalizeResult,
} from '../analyzer/engine/normalize.js';
import { renderMarkdown } from '../analyzer/engine/report.js';
import type { Prisma } from '../generated/prisma/client.js';
import { IngestionService } from '../ingestion/ingestion.service.js';
import { AiExplainerService } from '../ai/ai-explainer.service.js';
import { AnalysesRepository } from './analyses.repository.js';
import { ANALYSIS_QUEUE, type AnalysisJobData } from './analyses.constants.js';

@Processor(ANALYSIS_QUEUE, { concurrency: 2 })
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly analyses: AnalysesRepository,
    private readonly ingestion: IngestionService,
    private readonly ai: AiExplainerService,
  ) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<void> {
    const { analysisId } = job.data;
    const analysis = await this.analyses.findForProcessing(analysisId);
    if (!analysis) {
      await this.cleanup(job.data); // análise excluída enquanto estava na fila
      return;
    }
    await this.analyses.markProcessing(analysisId);
    const startedAt = Date.now();

    try {
      const input = await this.ingest(job.data);
      let result = analyzeProject(input.files, input.skipped, input.coverage);
      if (analysis.useAi && this.ai.isEnabled) {
        try {
          result = await this.ai.enhance(result);
        } catch (error) {
          // sem IA a análise continua válida
          this.logger.warn(
            `IA indisponível para ${analysisId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const reportMd = renderMarkdown(result, analysis.title);

      await this.analyses.markDone(analysisId, {
        score: result.quality.score,
        fileCount: result.meta.files,
        lineCount: result.meta.lines,
        aiEnhanced: result.meta.aiEnhanced,
        result: result as unknown as Prisma.InputJsonValue,
        reportMd,
      });
      this.logger.log(
        `Análise ${analysisId} concluída em ${Date.now() - startedAt}ms (${result.meta.files} arquivos)`,
      );
      await this.cleanup(job.data);
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (error instanceof IngestError) {
        // erro de entrada (zip inválido, repo privado): retry não resolve
        await this.analyses.markFailed(analysisId, error.message);
        await this.cleanup(job.data);
        throw new UnrecoverableError(error.message);
      }
      this.logger.error(
        `Falha na análise ${analysisId}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (isLastAttempt) {
        await this.analyses.markFailed(
          analysisId,
          'Ocorreu um erro interno ao analisar o código. Tente novamente.',
        );
        await this.cleanup(job.data);
      }
      throw error;
    }
  }

  private async ingest({ source }: AnalysisJobData): Promise<NormalizeResult> {
    switch (source.kind) {
      case 'paste':
        return this.ingestion.fromPaste(source.files);
      case 'zip':
        return this.ingestion.fromZip(await readFile(source.tmpPath));
      case 'github':
        return this.ingestion.fromGithub({
          owner: source.owner,
          repo: source.repo,
        });
    }
  }

  private async cleanup({ source }: AnalysisJobData) {
    if (source.kind === 'zip')
      await unlink(source.tmpPath).catch(() => undefined);
  }
}
