import { basename, isAuxiliaryPath, languageOf } from './languages.js';
import type { ManifestInfo } from './manifests.js';
import type { Endpoint, IdeaSection, SourceFile, Technology } from './types.js';

interface Domain {
  id: string;
  label: string;
  keywords: string[];
  description: string;
  audience: string;
}

// palavras em pt e en, procuradas em caminhos, declarações, rotas e README
const DOMAINS: Domain[] = [
  {
    id: 'banking',
    label: 'bancário / financeiro',
    keywords: [
      'account',
      'accounts',
      'conta',
      'contas',
      'transfer',
      'transfers',
      'transferencia',
      'balance',
      'saldo',
      'pix',
      'deposit',
      'deposito',
      'withdraw',
      'withdrawal',
      'saque',
      'bank',
      'banco',
      'banking',
      'wallet',
      'carteira',
      'transaction',
      'transactions',
      'transacao',
      'extrato',
      'statement',
      'loan',
      'emprestimo',
      'agencia',
      'iban',
      'ledger',
      'boleto',
    ],
    description:
      'Lida com dinheiro: contas, saldos e movimentações financeiras',
    audience:
      'bancos digitais, fintechs e seus clientes — pessoas que precisam movimentar dinheiro com segurança, consistência e histórico confiável',
  },
  {
    id: 'ecommerce',
    label: 'e-commerce / vendas',
    keywords: [
      'product',
      'products',
      'produto',
      'produtos',
      'cart',
      'carrinho',
      'order',
      'orders',
      'pedido',
      'pedidos',
      'checkout',
      'catalog',
      'catalogo',
      'inventory',
      'estoque',
      'coupon',
      'cupom',
      'shipping',
      'frete',
      'sku',
      'store',
      'loja',
      'payment',
      'pagamento',
    ],
    description: 'Gerencia produtos, carrinho, pedidos e pagamentos',
    audience:
      'lojas virtuais e seus clientes — quem vende precisa gerenciar catálogo e pedidos, e quem compra precisa de uma jornada simples até o pagamento',
  },
  {
    id: 'health',
    label: 'saúde',
    keywords: [
      'patient',
      'patients',
      'paciente',
      'pacientes',
      'doctor',
      'doctors',
      'medico',
      'medicos',
      'appointment',
      'appointments',
      'consulta',
      'consultas',
      'prescription',
      'receita',
      'hospital',
      'clinic',
      'clinica',
      'exam',
      'exame',
      'prontuario',
      'medical',
      'health',
      'saude',
    ],
    description: 'Organiza pacientes, profissionais de saúde e atendimentos',
    audience:
      'clínicas, hospitais e profissionais de saúde que precisam organizar atendimentos e dados de pacientes com privacidade',
  },
  {
    id: 'education',
    label: 'educação',
    keywords: [
      'course',
      'courses',
      'curso',
      'cursos',
      'student',
      'students',
      'aluno',
      'alunos',
      'lesson',
      'lessons',
      'aula',
      'aulas',
      'teacher',
      'professor',
      'enrollment',
      'matricula',
      'quiz',
      'classroom',
      'turma',
      'school',
      'escola',
      'grade',
      'boletim',
    ],
    description: 'Gerencia cursos, alunos, aulas e avaliações',
    audience: 'escolas, plataformas de ensino, professores e alunos',
  },
  {
    id: 'tasks',
    label: 'produtividade / gestão de tarefas',
    keywords: [
      'task',
      'tasks',
      'tarefa',
      'tarefas',
      'todo',
      'todos',
      'board',
      'kanban',
      'sprint',
      'deadline',
      'prazo',
      'checklist',
      'project',
      'projects',
      'projeto',
    ],
    description: 'Organiza tarefas, projetos e prazos',
    audience:
      'pessoas e equipes que querem organizar o trabalho e acompanhar o andamento das atividades',
  },
  {
    id: 'social',
    label: 'rede social / conteúdo',
    keywords: [
      'post',
      'posts',
      'comment',
      'comments',
      'comentario',
      'like',
      'likes',
      'follow',
      'follower',
      'followers',
      'seguidor',
      'feed',
      'profile',
      'perfil',
      'article',
      'articles',
      'artigo',
      'blog',
      'tweet',
      'timeline',
    ],
    description: 'Publicação de conteúdo e interação entre pessoas',
    audience:
      'comunidades e criadores de conteúdo, e o público que consome e interage com essas publicações',
  },
  {
    id: 'chat',
    label: 'comunicação / chat',
    keywords: [
      'message',
      'messages',
      'mensagem',
      'mensagens',
      'chat',
      'room',
      'rooms',
      'sala',
      'conversation',
      'conversa',
      'inbox',
      'notification',
      'notificacao',
    ],
    description: 'Troca de mensagens entre usuários',
    audience: 'pessoas ou equipes que precisam se comunicar em tempo real',
  },
  {
    id: 'delivery',
    label: 'restaurantes / delivery',
    keywords: [
      'restaurant',
      'restaurante',
      'menu',
      'cardapio',
      'delivery',
      'entrega',
      'dish',
      'prato',
      'courier',
      'entregador',
      'food',
      'comida',
      'mesa',
    ],
    description: 'Cardápios, pedidos de comida e entregas',
    audience: 'restaurantes, entregadores e clientes que pedem comida',
  },
  {
    id: 'scheduling',
    label: 'agendamentos / reservas',
    keywords: [
      'schedule',
      'schedules',
      'agenda',
      'agendamento',
      'booking',
      'bookings',
      'reserva',
      'reservas',
      'slot',
      'slots',
      'availability',
      'horario',
      'calendar',
      'calendario',
    ],
    description: 'Controle de horários, agendas e reservas',
    audience:
      'negócios que atendem com hora marcada (salões, consultórios, quadras) e seus clientes',
  },
  {
    id: 'hr',
    label: 'recursos humanos',
    keywords: [
      'employee',
      'employees',
      'funcionario',
      'funcionarios',
      'payroll',
      'folha',
      'department',
      'departamento',
      'vacation',
      'ferias',
      'candidate',
      'candidato',
      'vaga',
      'vagas',
      'job',
      'jobs',
      'recruitment',
      'colaborador',
    ],
    description: 'Gestão de pessoas, vagas e departamentos',
    audience:
      'times de RH e gestores que administram colaboradores e processos seletivos',
  },
  {
    id: 'logistics',
    label: 'logística',
    keywords: [
      'shipment',
      'shipments',
      'remessa',
      'tracking',
      'rastreio',
      'rastreamento',
      'warehouse',
      'armazem',
      'vehicle',
      'veiculo',
      'fleet',
      'frota',
      'route',
      'rota',
      'driver',
      'motorista',
      'freight',
    ],
    description: 'Rastreamento de entregas, frotas e armazéns',
    audience:
      'transportadoras e operações logísticas que precisam acompanhar cargas e veículos',
  },
  {
    id: 'realestate',
    label: 'imobiliário',
    keywords: [
      'property',
      'properties',
      'imovel',
      'imoveis',
      'rent',
      'aluguel',
      'tenant',
      'inquilino',
      'lease',
      'contrato',
      'condominio',
      'apartment',
      'apartamento',
    ],
    description: 'Cadastro e gestão de imóveis e aluguéis',
    audience: 'imobiliárias, proprietários e inquilinos',
  },
  {
    id: 'personal-finance',
    label: 'finanças pessoais',
    keywords: [
      'expense',
      'expenses',
      'despesa',
      'despesas',
      'income',
      'budget',
      'orcamento',
      'investment',
      'investimento',
      'gasto',
      'gastos',
      'receitas',
      'categoria',
      'financas',
    ],
    description: 'Controle de gastos, receitas e orçamento',
    audience:
      'pessoas que querem organizar o próprio dinheiro e entender para onde ele vai',
  },
  {
    id: 'library',
    label: 'biblioteca / livros',
    keywords: [
      'book',
      'books',
      'livro',
      'livros',
      'library',
      'biblioteca',
      'author',
      'autor',
      'isbn',
      'publisher',
      'editora',
    ],
    description: 'Cadastro de livros, autores e empréstimos',
    audience: 'bibliotecas, livrarias e leitores',
  },
  {
    id: 'events',
    label: 'eventos e ingressos',
    keywords: [
      'event',
      'events',
      'evento',
      'eventos',
      'ticket',
      'tickets',
      'ingresso',
      'ingressos',
      'attendee',
      'participante',
      'venue',
      'show',
    ],
    description: 'Criação de eventos e venda de ingressos',
    audience: 'organizadores de eventos e participantes',
  },
  {
    id: 'games',
    label: 'jogos',
    keywords: [
      'game',
      'jogo',
      'player',
      'players',
      'jogador',
      'enemy',
      'inimigo',
      'sprite',
      'level',
      'fase',
      'score',
      'pontuacao',
      'collision',
    ],
    description: 'Um jogo interativo',
    audience: 'jogadores — e quem estuda programação de jogos',
  },
  {
    id: 'iot',
    label: 'IoT / dispositivos',
    keywords: [
      'sensor',
      'sensors',
      'device',
      'devices',
      'dispositivo',
      'telemetry',
      'telemetria',
      'mqtt',
      'arduino',
      'esp32',
    ],
    description: 'Coleta e processamento de dados de dispositivos e sensores',
    audience: 'quem monitora equipamentos e ambientes através de sensores',
  },
  {
    id: 'pets',
    label: 'pet / veterinária',
    keywords: [
      'pet',
      'pets',
      'animal',
      'animais',
      'vet',
      'veterinario',
      'adocao',
      'adoption',
      'tutor',
    ],
    description: 'Cuidado e gestão de animais de estimação',
    audience: 'clínicas veterinárias, ONGs de adoção e tutores de pets',
  },
];

