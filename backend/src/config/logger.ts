import { ConsoleLogger } from '@nestjs/common';

// JSON em produção (fácil de indexar); o prefixo separa as linhas da API das do worker
export function createLogger(prefix: string): ConsoleLogger {
  return new ConsoleLogger({
    prefix,
    json: process.env.NODE_ENV === 'production',
    redact: ['password', 'authorization', 'cookie', 'token', 'apiKey'],
  });
}
