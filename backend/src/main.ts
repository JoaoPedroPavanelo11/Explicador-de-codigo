import { ConsoleLogger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Logs em JSON (fáceis de indexar) e com dados sensíveis mascarados.
    logger: new ConsoleLogger({
      json: process.env.NODE_ENV === 'production',
      redact: ['password', 'authorization', 'cookie', 'token', 'apiKey'],
    }),
  });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // atrás do Nginx: req.ip passa a ser o IP real
  app.disable('x-powered-by'); // não anuncia que é Express
  app.enableShutdownHooks();

  // Headers de segurança. A API só devolve JSON/arquivos, então a CSP
  // pode ser a mais restrita possível; o Swagger (só em dev) precisa de mais.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // CORS: só o frontend configurado pode chamar a API pelo navegador,
  // e com credenciais (o cookie do refresh token).
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
  // Corpo JSON maior que o padrão (100 KB) para permitir colar código.
  app.useBodyParser('json', { limit: '3mb' });
  // Valida body/query/params que declaram um schema Zod.
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  // Documentação interativa: só fora de produção, para não expor o mapa da API.
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

await bootstrap();