// createTransfer -> ['create', 'transfer']
export function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function collectVocabulary(
  files: SourceFile[],
  endpoints: Endpoint[],
): Map<string, number> {
  const freq = new Map<string, number>();
  const add = (w: string, weight: number) =>
    freq.set(w, (freq.get(w) ?? 0) + weight);
  for (const f of files) {
    if (isAuxiliaryPath(f.path)) continue;
    // nome de arquivo diz mais sobre a intenção do que o conteúdo
    for (const w of splitWords(f.path)) add(w, 3);
    if (!languageOf(f.path)) continue;
    for (const m of f.content.matchAll(
      /\b(?:class|interface|model|table|entity|def|function|type|struct|enum)\s+([A-Za-z_]\w*)/g,
    ))
      for (const w of splitWords(m[1])) add(w, 2);
  }
  for (const e of endpoints) for (const w of splitWords(e.path)) add(w, 3);
  return freq;
}

function readReadme(files: SourceFile[]): {
  title?: string;
  paragraph?: string;
} {
  const readme = files
    .filter((f) => /^readme(\.md|\.txt|\.rst)?$/i.test(basename(f.path)))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (!readme) return {};
  const plain = (text: string) =>
    text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_`]/g, '')
      .trim();
  const lines = readme.content.split('\n');
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine
    ? plain(titleLine.replace(/^#\s+/, '')) || undefined
    : undefined;
  // primeiro parágrafo de texto (pula badges, títulos, html, código)
  const paragraph = readme.content
    .split(/\n\s*\n/)
    // alguns READMEs abrem com "> ### descrição"
    .map((p) =>
      p.startsWith('>')
        ? p
            .replace(/^>\s*/gm, '')
            .replace(/^#{1,6}\s+/, '')
            .trim()
        : p.trim(),
    )
    .find(
      (p) =>
        p.length > 40 &&
        !p.startsWith('#') &&
        !p.startsWith('<') &&
        !p.startsWith('[![') &&
        !p.startsWith('![') &&
        !p.startsWith('```') &&
        !p.startsWith('|') &&
        !p.startsWith('-') &&
        // "rode o comando abaixo:" não é descrição
        !p.trimEnd().endsWith(':') &&
        plain(p).length > 40,
    );
  const cleanParagraph = paragraph
    ? plain(paragraph).replace(/\s+/g, ' ')
    : undefined;
  return {
    title,
    paragraph:
      cleanParagraph && cleanParagraph.length > 400
        ? `${cleanParagraph.slice(0, 397)}...`
        : cleanParagraph,
  };
}

