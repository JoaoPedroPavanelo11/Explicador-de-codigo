import { basename } from './languages.js';
import type { SourceFile, Technology } from './types.js';

export interface DeclaredPackage {
  // ex.: npm:express
  key: string;
  version?: string;
  source: string;
  dev: boolean;
}

export interface ManifestInfo {
  packages: DeclaredPackage[];
  projectName?: string;
  description?: string;
  // runtimes com versão e ferramentas de infra
  extras: Technology[];
  hasBinField: boolean;
  hasLibraryExports: boolean;
}

const cleanVersion = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  const m = v.match(/\d+(\.\d+){0,2}/);
  return m ? m[0] : undefined;
};

function safeJson(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function depth(path: string): number {
  return path.split('/').length;
}

export function parseManifests(files: SourceFile[]): ManifestInfo {
  const info: ManifestInfo = {
    packages: [],
    extras: [],
    hasBinField: false,
    hasLibraryExports: false,
  };
  // o manifesto mais perto da raiz define nome e descrição
  const sorted = [...files].sort((a, b) => depth(a.path) - depth(b.path));
  const add = (
    key: string,
    version: string | undefined,
    source: string,
    dev = false,
  ) => info.packages.push({ key, version: cleanVersion(version), source, dev });
  const extra = (t: Omit<Technology, 'source'>, source: string) => {
    if (!info.extras.some((e) => e.name === t.name))
      info.extras.push({ ...t, source });
  };

  for (const file of sorted) {
    const name = basename(file.path).toLowerCase();
    const c = file.content;

    if (name === 'package.json') {
      const pkg = safeJson(c);
      if (!pkg) continue;
      if (!info.projectName && typeof pkg.name === 'string')
        info.projectName = pkg.name;
      if (
        !info.description &&
        typeof pkg.description === 'string' &&
        pkg.description.trim()
      )
        info.description = pkg.description.trim();
      if (pkg.bin) info.hasBinField = true;
      if (pkg.main || pkg.exports || pkg.types) info.hasLibraryExports = true;
      for (const [field, dev] of [
        ['dependencies', false],
        ['devDependencies', true],
        ['peerDependencies', false],
      ] as const) {
        const deps = pkg[field];
        if (deps && typeof deps === 'object')
          for (const [dep, ver] of Object.entries(
            deps as Record<string, unknown>,
          ))
            add(
              `npm:${dep}`,
              typeof ver === 'string' ? ver : undefined,
              file.path,
              dev,
            );
      }
      const engines = pkg.engines as Record<string, string> | undefined;
      extra(
        {
          name: 'Node.js',
          version: cleanVersion(engines?.node),
          category: 'Runtime',
          description: 'Ambiente de execução JavaScript fora do navegador.',
          why: 'Permite usar a mesma linguagem no frontend e no backend, com I/O não bloqueante.',
        },
        file.path,
      );
    } else if (
      name === 'requirements.txt' ||
      name.endsWith('requirements.txt')
    ) {
      for (const line of c.split('\n')) {
        const m = line
          .trim()
          .match(/^([A-Za-z0-9_.\-[\]]+)\s*(?:[=<>~!]=?\s*([\w.*]+))?/);
        if (m && !line.trim().startsWith('#') && !line.trim().startsWith('-'))
          add(
            `pypi:${m[1].replace(/\[.*\]/, '').toLowerCase()}`,
            m[2],
            file.path,
          );
      }
      pythonExtra(extra, undefined, file.path);
    } else if (name === 'pyproject.toml') {
      const desc = c.match(/^description\s*=\s*"([^"]+)"/m);
      if (desc && !info.description) info.description = desc[1];
      const pname = c.match(/^name\s*=\s*"([^"]+)"/m);
      if (pname && !info.projectName) info.projectName = pname[1];
      // PEP 621
      const sections = c.split(/^\[/m);
      const arrays = sections.flatMap((s) => {
        if (s.startsWith('project]'))
          return [
            ...s.matchAll(/^dependencies\s*=\s*\[((?:[^\]"]|"[^"]*")*)\]/gm),
          ];
        if (/^(project\.optional-dependencies|dependency-groups)\]/.test(s))
          return [...s.matchAll(/^[\w-]+\s*=\s*\[((?:[^\]"]|"[^"]*")*)\]/gm)];
        return [];
      });
      for (const block of arrays) {
        for (const m of block[1].matchAll(
          /"([A-Za-z][A-Za-z0-9_.-]*)(?:\[[^\]]*\])?\s*(?:[=<>~!]=?\s*([\w.*]+))?[^"]*"/g,
        ))
          add(`pypi:${m[1].toLowerCase()}`, m[2], file.path);
      }
      // poetry
      for (const section of c
        .split(/^\[/m)
        .filter((s) =>
          /^tool\.poetry(\.group\.[\w-]+)?\.(dev-)?dependencies\]/.test(s),
        ))
        for (const m of section.matchAll(
          /^([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/gm,
        ))
          if (m[1] !== 'python')
            add(`pypi:${m[1].toLowerCase()}`, m[2] ?? m[3], file.path);
      const py = c.match(/(?:requires-python|python)\s*=\s*"([^"]+)"/);
      pythonExtra(extra, cleanVersion(py?.[1]), file.path);
    } else if (name === 'pom.xml') {
      for (const m of c.matchAll(
        /<(?:dependency|parent|plugin)>([\s\S]*?)<\/(?:dependency|parent|plugin)>/g,
      )) {
        const artifact = m[1].match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
        const version = m[1].match(/<version>([^<$]+)<\/version>/)?.[1];
        if (artifact) add(`maven:${artifact}`, version, file.path);
      }
      const javaV =
        c.match(/<java\.version>([^<]+)<\/java\.version>/)?.[1] ??
        c.match(/<maven\.compiler\.(?:source|release)>([^<]+)</)?.[1];
      javaExtra(extra, cleanVersion(javaV), file.path);
      const artifactName = c.match(
        /<\/parent>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/,
      )?.[1];
      if (artifactName && !info.projectName) info.projectName = artifactName;
      const d = c.match(/<description>([^<]+)<\/description>/)?.[1];
      if (d && !info.description) info.description = d.trim();
    } else if (name === 'build.gradle' || name === 'build.gradle.kts') {
      for (const m of c.matchAll(
        /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|annotationProcessor)\s*\(?\s*["']([^:"']+):([^:"']+)(?::([^"']+))?["']/g,
      ))
        add(`maven:${m[2]}`, m[3], file.path);
      const boot = c.match(
        /org\.springframework\.boot["']?\)?\s*version\s*["']([^"']+)["']/,
      );
      if (boot) add('maven:spring-boot-starter', boot[1], file.path);
      const jv = c.match(
        /(?:sourceCompatibility|languageVersion\.set\(JavaLanguageVersion\.of\()\s*=?\s*['"]?(?:JavaVersion\.VERSION_)?(\d+)/,
      );
      javaExtra(extra, jv?.[1], file.path);
      if (name.endsWith('.kts'))
        extra(
          {
            name: 'Kotlin',
            category: 'Linguagem',
            description: 'Linguagem moderna da JVM.',
            why: 'Mais concisa e segura contra null do que Java.',
          },
          file.path,
        );
    } else if (name === 'go.mod') {
      const goV = c.match(/^go\s+(\S+)/m)?.[1];
      const mod = c.match(/^module\s+(\S+)/m)?.[1];
      if (mod && !info.projectName) info.projectName = mod.split('/').pop();
      extra(
        {
          name: 'Go',
          version: goV,
          category: 'Linguagem',
          description: 'Linguagem compilada do Google, simples e concorrente.',
          why: 'Binários rápidos, deploy simples e goroutines para concorrência.',
        },
        file.path,
      );
      for (const m of c.matchAll(
        /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v([\w.\-+]+)/gm,
      ))
        add(`go:${m[1]}`, m[2], file.path);
    } else if (name === 'cargo.toml') {
      const section = c.split(/^\[dependencies\]/m)[1]?.split(/^\[/m)[0] ?? '';
      for (const m of section.matchAll(
        /^([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/gm,
      ))
        add(`cargo:${m[1]}`, m[2] ?? m[3], file.path);
      extra(
        {
          name: 'Rust',
          category: 'Linguagem',
          description:
            'Linguagem de sistemas com segurança de memória sem garbage collector.',
          why: 'Desempenho de C/C++ com o compilador evitando classes inteiras de bugs.',
        },
        file.path,
      );
      const pn = c.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      if (pn && !info.projectName) info.projectName = pn;
    } else if (name === 'composer.json') {
      const pkg = safeJson(c);
      for (const field of ['require', 'require-dev'])
        for (const [dep, ver] of Object.entries(
          (pkg?.[field] as Record<string, string>) ?? {},
        ))
          if (dep === 'php')
            extra(
              {
                name: 'PHP',
                version: cleanVersion(ver),
                category: 'Linguagem',
                description: 'Linguagem web muito usada no backend.',
                why: 'Hospedagem barata e ecossistema maduro.',
              },
              file.path,
            );
          else add(`composer:${dep}`, ver, file.path);
    } else if (name === 'gemfile') {
      for (const m of c.matchAll(
        /^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/gm,
      ))
        add(`gem:${m[1]}`, m[2], file.path);
      extra(
        {
          name: 'Ruby',
          category: 'Linguagem',
          description: 'Linguagem dinâmica focada na produtividade.',
          why: 'Sintaxe expressiva e agradável de ler.',
        },
        file.path,
      );
    } else if (name.endsWith('.csproj')) {
      for (const m of c.matchAll(
        /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g,
      ))
        add(`nuget:${m[1]}`, m[2], file.path);
      const tf = c.match(
        /<TargetFramework>net(\d+\.\d+)<\/TargetFramework>/,
      )?.[1];
      extra(
        {
          name: '.NET',
          version: tf,
          category: 'Runtime',
          description: 'Plataforma de desenvolvimento da Microsoft.',
          why: 'Alto desempenho, tipagem forte e ferramentas excelentes.',
        },
        file.path,
      );
      if (/Microsoft\.NET\.Sdk\.Web/.test(c))
        add('nuget:Microsoft.AspNetCore', tf, file.path);
    } else if (name === 'pubspec.yaml') {
      add('pub:flutter', undefined, file.path);
    } else if (name.startsWith('dockerfile')) {
      extra(
        {
          name: 'Docker',
          category: 'Infraestrutura e DevOps',
          description: 'Empacota a aplicação em containers.',
          why: 'Garante que o projeto roda igual em qualquer máquina ("na minha máquina funciona" deixa de existir).',
        },
        file.path,
      );
      for (const m of c.matchAll(
        /^FROM\s+(?:--platform=\S+\s+)?([^\s:]+)(?::(\S+))?/gim,
      )) {
        const image = m[1].replace(/^docker\.io\/(library\/)?/, '');
        add(`docker:${image}`, m[2], file.path);
      }
    } else if (/^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(name)) {
      extra(
        {
          name: 'Docker Compose',
          category: 'Infraestrutura e DevOps',
          description:
            'Sobe vários containers (app, banco, cache) com um comando.',
          why: 'Facilita reproduzir toda a infraestrutura localmente.',
        },
        file.path,
      );
      for (const m of c.matchAll(
        /^\s*image:\s*["']?([^\s:"']+)(?::([^\s"']+))?/gm,
      ))
        add(
          `docker:${m[1].replace(/^docker\.io\/(library\/)?/, '')}`,
          m[2],
          file.path,
        );
    } else if (
      file.path.includes('.github/workflows/') &&
      /\.ya?ml$/.test(name)
    ) {
      extra(
        {
          name: 'GitHub Actions',
          category: 'Infraestrutura e DevOps',
          description: 'Integração contínua (CI) no GitHub.',
          why: 'Roda testes e build automaticamente a cada push, evitando que erros cheguem à main.',
        },
        file.path,
      );
    } else if (name === '.gitlab-ci.yml' || name === 'jenkinsfile') {
      extra(
        {
          name: name === 'jenkinsfile' ? 'Jenkins' : 'GitLab CI',
          category: 'Infraestrutura e DevOps',
          description: 'Pipeline de integração contínua.',
          why: 'Automatiza testes e deploy.',
        },
        file.path,
      );
    } else if (name.endsWith('.tf')) {
      extra(
        {
          name: 'Terraform',
          category: 'Infraestrutura e DevOps',
          description: 'Infraestrutura como código.',
          why: 'A infraestrutura fica versionada e reproduzível.',
        },
        file.path,
      );
    } else if (
      /\.ya?ml$/.test(name) &&
      /^kind:\s*(Deployment|Service|Ingress|StatefulSet)/m.test(c) &&
      /^apiVersion:/m.test(c)
    ) {
      extra(
        {
          name: 'Kubernetes',
          category: 'Infraestrutura e DevOps',
          description: 'Orquestração de containers.',
          why: 'Escala e reinicia a aplicação automaticamente.',
        },
        file.path,
      );
    } else if (name === 'schema.prisma') {
      const provider = c.match(
        /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/,
      )?.[1];
      if (provider === 'postgresql')
        add('docker:postgres', undefined, file.path);
      if (provider === 'mysql') add('docker:mysql', undefined, file.path);
      if (provider === 'mongodb') add('docker:mongo', undefined, file.path);
      if (provider === 'sqlite') add('npm:sqlite3', undefined, file.path);
    } else if (
      name === 'serverless.yml' ||
      name === 'vercel.json' ||
      name === 'netlify.toml'
    ) {
      extra(
        {
          name: 'Serverless / Plataforma de deploy',
          category: 'Infraestrutura e DevOps',
          description: 'Deploy em funções ou plataforma gerenciada.',
          why: 'Sem servidores para administrar; paga-se pelo uso.',
        },
        file.path,
      );
    }
  }
  return info;
}

function pythonExtra(
  extra: (t: Omit<Technology, 'source'>, s: string) => void,
  version: string | undefined,
  source: string,
) {
  extra(
    {
      name: 'Python',
      version,
      category: 'Linguagem',
      description: 'Linguagem versátil, legível e com enorme ecossistema.',
      why: 'Produtividade alta e bibliotecas para web, dados e IA.',
    },
    source,
  );
}

function javaExtra(
  extra: (t: Omit<Technology, 'source'>, s: string) => void,
  version: string | undefined,
  source: string,
) {
  extra(
    {
      name: 'Java',
      version,
      category: 'Linguagem',
      description: 'Linguagem orientada a objetos, compilada para a JVM.',
      why: 'Madura, performática e onipresente em sistemas corporativos e bancários.',
    },
    source,
  );
}
