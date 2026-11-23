import { isReadableFile } from './languages.js';
import type { SourceFile } from './types.js';

export interface IngestLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

// As 3 regras. Por arquivo: código escrito à mão quase nunca passa de 200 KB;
// acima de 512 KB é quase sempre gerado (bundle, dump), que não ensina nada.
// Total: 40 MB de texto cabem ~5.000 arquivos de tamanho típico (~8 KB) e mantêm
// a memória de um job abaixo de ~250 MB.
export const DEFAULT_LIMITS: IngestLimits = {
  maxFiles: 5000,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
};

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

// lockfiles, minificados e source maps: texto, mas gerado por ferramenta
export function isIgnoredFile(path: string): boolean {
  return IGNORED_FILES.test(path);
}

export class IngestError extends Error {}

// null = ignorar. Bloqueia "../", caminho absoluto e byte nulo.
export function normalizePath(raw: string): string | null {
  if (raw.includes('\0')) return null;
  const unified = raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) return null;
  const parts = unified.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.length === 0 || parts.some((p) => p === '..')) return null;
  if (parts.some((p) => IGNORED_DIRS.has(p))) return null;
  // lixo do macOS em zips
  if (parts[0] === '__MACOSX' || parts[parts.length - 1].startsWith('._'))
    return null;
  const path = parts.join('/');
  return path.length <= 300 ? path : null;
}

export function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  return sample.includes(0);
}

// O que a triagem do .zip descobriu sobre o projeto inteiro, além do que foi lido
export interface Coverage {
  // caminho de todos os arquivos relevantes, lidos ou não
  inventory: string[];
  // relevantes, mas acima do teto por arquivo: descartados sem abrir
  oversized: number;
  // relevantes que ficaram fora do orçamento (visão panorâmica)
  leftOut: number;
}

export interface NormalizeResult {
  files: SourceFile[];
  skipped: number;
  coverage?: Coverage;
}

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
      isIgnoredFile(path) ||
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
