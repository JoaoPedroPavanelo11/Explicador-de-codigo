import { randomUUID } from 'node:crypto';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('explicador_rt='));
  if (!cookie) throw new Error('cookie de refresh ausente');
  return cookie.split(';')[0];
}

describe('Autenticação (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${randomUUID()}@exemplo.com`;
  const password = 'senhaForte123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cadastra, acessa rota protegida e detecta refresh token reutilizado', async () => {
    const server = app.getHttpServer();

    const register = await request(server)
      .post('/api/auth/register')
      .send({ name: 'Pessoa Teste', email, password })
      .expect(201);
    expect(register.body.user.email).toBe(email);
    expect(register.body.user.passwordHash).toBeUndefined();
    const firstCookie = refreshCookie(register);

    await request(server).get('/api/auth/me').expect(401);
    await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.accessToken}`)
      .expect(200);

    const refreshed = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = refreshCookie(refreshed);

    // reuso do token antigo
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);
    // e a família inteira caiu junto
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('responde igual para e-mail inexistente e senha errada', async () => {
    const server = app.getHttpServer();
    const unknown = await request(server)
      .post('/api/auth/login')
      .send({ email: `naoexiste-${randomUUID()}@x.com`, password })
      .expect(401);
    const wrong = await request(server)
      .post('/api/auth/login')
      .send({ email, password: 'senhaErrada999' })
      .expect(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejeita cadastro duplicado e campos desconhecidos', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/register')
      .send({ name: 'Outra', email, password })
      .expect(409);
    await request(server)
      .post('/api/auth/register')
      .send({ name: 'Outra', email: 'a@b.com', password, role: 'admin' })
      .expect(400);
  });
});
