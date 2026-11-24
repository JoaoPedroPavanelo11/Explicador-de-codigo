import {
  basename,
  isAuxiliaryPath,
  isReadableFile,
  isTestPath,
  languageOf,
} from '../analyzer/engine/languages.js';
import {
  isIgnoredFile,
  normalizePath,
  type IngestLimits,
} from '../analyzer/engine/normalize.js';

// Triagem: decide o que ler olhando só o índice do .zip (nome e tamanho
// declarado de cada arquivo). Nada é descompactado aqui.
//
// 1. descarta o que não ajuda a explicar nem a dar nota (node_modules, dist,
//    imagens, lockfiles, minificados...)
// 2. regra do tamanho por arquivo: acima do teto, descarta só aquele arquivo
// 3. regras da quantidade e do total: se o projeto não couber, lê os arquivos
//    mais importantes até encher o orçamento (visão panorâmica)

export interface ZipEntryInfo {
  name: string; // como está no zip
  size: number; // tamanho descompactado declarado no índice
}

export interface Triage {
  // nome no zip -> caminho normalizado (sem a pasta raiz)
  toRead: Map<string, string>;
  // todos os arquivos relevantes, lidos ou não
  inventory: string[];
  // descartados sem abrir por não serem relevantes
  ignored: number;
  // relevantes, mas acima do teto por arquivo
  oversized: number;
  // relevantes que não couberam no orçamento
  leftOut: number;
}

// arquivos que dizem o que o projeto é: alimentam a ideia e a stack
const KEY_FILE =
  /^(readme(\.\w+)?|package\.json|pyproject\.toml|requirements[\w.-]*\.txt|setup\.(py|cfg)|pipfile|go\.mod|cargo\.toml|pom\.xml|(build|settings)\.gradle(\.kts)?|composer\.json|gemfile|.+\.csproj|pubspec\.yaml|mix\.exs|dockerfile.*|(docker-)?compose[\w.-]*\.ya?ml|schema\.prisma|tsconfig\.json|nest-cli\.json|angular\.json|(vite|next|nuxt)\.config\.\w+|\.env\.example)$/i;

// menor = mais importante
export function priorityOf(path: string): number {
  if (KEY_FILE.test(basename(path)) || path.startsWith('.github/workflows/'))
    return 0;
  if (languageOf(path) && !isAuxiliaryPath(path)) return 1; // código do produto
  if (isTestPath(path)) return 2;
  return 3; // documentação, json, exemplos, fixtures...
}

const depthOf = (path: string) => path.split('/').length;

// pastas que fazem parte do projeto, não são "a pasta do zip"
const CODE_DIRS = new Set([
  'src',
  'lib',
  'app',
  'apps',
  'packages',
  'source',
  'test',
  'tests',
  'pkg',
  'cmd',
  'internal',
]);

// repo-main/src/x.ts -> "repo-main" (zip do GitHub sempre tem essa pasta).
// Um zip só com src/... mantém o src: ele diz algo sobre a estrutura.
function commonRoot(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const first = paths[0].split('/')[0];
  if (CODE_DIRS.has(first.toLowerCase())) return null;
  return paths.every((p) => p.startsWith(`${first}/`)) ? first : null;
}

export function triage(entries: ZipEntryInfo[], limits: IngestLimits): Triage {
  let ignored = 0;
  let oversized = 0;
  const relevant: { name: string; path: string; size: number }[] = [];

  const normalized = entries.map((e) => ({ ...e, path: normalizePath(e.name) }));
  const root = commonRoot(
    normalized.flatMap((e) => (e.path ? [e.path] : [])),
  );

  for (const e of normalized) {
    if (!e.path) {
      ignored++;
      continue;
    }
    const path = root ? e.path.slice(root.length + 1) : e.path;
    if (!path || isIgnoredFile(path) || !isReadableFile(path)) {
      ignored++;
      continue;
    }
    relevant.push({ name: e.name, path, size: e.size });
  }

  // importantes primeiro; no mesmo nível, os mais rasos (cobrem mais pastas do
  // projeto que mergulhar fundo numa só) e depois ordem alfabética, para o
  // resultado ser sempre o mesmo para o mesmo zip
  relevant.sort(
    (a, b) =>
      priorityOf(a.path) - priorityOf(b.path) ||
      depthOf(a.path) - depthOf(b.path) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );

  const toRead = new Map<string, string>();
  let total = 0;
  let leftOut = 0;
  for (const r of relevant) {
    if (r.size > limits.maxFileBytes) {
      oversized++;
      continue;
    }
    // sem break: um arquivo grande que não coube não impede os menores depois
    if (toRead.size < limits.maxFiles && total + r.size <= limits.maxTotalBytes) {
      toRead.set(r.name, r.path);
      total += r.size;
    } else leftOut++;
  }

  return {
    toRead,
    inventory: relevant.map((r) => r.path),
    ignored,
    oversized,
    leftOut,
  };
}
