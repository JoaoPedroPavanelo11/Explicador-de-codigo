import type { LanguageStat, SourceFile } from './types.js';

/** Extensão → linguagem. Só entram nas estatísticas linguagens "de código". */
const CODE_LANGUAGES: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  go: 'Go',
  rs: 'Rust',
  cs: 'C#',
  php: 'PHP',
  rb: 'Ruby',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cc: 'C++',
  hpp: 'C++',
  swift: 'Swift',
  dart: 'Dart',
  scala: 'Scala',
  vue: 'Vue',
  svelte: 'Svelte',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'SCSS',
  less: 'Less',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Shell',
  ps1: 'PowerShell',
  lua: 'Lua',
  r: 'R',
  ex: 'Elixir',
  exs: 'Elixir',
  clj: 'Clojure',
  hs: 'Haskell',
  ipynb: 'Jupyter Notebook',
};

/** Arquivos de texto que lemos, mas que não contam como "código". */
const TEXT_EXTENSIONS = new Set([
  'json',
  'yml',
  'yaml',
  'toml',
  'xml',
  'md',
  'txt',
  'ini',
  'cfg',
  'conf',
  'env',
  'example',
  'gradle',
  'properties',
  'prisma',
  'graphql',
  'gql',
  'proto',
  'tf',
  'lock',
  'csproj',
  'sln',
  'mod',
  'sum',
  'dockerfile',
  'editorconfig',
  'gitignore',
  'dockerignore',
  'npmrc',
  'nvmrc',
  'rst',
]);

/** Arquivos sem extensão que reconhecemos pelo nome. */
const KNOWN_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'procfile',
  'gemfile',
  'rakefile',
  'jenkinsfile',
  'license',
  'readme',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  '.env.example',
  '.nvmrc',
]);

export function extensionOf(path: string): string {
  const base = basename(path).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

export function languageOf(path: string): string | null {
  return CODE_LANGUAGES[extensionOf(path)] ?? null;
}

/** Decide se vale a pena ler o arquivo (texto conhecido). */
export function isReadableFile(path: string): boolean {
  const base = basename(path).toLowerCase();
  if (KNOWN_FILENAMES.has(base) || base.startsWith('.env')) return true;
  if (base.startsWith('dockerfile')) return true;
  const ext = extensionOf(path);
  return ext in CODE_LANGUAGES || TEXT_EXTENSIONS.has(ext);
}

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') n++;
  return n;
}

/** Linguagens mais usadas, por linhas de código. */
export function languageStats(files: SourceFile[]): LanguageStat[] {
  const map = new Map<string, { files: number; lines: number }>();
  for (const f of files) {
    const lang = languageOf(f.path);
    if (!lang) continue;
    const cur = map.get(lang) ?? { files: 0, lines: 0 };
    cur.files++;
    cur.lines += countLines(f.content);
    map.set(lang, cur);
  }
  const total = [...map.values()].reduce((s, v) => s + v.lines, 0) || 1;
  return [...map.entries()]
    .map(([language, v]) => ({
      language,
      files: v.files,
      lines: v.lines,
      percent: Math.round((v.lines / total) * 1000) / 10,
    }))
    .sort((a, b) => b.lines - a.lines);
}

/**
 * Arquivos que não representam o código "de produção": testes, fixtures,
 * mocks, exemplos, migrations e código gerado. Eles não devem influenciar
 * a ideia do projeto nem aparecer como destaques.
 */
export function isAuxiliaryPath(path: string): boolean {
  return /(^|\/)(__tests__|__fixtures__|__mocks__|tests?|spec|fixtures?|mocks?|examples?|samples?|docs?|migrations?|generated|e2e|cypress|storybook|\.storybook)\/|\.(spec|test|stories|d)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_\w+\.py$|Tests?\.(java|cs|kt)$/i.test(
    path,
  );
}
