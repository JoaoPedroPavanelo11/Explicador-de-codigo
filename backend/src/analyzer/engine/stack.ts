import { findInCatalog } from './catalog.js';
import { languageOf, languageStats } from './languages.js';
import type { ManifestInfo } from './manifests.js';
import type { SourceFile, Technology } from './types.js';

// import -> nome no pypi, quando são diferentes
const PY_ALIASES: Record<string, string> = {
  sklearn: 'scikit-learn',
  jwt: 'pyjwt',
  dotenv: 'python-dotenv',
  telegram: 'python-telegram-bot',
  discord: 'discord.py',
  rest_framework: 'djangorestframework',
  psycopg2: 'psycopg2',
};

const JAVA_IMPORTS: [RegExp, string][] = [
  [/^org\.springframework\.boot/, 'maven:spring-boot-starter'],
  [/^org\.springframework\.web/, 'maven:spring-boot-starter-web'],
  [/^org\.springframework\.security/, 'maven:spring-boot-starter-security'],
  [/^(javax|jakarta)\.persistence/, 'maven:spring-boot-starter-data-jpa'],
  [/^(javax|jakarta)\.validation/, 'maven:spring-boot-starter-validation'],
  [/^lombok/, 'maven:lombok'],
  [/^org\.junit/, 'maven:junit-jupiter'],
  [/^org\.mockito/, 'maven:mockito-core'],
  [/^io\.jsonwebtoken/, 'maven:jjwt-api'],
];

// para trechos colados, que não têm package.json/requirements.txt
export function scanImports(files: SourceFile[]): Map<string, string> {
  const found = new Map<string, string>(); // chave do pacote → arquivo
  const note = (key: string, file: string) => {
    if (!found.has(key)) found.set(key, file);
  };
  for (const f of files) {
    const lang = languageOf(f.path);
    const c = f.content;
    if (
      lang === 'TypeScript' ||
      lang === 'JavaScript' ||
      lang === 'Vue' ||
      lang === 'Svelte'
    ) {
      for (const m of c.matchAll(
        /(?:from\s+|require\(\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g,
      )) {
        const spec = m[1];
        if (
          spec.startsWith('.') ||
          spec.startsWith('/') ||
          spec.startsWith('node:')
        )
          continue;
        const parts = spec.split('/');
        const name = spec.startsWith('@')
          ? parts.slice(0, 2).join('/')
          : parts[0];
        note(`npm:${name}`, f.path);
      }
    } else if (lang === 'Python') {
      for (const m of c.matchAll(
        /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm,
      )) {
        const top = (m[1] ?? m[2]).split('.')[0];
        if (!top) continue;
        note(`pypi:${(PY_ALIASES[top] ?? top).toLowerCase()}`, f.path);
      }
    } else if (lang === 'Java' || lang === 'Kotlin') {
      for (const m of c.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm))
        for (const [re, key] of JAVA_IMPORTS)
          if (re.test(m[1])) note(key, f.path);
    } else if (lang === 'Go') {
      for (const m of c.matchAll(/"([a-z0-9.-]+\.[a-z]+\/[^"]+)"/g)) {
        const parts = m[1].split('/');
        note(`go:${parts.slice(0, 3).join('/')}`, f.path);
      }
    }
  }
  return found;
}

export function detectTechnologies(
  files: SourceFile[],
  manifest: ManifestInfo,
): Technology[] {
  const techs: Technology[] = [];
  const byName = new Map<string, Technology>();
  const push = (t: Technology) => {
    const existing = byName.get(t.name);
    if (existing) {
      if (!existing.version && t.version) existing.version = t.version;
      return;
    }
    byName.set(t.name, t);
    techs.push(t);
  };

  const langs = languageStats(files);
  const LANG_INFO: Record<string, { description: string; why: string }> = {
    TypeScript: {
      description: 'JavaScript com tipagem estática.',
      why: 'Pega erros antes de rodar o código e deixa o autocomplete muito melhor.',
    },
    JavaScript: {
      description: 'A linguagem da web, roda no navegador e no servidor.',
      why: 'Onipresente e sem etapa de compilação.',
    },
    Python: {
      description: 'Linguagem versátil, legível e com enorme ecossistema.',
      why: 'Produtividade alta e bibliotecas para web, dados e IA.',
    },
    Java: {
      description: 'Linguagem orientada a objetos, compilada para a JVM.',
      why: 'Madura, performática e onipresente em sistemas corporativos e bancários.',
    },
    'C#': {
      description: 'Linguagem da Microsoft para a plataforma .NET.',
      why: 'Tipagem forte, ótimo desempenho e ferramentas excelentes.',
    },
    PHP: {
      description: 'Linguagem web muito usada no backend.',
      why: 'Hospedagem barata e ecossistema maduro.',
    },
  };
  for (const l of langs.filter((x) => x.percent >= 5).slice(0, 4)) {
    if (manifest.extras.some((e) => e.name === l.language)) continue;
    const info = LANG_INFO[l.language] ?? {
      description: `Linguagem usada em ${l.files} arquivo(s).`,
      why: 'Escolha da linguagem principal do projeto.',
    };
    push({
      name: l.language,
      category: 'Linguagem',
      ...info,
      source: `${l.files} arquivo(s), ${l.percent}% do código`,
    });
  }

  for (const e of manifest.extras) push(e);

  for (const p of manifest.packages) {
    const entry = findInCatalog(p.key);
    if (!entry) continue;
    push({
      name: entry.name,
      version: p.version,
      category: entry.category,
      description: entry.description,
      why: entry.why,
      source: p.source,
    });
  }

  for (const [key, file] of scanImports(files)) {
    const entry = findInCatalog(key);
    if (!entry) continue;
    push({
      name: entry.name,
      category: entry.category,
      description: entry.description,
      why: entry.why,
      source: `import em ${file}`,
    });
  }

  // monorepo costuma ter o typescript só no package.json da raiz
  if (files.some((f) => /(^|\/)tsconfig(\.\w+)?\.json$/.test(f.path)))
    push({
      name: 'TypeScript',
      category: 'Linguagem',
      description: 'JavaScript com tipagem estática.',
      why: 'Pega erros antes de rodar o código.',
      source: 'tsconfig.json',
    });

  const order = [
    'Linguagem',
    'Runtime',
    'Framework backend',
    'Framework frontend',
    'Mobile',
    'Banco de dados',
    'ORM / acesso a dados',
    'Cache',
    'Filas e mensageria',
    'Autenticação e segurança',
    'Validação',
    'Tempo real',
    'HTTP e integrações',
    'IA e dados',
    'Testes',
    'Qualidade de código',
    'Documentação',
    'Build e bundling',
    'Estilização / UI',
    'Infraestrutura e DevOps',
    'Utilitários',
  ];
  return techs.sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );
}

export function featuresFromPackages(
  manifest: ManifestInfo,
  files: SourceFile[],
): string[] {
  const keys = new Set([
    ...manifest.packages.map((p) => p.key),
    ...scanImports(files).keys(),
  ]);
  const features = new Set<string>();
  for (const key of keys) {
    const f = findInCatalog(key)?.feature;
    if (f) features.add(f);
  }
  return [...features];
}
