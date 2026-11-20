import { ConsoleLogger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
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

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // atrás do Nginx: req.ip passa a ser o IP real
  app.disable('x-powered-by'); // não anuncia que é Express
  app.enableShutdownHooks();
  app.use(cookieParser());
  // Corpo JSON maior que o padrão (100 KB) para permitir colar código.
  app.useBodyParser('json', { limit: '3mb' });
  // Valida body/query/params que declaram um schema Zod.
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
