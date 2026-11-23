import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { getQueueToken } from '@nestjs/bullmq';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import type {
  INestApplication,
  INestApplicationContext,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Queue } from 'bullmq';
import {
  ANALYSIS_QUEUE,
  UPLOAD_DIR,
} from '../src/analyses/analyses.constants.js';
import { AnalysesRepository } from '../src/analyses/analyses.repository.js';
import { AppModule } from '../src/app.module.js';
import { WorkerModule } from '../src/worker.module.js';

// precisa do docker-compose.dev.yml rodando
describe('Análises (e2e)', () => {
  let app: INestApplication<App>;
  // a API só enfileira; sem o worker as análises ficariam QUEUED para sempre
  let worker: INestApplicationContext;
  let tokenA: string;
  let tokenB: string;
  let queue: Queue;

  // marca para provar que o código não fica em lugar nenhum depois da análise
  const SEGREDO = 'SENHA_DO_CLIENTE_123';
  const tmpFiles = () => readdir(UPLOAD_DIR).catch(() => [] as string[]);

  const waitFinished = async (id: string) => {
    let analysis: Record<string, unknown> = { status: 'QUEUED' };
    for (
      let i = 0;
      i < 40 && ['QUEUED', 'PROCESSING'].includes(analysis.status as string);
      i++
    ) {
      await new Promise((r) => setTimeout(r, 250));
      analysis = (
        await request(app.getHttpServer())
          .get(`/api/analyses/${id}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200)
      ).body;
    }
    return analysis;
  };

  const signUp = async (prefix: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Pessoa',
        email: `${prefix}-${randomUUID()}@exemplo.com`,
        password: 'senhaForte123',
      })
      .expect(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    (app as NestExpressApplication).useBodyParser('json', { limit: '3mb' });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    queue = app.get<Queue>(getQueueToken(ANALYSIS_QUEUE));

    const workerRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    worker = await workerRef.init();

    tokenA = await signUp('a');
    tokenB = await signUp('b');
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });

  it('analisa código colado de forma assíncrona e entrega o relatório', async () => {
    const server = app.getHttpServer();
    const before = await tmpFiles();
    const created = await request(server)
      .post('/api/analyses/paste')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        files: [
          {
            path: 'carrinho.service.ts',
            content: `// ${SEGREDO}\nexport class CarrinhoService {\n  total(itens: { preco: number }[]) {\n    if (itens.length === 0) return 0;\n    return itens.reduce((s, i) => s + i.preco, 0);\n  }\n}\n`,
          },
        ],
      })
      .expect(202);
    expect(created.body.status).toBe('QUEUED');

    const analysis = await waitFinished(created.body.id);
    expect(analysis.status).toBe('DONE');
    expect(analysis.score).toBeGreaterThan(0);

    // o código sumiu: nem pedido na fila, nem arquivo temporário
    expect(await queue.getJob(created.body.id)).toBeUndefined();
    expect(await tmpFiles()).toEqual(before);

    // ficou a identidade: impressão digital e minimapa, sem o código
    const identity = analysis.sourceIdentity as {
      fingerprint: string;
      minimap: { path: string; lines: string }[];
    };
    expect(identity.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.minimap[0].path).toBe('carrinho.service.ts');
    expect(JSON.stringify(identity)).not.toContain(SEGREDO);

    const report = await request(server)
      .get(`/api/analyses/${created.body.id}/report`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(report.headers['content-disposition']).toContain('attachment');
    expect(report.text).toContain('## 4. Nota e como melhorar');
    expect(report.text).toContain('**Fonte:** código colado');

    await request(server)
      .get(`/api/analyses/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server)
      .delete(`/api/analyses/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server)
      .delete(`/api/analyses/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });

  it('análise que falha não deixa o código guardado no Redis nem em disco', async () => {
    const before = await tmpFiles();
    // só arquivo ignorado (node_modules): a análise falha com erro de entrada
    const created = await request(app.getHttpServer())
      .post('/api/analyses/paste')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        files: [
          {
            path: 'node_modules/lib/index.js',
            content: `const db = "postgres://admin:${SEGREDO}@prod/db";`,
          },
        ],
      })
      .expect(202);

    const analysis = await waitFinished(created.body.id);
    expect(analysis.status).toBe('FAILED');

    // o pedido que falhou continua no Redis (para investigar), mas sem o código
    const job = await queue.getJob(created.body.id);
    expect(job).toBeDefined();
    expect(JSON.stringify(job!.data)).not.toContain(SEGREDO);
    expect(await tmpFiles()).toEqual(before);
  });

  it('excluir uma análise ainda na fila apaga o pedido e o código na hora', async () => {
    const before = await tmpFiles();
    await queue.pause(); // segura o worker para a análise ficar na fila
    try {
      const created = await request(app.getHttpServer())
        .post('/api/analyses/paste')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ files: [{ path: 'a.ts', content: `// ${SEGREDO}` }] })
        .expect(202);
      expect((await tmpFiles()).length).toBe(before.length + 1);

      await request(app.getHttpServer())
        .delete(`/api/analyses/${created.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);
      expect(await queue.getJob(created.body.id)).toBeUndefined();
      expect(await tmpFiles()).toEqual(before);
    } finally {
      await queue.resume();
    }
  });

  it('excluída no meio da análise: o worker é avisado sem erro (Postgres real)', async () => {
    const repo = worker.get(AnalysesRepository);
    await queue.pause();
    try {
      const created = await request(app.getHttpServer())
        .post('/api/analyses/paste')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ files: [{ path: 'a.ts', content: 'export const x = 1;' }] })
        .expect(202);
      await request(app.getHttpServer())
        .delete(`/api/analyses/${created.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);

      // antes era update: lançava P2025 e o job ia para uma nova tentativa
      await expect(repo.markProcessing(created.body.id)).resolves.toBe(false);
      await expect(repo.stillExists(created.body.id)).resolves.toBe(false);
      await expect(
        repo.markDone(created.body.id, {
          score: 5,
          fileCount: 1,
          lineCount: 1,
          aiEnhanced: false,
          result: {},
          reportMd: '',
          sourceIdentity: {},
        }),
      ).resolves.toBe(false);
    } finally {
      await queue.resume();
    }
  });

  it('recusa URLs que não são do GitHub (SSRF) e arquivos que não são zip', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/analyses/github')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ url: 'http://localhost:5432/' })
      .expect(400);
    await request(server)
      .post('/api/analyses/upload')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('não sou zip'), 'projeto.zip')
      .expect(400);
  });

  it('exige autenticação', async () => {
    await request(app.getHttpServer()).get('/api/analyses').expect(401);
  });
});
