import { basename } from './languages.js';
import type { ArchitecturePattern, SourceFile } from './types.js';

interface Rule {
  name: string;
  // lista vazia = não encontrado
  detect: (ctx: Ctx) => string[];
  explanation: string;
  why: string;
}

interface Ctx {
  dirs: Set<string>; // nomes de pastas em minúsculas
  paths: string[];
  names: string[]; // nomes de arquivos em minúsculas
}

const hasDir = (ctx: Ctx, ...names: string[]) =>
  names.filter((n) => ctx.dirs.has(n));
const filesMatching = (ctx: Ctx, re: RegExp, limit = 3) =>
  ctx.paths.filter((p) => re.test(p)).slice(0, limit);

const RULES: Rule[] = [
  {
    name: 'Arquitetura modular (módulos do NestJS)',
    detect: (ctx) => {
      const mods = filesMatching(ctx, /\.module\.ts$/, 50);
      return mods.length >= 2
        ? [
            `${mods.length} arquivos *.module.ts, ex.: ${mods.slice(0, 3).join(', ')}`,
          ]
        : [];
    },
    explanation:
      'Cada funcionalidade vive no seu próprio módulo, com controller, service e DTOs juntos, e os módulos se conectam por imports/exports.',
    why: 'É o padrão recomendado pelo NestJS: fica fácil achar o código de uma funcionalidade e o projeto cresce sem virar uma "bola de lama".',
  },
  {
    name: 'Arquitetura em camadas (Controller → Service → Repository)',
    detect: (ctx) => {
      const ev: string[] = [];
      const c = filesMatching(
        ctx,
        /(controller|controllers\/|routes?\/|views\.py$)/i,
        2,
      );
      const s = filesMatching(ctx, /(service|services\/|usecases?\/)/i, 2);
      const r = filesMatching(
        ctx,
        /(repositor|dao\/|models?\/|entities\/)/i,
        2,
      );
      if (c.length && s.length) {
        ev.push(`entrada HTTP: ${c.join(', ')}`);
        ev.push(`regra de negócio: ${s.join(', ')}`);
        if (r.length) ev.push(`acesso a dados: ${r.join(', ')}`);
      }
      return ev;
    },
    explanation:
      'O código é separado por responsabilidade: controllers recebem a requisição, services aplicam as regras de negócio e repositories/models falam com o banco.',
    why: 'Cada camada tem um único motivo para mudar (princípio da responsabilidade única). Dá para testar a regra de negócio sem banco e trocar detalhes de infraestrutura com menos impacto.',
  },
  {
    name: 'Clean Architecture / Hexagonal',
    detect: (ctx) => {
      const core = hasDir(ctx, 'domain', 'dominio', 'core');
      const app = hasDir(
        ctx,
        'application',
        'usecases',
        'use-cases',
        'use_cases',
        'aplicacao',
      );
      const infra = hasDir(
        ctx,
        'infra',
        'infrastructure',
        'infraestrutura',
        'adapters',
        'ports',
      );
      return core.length && (app.length || infra.length)
        ? [`pastas: ${[...core, ...app, ...infra].join(', ')}`]
        : [];
    },
    explanation:
      'O domínio (regras de negócio) fica no centro e não depende de framework, banco ou HTTP. A infraestrutura "se pluga" por fora através de interfaces (portas e adaptadores).',
    why: 'Protege as regras de negócio de mudanças tecnológicas: trocar o banco ou o framework não exige reescrever o coração do sistema. Comum em sistemas de vida longa.',
  },
  {
    name: 'Domain-Driven Design (DDD)',
    detect: (ctx) => {
      const ev = hasDir(
        ctx,
        'aggregates',
        'value-objects',
        'valueobjects',
        'value_objects',
        'domain-events',
        'bounded-contexts',
      );
      return ev.length ? [`pastas: ${ev.join(', ')}`] : [];
    },
    explanation:
      'O código é modelado a partir da linguagem do negócio, com entidades, objetos de valor e agregados.',
    why: 'Aproxima o código de como especialistas do negócio pensam, o que ajuda em domínios complexos.',
  },
  {
    name: 'MVC (Model-View-Controller)',
    detect: (ctx) => {
      const ev = hasDir(ctx, 'models', 'views', 'controllers');
      return ev.length === 3 ? ['pastas models/, views/ e controllers/'] : [];
    },
    explanation:
      'Models representam os dados, Views mostram a interface e Controllers ligam os dois.',
    why: 'Padrão clássico e muito difundido em frameworks como Rails, Laravel e Spring MVC.',
  },
  {
    name: 'Django (MTV com apps)',
    detect: (ctx) =>
      ctx.names.includes('manage.py') && ctx.names.includes('models.py')
        ? ['manage.py e apps com models.py/views.py']
        : [],
    explanation:
      'Projeto dividido em "apps" do Django, cada um com models, views, urls e admin.',
    why: 'É a convenção do Django, que favorece apps pequenos e reutilizáveis.',
  },
  {
    name: 'CQRS (Commands e Queries separados)',
    detect: (ctx) => {
      const ev = hasDir(ctx, 'commands', 'queries');
      return ev.length === 2 ? ['pastas commands/ e queries/'] : [];
    },
    explanation:
      'Operações que alteram dados (commands) ficam separadas das que apenas leem (queries).',
    why: 'Permite otimizar leitura e escrita de forma independente e deixa a intenção de cada operação explícita.',
  },
  {
    name: 'Orientado a eventos',
    detect: (ctx) => {
      const ev = hasDir(
        ctx,
        'events',
        'listeners',
        'consumers',
        'producers',
        'subscribers',
        'jobs',
        'workers',
        'processors',
      );
      return ev.length >= 2 ? [`pastas: ${ev.join(', ')}`] : [];
    },
    explanation:
      'Partes do sistema se comunicam emitindo e reagindo a eventos ou jobs, em vez de chamadas diretas.',
    why: 'Desacopla componentes e permite processar tarefas demoradas em segundo plano.',
  },
  {
    name: 'Monorepo',
    detect: (ctx) => {
      const manifests = ctx.paths.filter((p) =>
        /(^|\/)(package\.json|pom\.xml|go\.mod|pyproject\.toml|Cargo\.toml)$/.test(
          p,
        ),
      );
      const roots = new Set(manifests.map((p) => p.split('/')[0]));
      return manifests.length >= 2 && roots.size >= 2
        ? [
            `${manifests.length} manifestos em pastas diferentes: ${manifests.slice(0, 4).join(', ')}`,
          ]
        : [];
    },
    explanation:
      'Vários projetos (ex.: backend e frontend) convivem no mesmo repositório.',
    why: 'Facilita mudanças que atravessam projetos, versionamento conjunto e compartilhamento de código.',
  },
  {
    name: 'Microsserviços',
    detect: (ctx) => {
      const dockerfiles = ctx.paths.filter((p) =>
        /(^|\/)dockerfile[^/]*$/i.test(p),
      );
      return dockerfiles.length >= 3
        ? [
            `${dockerfiles.length} Dockerfiles: ${dockerfiles.slice(0, 4).join(', ')}`,
          ]
        : [];
    },
    explanation:
      'O sistema é dividido em serviços independentes, cada um com seu próprio deploy.',
    why: 'Times diferentes podem evoluir e escalar cada serviço separadamente.',
  },
  {
    name: 'Frontend baseado em componentes',
    detect: (ctx) => {
      const ev = hasDir(
        ctx,
        'components',
        'pages',
        'hooks',
        'views',
        'layouts',
        'screens',
      );
      const jsx = ctx.paths.some((p) => /\.(tsx|jsx|vue|svelte)$/.test(p));
      return jsx && ev.length >= 1 ? [`pastas: ${ev.join(', ')}`] : [];
    },
    explanation:
      'A interface é montada com componentes reutilizáveis (botões, formulários, páginas), cada um com sua responsabilidade.',
    why: 'Reaproveitamento de UI e manutenção mais simples: arrumar um componente arruma todas as telas que o usam.',
  },
  {
    name: 'Organização por funcionalidade (feature folders)',
    detect: (ctx) =>
      hasDir(ctx, 'features', 'modules', 'domains').length
        ? [`pasta ${hasDir(ctx, 'features', 'modules', 'domains').join(', ')}/`]
        : [],
    explanation:
      'As pastas são divididas por funcionalidade de negócio (usuários, pedidos...) em vez de por tipo técnico.',
    why: 'Tudo de uma funcionalidade fica junto, o que reduz o "pula-pula" entre pastas.',
  },
  {
    name: 'Serverless',
    detect: (ctx) =>
      ctx.names.some((n) =>
        ['serverless.yml', 'vercel.json', 'netlify.toml'].includes(n),
      ) ||
      ctx.dirs.has('netlify') ||
      (ctx.dirs.has('api') && ctx.dirs.has('functions'))
        ? ['configuração de plataforma serverless']
        : [],
    explanation: 'O backend roda como funções sob demanda, sem servidor fixo.',
    why: 'Escala automaticamente e custa pouco para tráfego baixo ou irregular.',
  },
];