export function extractEndpoints(files: SourceFile[]): Endpoint[] {
  const out: Endpoint[] = [];
  const push = (method: string, path: string, file: string) => {
    const clean = ('/' + path).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
    if (!out.some((e) => e.method === method && e.path === clean))
      out.push({ method, path: clean, file });
  };
  for (const f of files) {
    const lang = languageOf(f.path);
    if (!lang || isAuxiliaryPath(f.path)) continue;
    // sem comentários, senão exemplos em docstring viram rota
    const c = f.content
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*|#(?!\[))/.test(l))
      .join('\n');

    // nest
    const nestPrefix = c.match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?/);
    if (nestPrefix) {
      for (const m of c.matchAll(
        /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g,
      ))
        push(
          m[1].toUpperCase(),
          `${nestPrefix[1] ?? ''}/${m[2] ?? ''}`,
          f.path,
        );
      continue;
    }
    // spring
    if (lang === 'Java' || lang === 'Kotlin') {
      const prefix =
        c.match(
          /@RequestMapping\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']*)["']/,
        )?.[1] ?? '';
      for (const m of c.matchAll(
        /@(Get|Post|Put|Patch|Delete)Mapping(?:\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']*)["'])?/g,
      ))
        push(m[1].toUpperCase(), `${prefix}/${m[2] ?? ''}`, f.path);
      continue;
    }
    // asp.net
    if (lang === 'C#') {
      const ctrl = basename(f.path)
        .replace(/Controller\.cs$/, '')
        .toLowerCase();
      const prefix = (c.match(/\[Route\("([^"]*)"\)\]/)?.[1] ?? '').replace(
        '[controller]',
        ctrl,
      );
      for (const m of c.matchAll(
        /\[Http(Get|Post|Put|Patch|Delete)(?:\("([^"]*)"\))?\]/g,
      ))
        push(m[1].toUpperCase(), `${prefix}/${m[2] ?? ''}`, f.path);
      continue;
    }
    // express, fastify, koa, hono
    for (const m of c.matchAll(
      /\b(?:app|router|server|fastify|api|routes|r)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    ))
      push(m[1].toUpperCase(), m[2], f.path);
    // fastapi, flask
    for (const m of c.matchAll(
      /@\w+\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
    ))
      push(m[1].toUpperCase(), m[2], f.path);
    for (const m of c.matchAll(
      /@\w+\.route\(\s*['"]([^'"]+)['"](?:[^)]*methods\s*=\s*\[([^\]]+)\])?/g,
    )) {
      const methods = m[2]
        ? [...m[2].matchAll(/['"](\w+)['"]/g)].map((x) => x[1].toUpperCase())
        : ['GET'];
      for (const method of methods) push(method, m[1], f.path);
    }
    if (basename(f.path) === 'urls.py')
      for (const m of c.matchAll(/\bpath\(\s*['"]([^'"]*)['"]/g))
        push('ANY', m[1], f.path);
    for (const m of c.matchAll(
      /Route::(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
    ))
      push(m[1].toUpperCase(), m[2], f.path);
    if (lang === 'Go')
      for (const m of c.matchAll(
        /\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete)\(\s*"([^"]+)"/g,
      ))
        push(m[1].toUpperCase(), m[2], f.path);
    if (out.length > 80) break;
  }
  return out.slice(0, 60);
}

// /api/accounts/:id -> accounts
function resourcesFrom(endpoints: Endpoint[]): string[] {
  const counts = new Map<string, number>();
  for (const e of endpoints) {
    const seg = e.path
      .split('/')
      .filter(
        (s) =>
          s &&
          !s.startsWith(':') &&
          !s.startsWith('{') &&
          !s.startsWith('<') &&
          !/^(api|v\d+)$/i.test(s),
      )[0];
    if (seg) counts.set(seg, (counts.get(seg) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r)
    .slice(0, 8);
}

interface TypeGuess {
  type: string;
  article: string;
  audienceHint: string;
}

function guessProjectType(
  files: SourceFile[],
  techs: Technology[],
  endpoints: Endpoint[],
  manifest: ManifestInfo,
): TypeGuess {
  const has = (...names: string[]) => techs.some((t) => names.includes(t.name));
  const cats = new Set(techs.map((t) => t.category));
  const frontend = cats.has('Framework frontend') && !has('Engine de jogos 2D');
  const backend = cats.has('Framework backend') || endpoints.length > 0;

  if (has('React Native', 'Flutter'))
    return {
      type: 'aplicativo mobile',
      article: 'um',
      audienceHint: 'usuários finais no celular (Android e iOS)',
    };
  if (
    has('Engine de jogos 2D') ||
    files.some(
      (f) => f.path.endsWith('.cs') && /:\s*MonoBehaviour\b/.test(f.content),
    )
  )
    return { type: 'jogo', article: 'um', audienceHint: 'jogadores' };
  if (has('Next.js', 'Nuxt') || (frontend && backend))
    return {
      type: 'aplicação web full-stack',
      article: 'uma',
      audienceHint: 'usuários finais que acessam pelo navegador',
    };
  if (backend)
    return {
      type: 'API / backend',
      article: 'uma',
      audienceHint:
        'aplicações frontend ou mobile (e outros sistemas) que vão consumir esses endpoints',
    };
  if (frontend)
    return {
      type: 'aplicação frontend (SPA)',
      article: 'uma',
      audienceHint: 'usuários finais que acessam pelo navegador',
    };
  if (has('Framework de CLI') || manifest.hasBinField)
    return {
      type: 'ferramenta de linha de comando (CLI)',
      article: 'uma',
      audienceHint: 'desenvolvedores e usuários técnicos no terminal',
    };
  if (has('SDK de bot'))
    return {
      type: 'bot',
      article: 'um',
      audienceHint: 'membros das comunidades onde o bot roda',
    };
  if (
    has('Machine Learning', 'Pandas / NumPy') ||
    files.some((f) => f.path.endsWith('.ipynb'))
  )
    return {
      type: 'projeto de dados / machine learning',
      article: 'um',
      audienceHint: 'analistas e times que tomam decisões com base em dados',
    };
  if (manifest.hasLibraryExports)
    return {
      type: 'biblioteca / pacote reutilizável',
      article: 'uma',
      audienceHint:
        'outros desenvolvedores, que vão instalar e importar o pacote',
    };
  const codeFiles = files.filter((f) => languageOf(f.path));
  if (codeFiles.length <= 3)
    return {
      type: 'script / trecho de código',
      article: 'um',
      audienceHint:
        'quem precisa automatizar ou resolver essa tarefa específica',
    };
  return {
    type: 'projeto de software',
    article: 'um',
    audienceHint: 'quem precisa da funcionalidade que ele implementa',
  };
}

const DOMAIN_THRESHOLD = 9;

export function analyzeIdea(
  files: SourceFile[],
  techs: Technology[],
  manifest: ManifestInfo,
  packageFeatures: string[],
): IdeaSection {
  const endpoints = extractEndpoints(files);
  const vocab = collectVocabulary(files, endpoints);
  const readme = readReadme(files);

  const readmeWords = new Set(
    splitWords(
      `${readme.title ?? ''} ${readme.paragraph ?? ''} ${manifest.description ?? ''}`,
    ),
  );
  const scored = DOMAINS.map((d) => {
    let score = 0;
    const hits: string[] = [];
    for (const k of d.keywords) {
      const v = (vocab.get(k) ?? 0) + (readmeWords.has(k) ? 6 : 0);
      if (v > 0) {
        score += v;
        hits.push(k);
      }
    }
    return { d, score, hits };
  }).sort((a, b) => b.score - a.score);
  const best =
    scored[0].score >= DOMAIN_THRESHOLD && scored[0].hits.length >= 2
      ? scored[0]
      : null;

  const type = guessProjectType(files, techs, endpoints, manifest);
  const projectName =
    readme.title ?? manifest.projectName ?? 'Projeto analisado';
  const resources = resourcesFrom(endpoints);
  const mainTechs = techs
    .filter((t) =>
      [
        'Framework backend',
        'Framework frontend',
        'Mobile',
        'Banco de dados',
      ].includes(t.category),
    )
    .map((t) => t.name)
    .slice(0, 4);
  const mainLang = techs.find((t) => t.category === 'Linguagem')?.name;

  const parts: string[] = [];
  parts.push(
    `Pelo que li, **${projectName}** é ${type.article} **${type.type}**` +
      (best ? ` do domínio **${best.d.label}**.` : '.'),
  );
  const selfDescription = readme.paragraph ?? manifest.description;
  if (selfDescription)
    parts.push(`O próprio projeto se descreve assim: _"${selfDescription}"_`);
  if (best)
    parts.push(
      `${best.d.description} — dá para perceber isso por termos como ${best.hits
        .slice(0, 5)
        .map((h) => `\`${h}\``)
        .join(', ')} espalhados pelo código.`,
    );
  if (mainTechs.length || mainLang)
    parts.push(
      `Foi construído com ${[mainLang, ...mainTechs].filter(Boolean).join(', ')}.`,
    );
  if (endpoints.length)
    parts.push(
      `Ele expõe **${endpoints.length} endpoint(s)** HTTP` +
        (resources.length
          ? `, organizados principalmente em torno de: ${resources.map((r) => `\`${r}\``).join(', ')}.`
          : '.'),
    );

  const features = new Set<string>();
  for (const r of resources.slice(0, 6)) {
    const methods = new Set(
      endpoints.filter((e) => e.path.includes(`/${r}`)).map((e) => e.method),
    );
    const ops = [
      methods.has('POST') && 'criar',
      methods.has('GET') && 'consultar',
      (methods.has('PUT') || methods.has('PATCH')) && 'atualizar',
      methods.has('DELETE') && 'remover',
    ].filter(Boolean);
    features.add(
      `Gerenciamento de \`${r}\`${ops.length ? ` (${ops.join(', ')})` : ''}`,
    );
  }
  for (const f of packageFeatures) features.add(f);
  if (
    files.some((f) =>
      /\b(login|signin|sign_in|register|signup|authenticate)\b/i.test(f.path),
    )
  )
    features.add('Cadastro e login de usuários');

  const audience = best
    ? `Serve para ${best.d.audience}. Na prática, quem usa diretamente este código são ${type.audienceHint}.`
    : `Serve para ${type.audienceHint}.`;

  const evidence = [
    ...(readme.title ? ['README.md'] : []),
    ...(manifest.description ? ['descrição do manifesto do projeto'] : []),
    ...(best
      ? [`palavras do domínio: ${best.hits.slice(0, 8).join(', ')}`]
      : []),
    ...(endpoints.length ? [`${endpoints.length} rotas HTTP`] : []),
  ];

  return {
    projectName,
    projectType: type.type,
    domain: best?.d.label ?? null,
    summary: parts.join(' '),
    audience,
    features: [...features].slice(0, 12),
    endpoints,
    evidence,
  };
}
