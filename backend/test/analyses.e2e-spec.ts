import { randomUUID } from 'node:crypto';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

// precisa do docker-compose.dev.yml rodando
describe('Análises (e2e)', () => {
  let app: INestApplication<App>;
  let tokenA: string;
  let tokenB: string;

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
    tokenA = await signUp('a');
    tokenB = await signUp('b');
  });

  afterAll(async () => {
    await app.close();
  });

  it('analisa código colado de forma assíncrona e entrega o relatório', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/analyses/paste')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        files: [
          {
            path: 'carrinho.service.ts',
            content:
              'export class CarrinhoService {\n  total(itens: { preco: number }[]) {\n    if (itens.length === 0) return 0;\n    return itens.reduce((s, i) => s + i.preco, 0);\n  }\n}\n',
          },
        ],
      })
      .expect(202);
    expect(created.body.status).toBe('QUEUED');

    let analysis: { status: string; score: number | null } = {
      status: 'QUEUED',
      score: null,
    };
    for (
      let i = 0;
      i < 40 && ['QUEUED', 'PROCESSING'].includes(analysis.status);
      i++
    ) {
      await new Promise((r) => setTimeout(r, 250));
      analysis = (
        await request(server)
          .get(`/api/analyses/${created.body.id}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200)
      ).body;
    }
    expect(analysis.status).toBe('DONE');
    expect(analysis.score).toBeGreaterThan(0);

    const report = await request(server)
      .get(`/api/analyses/${created.body.id}/report`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(report.headers['content-disposition']).toContain('attachment');
    expect(report.text).toContain('## 4. Nota e como melhorar');

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
