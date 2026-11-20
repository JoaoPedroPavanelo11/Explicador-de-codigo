import yauzl from 'yauzl';
import { IngestError, normalizePath } from '../analyzer/engine/normalize.js';

export interface ZipLimits {
  /** Máximo de entradas no zip (arquivos + pastas). */
  maxEntries: number;
  /** Máximo de bytes DESCOMPACTADOS somando todos os arquivos lidos. */
  maxTotalBytes: number;
  /** Máximo de bytes descompactados por arquivo. */
  maxFileBytes: number;
}

export interface RawFile {
  path: string;
  content: Buffer;
}

/** Assinatura de arquivos zip: "PK\x03\x04" (ou "PK\x05\x06" para zip vazio). */
export function isZip(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05) &&
    (buf[3] === 0x04 || buf[3] === 0x06)
  );
}

/**
 * Extrai um .zip em memória com várias proteções:
 *
 * - **Zip bomb**: um zip de 1 MB pode virar 10 GB. Não confiamos no tamanho
 *   declarado no cabeçalho (pode ser falso): contamos os bytes de verdade
 *   enquanto descompactamos e abortamos ao passar do limite.
 * - **Zip slip / path traversal**: nomes como "../../etc/passwd" são
 *   descartados por normalizePath(); nada é escrito em disco.
 * - **Links simbólicos** são ignorados.
 * - **Muitas entradas**: limite de quantidade antes de começar a ler.
 */
export async function extractZip(
  buffer: Buffer,
  limits: ZipLimits,
  shouldRead: (path: string) => boolean,
): Promise<{ files: RawFile[]; skipped: number }> {
  if (!isZip(buffer))
    throw new IngestError('O arquivo enviado não é um .zip válido.');

  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      validateEntrySizes: true, // erro se o tamanho real divergir do declarado
      strictFileNames: false,
    });
  } catch {
    throw new IngestError(
      'Não foi possível abrir o .zip (arquivo corrompido?).',
    );
  }

  if (zip.entryCount > limits.maxEntries) {
    zip.close();
    throw new IngestError(
      `O .zip tem ${zip.entryCount} entradas; o limite é ${limits.maxEntries}.`,
    );
  }

  const files: RawFile[] = [];
  let total = 0;
  let skipped = 0;

  return new Promise((resolve, reject) => {
    const fail = (err: Error) => {
      zip.close();
      if (err instanceof IngestError) return reject(err);
      // O yauzl recusa nomes com "../" ou caminhos absolutos (zip slip).
      if (/relative path|absolute path|invalid characters/i.test(err.message))
        return reject(
          new IngestError(
            'O .zip contém caminhos inválidos (como "../") e foi recusado por segurança.',
          ),
        );
      reject(new IngestError('Falha ao ler o .zip.'));
    };

    zip.on('error', fail);
    zip.on('end', () => resolve({ files, skipped }));
    zip.on('entry', (entry: yauzl.Entry) => {
      const isDir = entry.fileName.endsWith('/');
      // Bits de modo Unix ficam nos 16 bits altos: 0o120000 = link simbólico.
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      const path = normalizePath(entry.fileName);
      if (
        isDir ||
        mode === 0o120000 ||
        !path ||
        !shouldRead(path) ||
        entry.uncompressedSize > limits.maxFileBytes
      ) {
        if (!isDir) skipped++;
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err) return fail(err);
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          total += chunk.length;
          if (size > limits.maxFileBytes || total > limits.maxTotalBytes) {
            stream.destroy();
            fail(
              new IngestError(
                `O conteúdo descompactado passa do limite de ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB.`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        stream.on('error', fail);
        stream.on('end', () => {
          files.push({ path, content: Buffer.concat(chunks) });
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

/**
 * Zips do GitHub (e muitos outros) colocam tudo dentro de uma pasta raiz
 * ("repo-main/src/..."). Removemos essa pasta para os caminhos ficarem limpos.
 */
export function stripCommonRoot(files: RawFile[]): RawFile[] {
  if (files.length === 0) return files;
  const first = files[0].path.split('/')[0];
  const allShare = files.every((f) => f.path.startsWith(`${first}/`));
  if (!allShare) return files;
  return files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) }));
}
