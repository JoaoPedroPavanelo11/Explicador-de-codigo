import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { IngestError } from '../analyzer/engine/normalize.js';
import { SourceType } from '../generated/prisma/client.js';
import { parseGithubUrl } from '../ingestion/github-fetcher.js';
import { isZip } from '../ingestion/zip-extractor.js';
import { AnalysesRepository } from './analyses.repository.js';
import {
  ANALYSIS_QUEUE,
  MAX_PENDING_PER_USER,
  type AnalysisJobData,
  type AnalysisSource,
} from './analyses.constants.js';
import type {
  GithubInput,
  PasteInput,
  UploadFields,
} from './analyses.schemas.js';

export const UPLOAD_DIR = join(process.cwd(), 'tmp', 'uploads');

@Injectable()
export class AnalysesService {
  constructor(
    private readonly analyses: AnalysesRepository,
    @InjectQueue(ANALYSIS_QUEUE) private readonly queue: Queue<AnalysisJobData>,
  ) {}

  async fromPaste(userId: string, input: PasteInput) {
    const first = input.files[0].path.split('/').pop();
    const title =
      input.title ??
      (input.files.length === 1
        ? first!
        : `Código colado (${input.files.length} arquivos)`);
    return this.enqueue(
      userId,
      { title, useAi: input.useAi, sourceType: SourceType.PASTE },
      {
        kind: 'paste',
        files: input.files,
      },
    );
  }

  async fromGithub(userId: string, input: GithubInput) {
    let ref;
    try {
      ref = parseGithubUrl(input.url);
    } catch (error) {
      throw new BadRequestException(
        error instanceof IngestError ? error.message : 'URL inválida',
      );
    }
    const name = `${ref.owner}/${ref.repo}`;
    return this.enqueue(
      userId,
      {
        title: input.title ?? name,
        useAi: input.useAi,
        sourceType: SourceType.GITHUB,
        sourceRef: `https://github.com/${name}`,
      },
      { kind: 'github', owner: ref.owner, repo: ref.repo },
    );
  }

  async fromUpload(
    userId: string,
    file: Express.Multer.File | undefined,
    fields: UploadFields,
  ) {
    if (!file || file.size === 0)
      throw new BadRequestException('Envie um arquivo .zip no campo "file"');
    // extensão e content-type mentem, a assinatura do zip não
    if (
      !file.originalname.toLowerCase().endsWith('.zip') ||
      !isZip(file.buffer)
    )
      throw new BadRequestException('O arquivo precisa ser um .zip válido');

    await this.assertCanEnqueue(userId);
    await mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });
    const tmpPath = join(UPLOAD_DIR, `${randomUUID()}.zip`);
    await writeFile(tmpPath, file.buffer, { mode: 0o600 });
    const safeName = file.originalname
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 120);
    try {
      return await this.enqueue(
        userId,
        {
          title: fields.title ?? safeName,
          useAi: fields.useAi,
          sourceType: SourceType.ZIP,
          sourceRef: safeName,
        },
        { kind: 'zip', tmpPath },
        true,
      );
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  }

  list(userId: string, limit: number, cursor?: string) {
    return this.analyses.list(userId, limit, cursor).then((page) => ({
      ...page,
      items: page.items.map((i) => ({
        ...i,
        score: i.score === null ? null : Number(i.score),
      })),
    }));
  }

  async get(userId: string, id: string) {
    const analysis = await this.analyses.findOwned(userId, id);
    if (!analysis) throw new NotFoundException('Análise não encontrada');
    return {
      ...analysis,
      score: analysis.score === null ? null : Number(analysis.score),
    };
  }

  async report(userId: string, id: string) {
    const analysis = await this.analyses.findReport(userId, id);
    if (!analysis) throw new NotFoundException('Análise não encontrada');
    if (!analysis.reportMd)
      throw new NotFoundException('O relatório ainda não está pronto');
    return analysis;
  }

  async remove(userId: string, id: string) {
    if (!(await this.analyses.deleteOwned(userId, id)))
      throw new NotFoundException('Análise não encontrada');
  }

  private async assertCanEnqueue(userId: string) {
    if ((await this.analyses.countPending(userId)) >= MAX_PENDING_PER_USER)
      throw new HttpException(
        `Você já tem ${MAX_PENDING_PER_USER} análises em andamento. Aguarde alguma terminar.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  private async enqueue(
    userId: string,
    data: {
      title: string;
      useAi: boolean;
      sourceType: SourceType;
      sourceRef?: string;
    },
    source: AnalysisSource,
    alreadyChecked = false,
  ) {
    if (!alreadyChecked) await this.assertCanEnqueue(userId);
    const analysis = await this.analyses.create({ userId, ...data });
    await this.queue.add(
      'analyze',
      { analysisId: analysis.id, source },
      {
        jobId: analysis.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    return analysis;
  }
}
