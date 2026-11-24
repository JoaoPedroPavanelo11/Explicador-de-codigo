import yauzl from 'yauzl';
import {
  IngestError,
  type IngestLimits,
} from '../analyzer/engine/normalize.js';
import { triage, type Triage } from './triage.js';

export interface ZipLimits extends IngestLimits {
  // teto de entradas no índice (inclui lixo); só barra zips absurdos
  maxEntries: number;
}

export interface RawFile {
  path: string;
  content: Buffer;
}

export interface ZipResult {
  files: RawFile[];
  triage: Triage;
  // descartados sem abrir: irrelevantes, symlinks e grandes demais
  skipped: number;
  // comentário do zip; no zip do GitHub é o SHA do commit
  comment: string;
}

// PK\x03\x04, ou PK\x05\x06 em zip vazio
export function isZip(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05) &&
    (buf[3] === 0x04 || buf[3] === 0x06)
  );
}

const MB = 1024 * 1024;

// Extrai em memória, em duas fases:
//   1. lê só o índice do zip (nomes e tamanhos) e faz a triagem
//   2. descompacta apenas os arquivos escolhidos, um por vez
// O tamanho declarado no índice pode mentir (zip bomb), então na fase 2 os
// bytes reais também são contados e o zip é recusado se passar do declarado.
export async function extractZip(
  buffer: Buffer,
  limits: ZipLimits,
): Promise<ZipResult> {
  if (!isZip(buffer))
    throw new IngestError('O arquivo enviado não é um .zip válido.');

  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      autoClose: false, // a fase 2 ainda precisa do zip aberto
      validateEntrySizes: true, // erro se o tamanho real divergir do declarado
      strictFileNames: false,
    });
  } catch {
    throw new IngestError(
      'Não foi possível abrir o .zip (arquivo corrompido?).',
    );
  }

  try {
    if (zip.entryCount > limits.maxEntries)
      throw new IngestError(
        `O .zip tem ${zip.entryCount.toLocaleString('pt-BR')} entradas; o limite é ${limits.maxEntries.toLocaleString('pt-BR')}.`,
      );

    // fase 1: índice
    const entries = await listEntries(zip);
    let symlinks = 0;
    const candidates = entries.filter((e) => {
      if (e.fileName.endsWith('/')) return false; // pasta
      // modo unix nos 16 bits altos; 0o120000 = symlink
      if (((e.externalFileAttributes >>> 16) & 0o170000) === 0o120000) {
        symlinks++;
        return false;
      }
      return true;
    });
    const plan = triage(
      candidates.map((e) => ({ name: e.fileName, size: e.uncompressedSize })),
      limits,
    );

    // fase 2: só o que a triagem escolheu
    const files: RawFile[] = [];
    let total = 0;
    for (const entry of candidates) {
      const path = plan.toRead.get(entry.fileName);
      if (!path) continue;
      const content = await readEntry(zip, entry, limits.maxFileBytes);
      total += content.length;
      if (total > limits.maxTotalBytes) throw zipBomb(limits);
      files.push({ path, content });
    }

    return {
      files,
      triage: plan,
      skipped: plan.ignored + plan.oversized + symlinks,
      comment: zip.comment,
    };
  } catch (error) {
    throw toIngestError(error, limits);
  } finally {
    zip.close();
  }
}

function listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('error', reject);
    zip.on('end', () => resolve(entries));
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.readEntry();
  });
}

async function readEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytes: number,
): Promise<Buffer> {
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxBytes) {
      stream.destroy();
      throw new ZipBombSignal();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

class ZipBombSignal extends Error {}

function zipBomb(limits: IngestLimits): IngestError {
  return new IngestError(
    `O .zip declara tamanhos menores do que o conteúdo real (possível "zip bomb") ou passa de ${Math.round(limits.maxTotalBytes / MB)} MB descompactado, e foi recusado por segurança.`,
  );
}

function toIngestError(error: unknown, limits: IngestLimits): IngestError {
  if (error instanceof IngestError) return error;
  if (error instanceof ZipBombSignal) return zipBomb(limits);
  const message = error instanceof Error ? error.message : '';
  // o yauzl já recusa "../" e caminho absoluto (zip slip)
  if (/relative path|absolute path|invalid characters/i.test(message))
    return new IngestError(
      'O .zip contém caminhos inválidos (como "../") e foi recusado por segurança.',
    );
  // validateEntrySizes: tamanho real diferente do declarado
  if (/too many bytes|too few bytes/i.test(message)) return zipBomb(limits);
  return new IngestError('Falha ao ler o .zip.');
}
