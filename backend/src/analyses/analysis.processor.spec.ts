import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { AiExplainerService } from '../ai/ai-explainer.service.js';
import type { IngestionService } from '../ingestion/ingestion.service.js';
import type { AnalysisJobData } from './analyses.constants.js';
import type { AnalysesRepository } from './analyses.repository.js';
import { AnalysisProcessor } from './analysis.processor.js';

// Simula o usuário excluindo a análise em cada etapa do worker.
// Em todos os casos o worker deve: terminar sem erro (sem nova tentativa),
// não gastar com a IA depois da exclusão e apagar o código temporário.
describe('AnalysisProcessor: análise excluída durante o processamento', () => {
  let dir: string;
  let tmpPath: string;
  let deleted: boolean;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let ingestion: { fromPaste: ReturnType<typeof vi.fn> };
  let ai: { isEnabled: boolean; enhance: ReturnType<typeof vi.fn> };
  let logError: ReturnType<typeof vi.spyOn>;

  const job = () =>
    ({
      data: { analysisId: 'a1', source: { kind: 'paste', tmpPath } },
      attemptsMade: 0,
      opts: { attempts: 2 },
    }) as unknown as Job<AnalysisJobData>;

  const processor = () =>
    new AnalysisProcessor(
      repo as unknown as AnalysesRepository,
      ingestion as unknown as IngestionService,
      ai as unknown as AiExplainerService,
    );

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'processor-'));
    tmpPath = join(dir, 'codigo.json');
    await writeFile(
      tmpPath,
      JSON.stringify([{ path: 'a.ts', content: 'export const x = 1;\n' }]),
    );
    deleted = false;
    repo = {
      findForProcessing: vi.fn(async () =>
        deleted
          ? null
          : {
              id: 'a1',
              title: 'Teste',
              useAi: true,
              status: 'QUEUED',
              sourceType: 'PASTE',
              sourceRef: null,
            },
      ),
      markProcessing: vi.fn(async () => !deleted),
      stillExists: vi.fn(async () => !deleted),
      markDone: vi.fn(async () => !deleted),
      markFailed: vi.fn(async () => ({ count: deleted ? 0 : 1 })),
    };
    ingestion = {
      fromPaste: vi.fn((files: { path: string; content: string }[]) => ({
        files,
        skipped: 0,
      })),
    };
    ai = { isEnabled: true, enhance: vi.fn(async (r: unknown) => r) };
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  const expectDiscarded = () => {
    expect(repo.markFailed).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
    expect(existsSync(tmpPath)).toBe(false);
  };

  it('sem exclusão: salva o resultado e apaga o código', async () => {
    await processor().process(job());
    expect(repo.markDone).toHaveBeenCalledOnce();
    expect(ai.enhance).toHaveBeenCalledOnce();
    expect(existsSync(tmpPath)).toBe(false);
  });

  it('excluída logo antes de começar: nem lê o código', async () => {
    repo.markProcessing.mockResolvedValueOnce(false);
    await expect(processor().process(job())).resolves.toBeUndefined();
    expect(ingestion.fromPaste).not.toHaveBeenCalled();
    expectDiscarded();
  });

  it('excluída durante a leitura/download: não analisa nem chama a IA', async () => {
    ingestion.fromPaste.mockImplementationOnce((files) => {
      deleted = true;
      return { files, skipped: 0 };
    });
    await expect(processor().process(job())).resolves.toBeUndefined();
    expect(ai.enhance).not.toHaveBeenCalled();
    expect(repo.markDone).not.toHaveBeenCalled();
    expectDiscarded();
  });

  it('excluída durante a análise: não gasta com a IA', async () => {
    // existe no 1º ponto de checagem, some antes do 2º (o da IA)
    repo.stillExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(processor().process(job())).resolves.toBeUndefined();
    expect(ai.enhance).not.toHaveBeenCalled();
    expectDiscarded();
  });

  it('excluída durante a IA: descarta o resultado sem erro nem nova tentativa', async () => {
    ai.enhance.mockImplementationOnce(async (r: unknown) => {
      deleted = true;
      return r;
    });
    await expect(processor().process(job())).resolves.toBeUndefined();
    expect(repo.markDone).toHaveBeenCalledOnce(); // tentou e viu que sumiu
    expectDiscarded();
  });
});
