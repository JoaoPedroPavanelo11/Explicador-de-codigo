import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { appRoleSchema, type Env } from './config/env.js';
import { createLogger } from './config/logger.js';
import { WorkerModule } from './worker.module.js';

// Um mesmo build, três jeitos de rodar (APP_ROLE):
//   api    -> só HTTP (container "api" no docker compose)
//   worker -> só a fila de análises (container "worker")
//   all    -> os dois no mesmo processo; prático em dev, mas a análise volta a
//             disputar o event loop com o HTTP
async function main() {
  const parsed = appRoleSchema.safeParse(process.env.APP_ROLE);
  if (!parsed.success)
    throw new Error('APP_ROLE inválido: use "api", "worker" ou "all"');
  const role = parsed.data;

  if (role === 'api' || role === 'all') await startApi();
  if (role === 'worker' || role === 'all') await startWorker();
}

// sem HTTP: só o contexto de injeção de dependências com o processador da fila
async function startWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLogger('Worker'),
  });
  // no SIGTERM o bullmq termina o job atual antes de fechar
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker de análises aguardando jobs');
}

async function startApi() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: createLogger('API'),
  });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // nginx na frente
  app.disable('x-powered-by');
  app.enableShutdownHooks();

  // a API só devolve json/arquivos; CSP desligada em dev por causa do swagger
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  app.use(cookieParser());
  // padrão é 100kb, pouco para código colado
  app.useBodyParser('json', { limit: '3mb' });
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  if (!isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Explicador de Código — API')
        .setDescription(
          'Envie código e receba uma explicação: ideia, stack, trechos importantes e nota.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await main();
