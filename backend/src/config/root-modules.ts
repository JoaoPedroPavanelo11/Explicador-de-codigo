import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { validateEnv, type Env } from './env.js';

// módulos de raiz usados tanto pela API (AppModule) quanto pelo worker (WorkerModule)

export const ConfigRootModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});

export const QueueRootModule = BullModule.forRootAsync({
  inject: [ConfigService],
  // bullmq 6 em ESM só aceita instância pronta do ioredis
  useFactory: (config: ConfigService<Env, true>) => ({
    connection: new Redis({
      host: config.get('REDIS_HOST', { infer: true }),
      port: config.get('REDIS_PORT', { infer: true }),
      password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
      maxRetriesPerRequest: null, // exigido pelo worker do bullmq
      // IPv4 ou IPv6: a rede privada do Railway (*.railway.internal) pode ser só IPv6
      family: 0,
    }),
  }),
});