// só usa os caminhos: recebe o índice completo, inclusive arquivos não lidos
export function detectArchitecture(
  files: Pick<SourceFile, 'path'>[],
): ArchitecturePattern[] {
  const paths = files.map((f) => f.path);
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.toLowerCase().split('/');
    parts.pop();
    for (const d of parts) dirs.add(d);
  }
  const ctx: Ctx = {
    dirs,
    paths,
    names: paths.map((p) => basename(p).toLowerCase()),
  };
  const found: ArchitecturePattern[] = [];
  for (const rule of RULES) {
    const evidence = rule.detect(ctx);
    if (evidence.length)
      found.push({
        name: rule.name,
        evidence,
        explanation: rule.explanation,
        why: rule.why,
      });
  }
  return found;
}

// até 3 níveis, estilo `tree`
export function buildTree(
  files: Pick<SourceFile, 'path'>[],
  maxLines = 45,
): string {
  interface Node {
    children: Map<string, Node>;
    files: number;
  }
  const root: Node = { children: new Map(), files: 0 };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1 && i < 3; i++) {
      const part = parts[i];
      if (!node.children.has(part))
        node.children.set(part, { children: new Map(), files: 0 });
      node = node.children.get(part)!;
    }
    node.files++;
  }
  const lines: string[] = ['.'];
  const walk = (node: Node, prefix: string) => {
    const entries = [...node.children.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    entries.forEach(([name, child], i) => {
      if (lines.length >= maxLines) return;
      const last = i === entries.length - 1;
      const count = countFiles(child);
      lines.push(
        `${prefix}${last ? '└── ' : '├── '}${name}/  (${count} arquivo${count === 1 ? '' : 's'})`,
      );
      walk(child, prefix + (last ? '    ' : '│   '));
    });
  };
  const countFiles = (n: Node): number =>
    n.files + [...n.children.values()].reduce((s, c) => s + countFiles(c), 0);
  if (root.files)
    lines.push(
      `│   (${root.files} arquivo${root.files === 1 ? '' : 's'} na raiz)`,
    );
  walk(root, '');
  if (lines.length >= maxLines) lines.push('    …');
  return lines.join('\n');
}
