import { isReadableFile } from './languages.js';
import type { SourceFile } from './types.js';

export interface IngestLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: IngestLimits = {
  maxFiles: 1500,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
};

/** Pastas que nunca analisamos: dependências, builds, caches. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'bin',
  'obj',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.next',
  '.nuxt',
  'coverage',
  '.idea',
  '.vscode',
  '.gradle',
  '.mvn',
  'bower_components',
  '.cache',
  '.turbo',
  '.pytest_cache',
  '.mypy_cache',
  'site-packages',
  'Pods',
  '.dart_tool',
  'generated',
  '.terraform',
]);

const IGNORED_FILES =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum|.*\.min\.(js|css)|.*\.map)$/i;

export class IngestError extends Error {}

/**
 * Normaliza e valida um caminho vindo de fora (upload, zip, JSON).
 * Bloqueia path traversal ("../"), caminhos absolutos e caracteres estranhos.
 * Retorna null para caminhos que devem ser ignorados.
 */
export function normalizePath(raw: string): string | null {
  if (raw.includes('\0')) return null;
  const unified = raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) return null;
  const parts = unified.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.length === 0 || parts.some((p) => p === '..')) return null;
  if (parts.some((p) => IGNORED_DIRS.has(p))) return null;
  // Ignora metadados do macOS dentro de zips.
  if (parts[0] === '__MACOSX' || parts[parts.length - 1].startsWith('._'))
    return null;
  const path = parts.join('/');
  return path.length <= 300 ? path : null;
}

/** Heurística simples: arquivos com byte nulo são binários. */
export function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  return sample.includes(0);
}

export interface NormalizeResult {
  files: SourceFile[];
  skipped: number;
}

/**
 * Recebe arquivos crus (de qualquer origem) e devolve só o que vale analisar,
 * respeitando os limites — a proteção contra entradas gigantes acontece aqui.
 */
export function normalizeFiles(
  raw: { path: string; content: string | Buffer }[],
  limits: IngestLimits = DEFAULT_LIMITS,
): NormalizeResult {
  const files: SourceFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  let skipped = 0;
  for (const r of raw) {
    const path = normalizePath(r.path);
    if (
      !path ||
      seen.has(path) ||
      IGNORED_FILES.test(path) ||
      !isReadableFile(path)
    ) {
      skipped++;
      continue;
    }
    const buf =
      typeof r.content === 'string'
        ? Buffer.from(r.content, 'utf8')
        : r.content;
    if (buf.length > limits.maxFileBytes || looksBinary(buf)) {
      skipped++;
      continue;
    }
    total += buf.length;
    if (total > limits.maxTotalBytes)
      throw new IngestError(
        `O código passa do limite de ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB de texto.`,
      );
    if (files.length >= limits.maxFiles)
      throw new IngestError(
        `O projeto passa do limite de ${limits.maxFiles} arquivos analisáveis.`,
      );
    seen.add(path);
    files.push({ path, content: buf.toString('utf8').replace(/\r\n/g, '\n') });
  }
  if (files.length === 0)
    throw new IngestError(
      'Não encontrei nenhum arquivo de código para analisar.',
    );
  return { files, skipped };
}
