import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  TMP_MAX_AGE_MS,
  TMP_SWEEP_EVERY_MS,
  UPLOAD_DIR,
} from './analyses.constants.js';

// Apaga da pasta temporária o código que ficou para trás: worker morto no meio
// de uma análise, pedido perdido na fila... Normalmente o próprio worker apaga
// ao terminar; a faxina é a rede de segurança para a promessa
// "o código não fica guardado" valer mesmo quando algo dá errado.
export async function sweepUploads(
  dir: string,
  maxAgeMs: number,
  now = Date.now(),
): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0; // pasta ainda não existe: nada enviado
  }
  let removed = 0;
  for (const name of names) {
    const path = join(dir, name);
    try {
      const info = await stat(path);
      if (info.isFile() && now - info.mtimeMs > maxAgeMs) {
        await unlink(path);
        removed++;
      }
    } catch {
      // apagado no meio do caminho pelo worker: tudo certo
    }
  }
  return removed;
}

// Roda só no worker (ao ligar e a cada 10 min).
@Injectable()
export class TmpJanitor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TmpJanitor.name);
  private timer?: NodeJS.Timeout;

  async onApplicationBootstrap() {
    await this.sweep();
    this.timer = setInterval(() => void this.sweep(), TMP_SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async sweep() {
    const removed = await sweepUploads(UPLOAD_DIR, TMP_MAX_AGE_MS);
    if (removed)
      this.logger.warn(
        `Faxina: ${removed} arquivo(s) de código esquecido(s) apagado(s) da pasta temporária`,
      );
  }
}
