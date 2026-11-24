// Limpeza ÚNICA do código que versões antigas deixaram no Redis.
//
// Até a v1.1 o código colado viajava dentro do pedido na fila. Pedidos que
// falharam ficavam guardados (removeOnFail: 100) e o arquivo de persistência
// do Redis (AOF) guardava até os que já tinham sido apagados.
//
// Este script:
//   1. apaga os pedidos concluídos e os que falharam;
//   2. pede ao Redis para reescrever o AOF (BGREWRITEAOF), que passa a conter
//      só o estado atual, sem o histórico onde o código aparecia.
//
// Rodar com a fila vazia (sem análises em andamento), dentro do worker:
//   docker compose exec worker node dist/scripts/purge-queue.js
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ANALYSIS_QUEUE } from '../analyses/analyses.constants.js';

async function main() {
  const connection = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(ANALYSIS_QUEUE, { connection });
  try {
    const pending = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    const busy = Object.values(pending).reduce((a, b) => a + b, 0);
    if (busy > 0) {
      console.error(
        `Há ${busy} análise(s) na fila ou em andamento. Espere terminarem e rode de novo.`,
      );
      process.exitCode = 1;
      return;
    }
    const failed = await queue.clean(0, 100_000, 'failed');
    const completed = await queue.clean(0, 100_000, 'completed');
    console.log(
      `Pedidos apagados: ${failed.length} que falharam, ${completed.length} concluídos.`,
    );

    await connection.bgrewriteaof();
    console.log(
      'Reescrita do arquivo de persistência (AOF) iniciada; leva poucos segundos.',
    );
  } finally {
    await queue.close();
    // o bullmq não fecha conexão recebida de fora
    await connection.quit();
  }
}

void main();
