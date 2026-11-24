import { extractUnits, type CodeUnit } from './code-units.js';
import { splitWords } from './idea.js';
import {
  basename,
  countLines,
  isAuxiliaryPath,
  languageOf,
} from './languages.js';
import { redactSecrets } from './secrets.js';
import type { Highlight, SourceFile } from './types.js';

interface Role {
  id: string;
  label: string;
  explanation: string;
  weight: number;
  test: (path: string, content: string) => boolean;
}

// a ordem importa: o primeiro que casar vence
const ROLES: Role[] = [
  {
    id: 'usecase',
    label: 'Caso de uso',
    explanation:
      'Um caso de uso representa uma ação do negócio (ex.: "transferir dinheiro") de ponta a ponta, isolada de detalhes de HTTP e banco.',
    weight: 10,
    test: (p) => /(use-?cases?|usecase|interactor)/i.test(p),
  },
  {
    id: 'service',
    label: 'Service (regra de negócio)',
    explanation:
      'A camada de serviço concentra as regras de negócio. Fica entre o controller (que recebe a requisição) e o acesso a dados — é aqui que mora a "inteligência" do sistema.',
    weight: 10,
    test: (p) =>
      /(\.service\.|services?\/|Service\.(java|cs|kt|php|go)$|_service\.(py|rb|go)$)/i.test(
        p,
      ),
  },
  {
    id: 'controller',
    label: 'Controller (entrada HTTP)',
    explanation:
      'O controller é a porta de entrada: recebe a requisição HTTP, valida/extrai os dados e delega o trabalho para a camada de negócio.',
    weight: 7,
    test: (p, c) =>
      /(controller|views\.py$|handlers?\/)/i.test(p) ||
      /^\s*@(Controller\(|RestController)/m.test(c),
  },
  {
    id: 'route',
    label: 'Rotas',
    explanation:
      'Arquivo que liga URLs e métodos HTTP às funções que os tratam.',
    weight: 6,
    test: (p) =>
      /(routes?|router|urls\.py$)/i.test(basename(p)) || /\/routes?\//i.test(p),
  },
  {
    id: 'guard',
    label: 'Middleware / Guard (segurança e filtros)',
    explanation:
      'Middlewares e guards rodam antes do código principal, para autenticar, autorizar, registrar logs ou transformar requisições.',
    weight: 7,
    test: (p) =>
      /(middleware|guard|interceptor|filter|policy|auth\.provider|strategy)/i.test(
        basename(p),
      ),
  },
  {
    id: 'repository',
    label: 'Repository (acesso a dados)',
    explanation:
      'O repository isola o acesso ao banco: o resto do sistema pede "busque o usuário X" sem saber qual banco ou ORM está por trás.',
    weight: 6,
    test: (p) => /(repositor|dao\b|\.store\.|_store\.)/i.test(p),
  },
  {
    id: 'hook',
    label: 'Hook (lógica reutilizável de UI)',
    explanation:
      'Hooks encapsulam estado e efeitos para serem reaproveitados por vários componentes.',
    weight: 6,
    test: (p) => /(^|\/)use[A-Z]\w*\.(t|j)sx?$/.test(p) || /\/hooks\//.test(p),
  },
  {
    id: 'component',
    label: 'Componente de interface',
    explanation:
      'Um componente é um pedaço reutilizável da interface, que recebe dados (props) e decide o que mostrar.',
    weight: 5,
    test: (p, c) =>
      /\.(tsx|jsx|vue|svelte)$/.test(p) &&
      /(return\s*\(|<template>|<\w+[\s>])/.test(c),
  },
  {
    id: 'model',
    label: 'Modelo / Entidade',
    explanation:
      'Modelos e entidades descrevem os dados do domínio e, muitas vezes, como eles são guardados no banco.',
    weight: 4,
    test: (p) =>
      /(models?\/|entit(y|ies)|\.model\.|schemas?\/|domain\/)/i.test(p),
  },
  {
    id: 'entry',
    label: 'Ponto de entrada',
    explanation:
      'Arquivo que inicializa a aplicação: configura o servidor, conecta dependências e sobe tudo.',
    weight: 5,
    test: (p) =>
      /^(src\/)?(main|index|app|server|program|manage)\.(ts|js|py|go|java|cs|rb)$/i.test(
        p,
      ) || /Application\.(java|kt)$/.test(p),
  },
  {
    id: 'util',
    label: 'Utilitário',
    explanation:
      'Funções auxiliares reaproveitadas em vários pontos do projeto.',
    weight: 3,
    test: (p) => /(utils?|helpers?|lib)\//i.test(p),
  },
];

const OTHER: Role = {
  id: 'other',
  label: 'Código do projeto',
  explanation: 'Parte da lógica principal do projeto.',
  weight: 3,
  test: () => true,
};

const SKIP =
  /(\.(spec|test|d)\.[a-z]+$|(^|\/)(test|tests|__tests__|migrations?|generated|dist|build|vendor|fixtures?)\/|\.min\.js$|\.config\.[a-z]+$|setupTests)/i;

const BUSINESS_WORDS =
  /\b(transfer|balance|saldo|payment|pagamento|order|pedido|price|preco|total|amount|valor|discount|desconto|invoice|tax|validate|valida|calculate|calcul|approve|aprova|checkout|charge|refund|score|rule|regra|limit|limite)\w*/gi;

function roleOf(path: string, content: string): Role {
  return ROLES.find((r) => r.test(path, content)) ?? OTHER;
}

interface Trait {
  test: RegExp;
  observation: string;
  interesting?: string;
  weight: number;
}

const TRAITS: Trait[] = [
  {
    test: /\$transaction|\.transaction\(|@Transactional|transaction\.atomic|BEGIN TRANSACTION|db\.Begin\(|\bstartTransaction\b|withTransaction/,
    observation:
      'Usa uma **transação de banco**: ou todas as operações são gravadas, ou nenhuma é.',
    interesting:
      'O uso de transação é um cuidado de gente experiente: se algo falhar no meio do caminho (por exemplo, debitar de uma conta e creditar em outra), nada fica pela metade.',
    weight: 4,
  },
  {
    test: /\b(Decimal|BigDecimal|decimal\.Decimal|toFixed|cents|centavos|Money)\b/,
    observation: 'Trata valores numéricos com tipo **decimal/centavos**.',
    interesting:
      'Usar decimal (ou centavos inteiros) para dinheiro evita os erros de arredondamento do ponto flutuante — o famoso `0.1 + 0.2 = 0.30000000000000004`.',
    weight: 3,
  },
  {
    test: /\b(bcrypt|argon2|scrypt|passwordHasher|PasswordEncoder|hashpw|password_hash)\b/i,
    observation:
      'Protege senhas com **hash** (nunca guarda a senha em texto puro).',
    interesting:
      'Senhas com hash lento (bcrypt/argon2/scrypt) é exatamente o que a OWASP recomenda.',
    weight: 3,
  },
  {
    test: /\b(jwt|jsonwebtoken|signAsync|sign\(|verify\(|TokenService)\b/i,
    observation: 'Gera ou valida **tokens de autenticação**.',
    weight: 2,
  },
  {
    // if seguido de throw/return/raise na mesma linha ou na seguinte
    test: /^\s*if\b[^\n]*(\{|:|\))?[ \t]*\n?[ \t]*(throw|return|raise)\b/m,
    observation:
      'Usa **guard clauses** (early return): trata os casos de erro logo no começo.',
    interesting:
      'As guard clauses deixam o "caminho feliz" sem aninhamento, o que torna a leitura bem mais fácil.',
    weight: 2,
  },
  {
    test: /throw new \w*(Exception|Error)|raise \w+(Error|Exception)|panic\(|errors\.New|return err\b/,
    observation:
      'Sinaliza erros de forma **explícita** (exceções/erros com mensagem), em vez de falhar silenciosamente.',
    weight: 2,
  },
  {
    test: /\btry\s*[{:]|\bcatch\s*\(|\bexcept\b|\brescue\b/,
    observation: 'Trata falhas com **try/catch**.',
    weight: 1,
  },
  {
    test: /\bawait\b|\basync\b|\.then\(|go func|CompletableFuture|Task</,
    observation:
      'É **assíncrono**: espera operações lentas (banco, rede) sem travar o servidor.',
    weight: 1,
  },
  {
    test: /\b(prisma\.|repository\.|\.save\(|\.find\w*\(|\.query\(|SELECT\s|INSERT\s|UPDATE\s|\.objects\.|session\.(add|query)|\.create\(|\.update\(|\.delete\()/i,
    observation: 'Faz **acesso ao banco de dados**.',
    weight: 1,
  },
  {
    test: /\b(fetch\(|axios\.|requests\.(get|post)|httpx\.|HttpClient|http\.Get|RestTemplate|WebClient)\b/,
    observation: 'Chama **outro serviço via HTTP**.',
    weight: 1,
  },
  {
    test: /\.(parse|safeParse)\(|@Valid\b|@IsString|@IsEmail|Joi\.|yup\.|BaseModel\)|validator\.|\bvalidate\w*\(/,
    observation: '**Valida os dados de entrada** antes de usá-los.',
    interesting:
      'Validar a entrada logo na borda do sistema é uma das defesas mais eficazes contra bugs e ataques.',
    weight: 2,
  },
  {
    test: /\.(map|filter|reduce|flatMap)\(|\bstream\(\)|list comprehension|\[\s*\w+\s+for\s+\w+\s+in\b/,
    observation:
      'Transforma coleções de forma **declarativa** (map/filter/reduce).',
    weight: 1,
  },
  {
    test: /\b(cache|redis|memo|useMemo|lru_cache|@Cacheable)\b/i,
    observation: 'Usa **cache** para evitar trabalho repetido.',
    weight: 2,
  },
  {
    test: /\b(emit|publish|dispatch|enqueue|queue\.add|\.add\(\s*['"]|send_task|delay\()\b/,
    observation:
      'Dispara **eventos ou jobs** para serem processados de forma desacoplada.',
    weight: 2,
  },
  {
    test: /\b(logger|log)\.(info|warn|error|debug|log)\(|logging\.(info|error|warning)/,
    observation: 'Registra **logs** para facilitar o diagnóstico.',
    weight: 1,
  },
  {
    test: /constructor\(\s*(private|public|protected|readonly)|@Autowired|@Inject\(|__init__\(self,\s*\w+:\s*\w+/,
    observation:
      'Recebe dependências pelo construtor (**injeção de dependência**).',
    interesting:
      'Injeção de dependência deixa o código fácil de testar: nos testes dá para trocar o banco real por um "dublê".',
    weight: 2,
  },
  {
    test: /^\s*(\/\*\*|\/\/\/|"""|#\s+\w|\/\/\s+\w)/m,
    observation: 'Tem **comentários** explicando a intenção.',
    weight: 1,
  },
];

const VERBS: [RegExp, string][] = [
  [/^(create|criar|add|insert|new|register|cadastr|signup)/, 'criar/cadastrar'],
  [
    /^(find|get|buscar|fetch|load|read|list|listar|search|show|retrieve|obter)/,
    'buscar/consultar',
  ],
  [/^(update|atualizar|edit|editar|patch|set|change|alterar)/, 'atualizar'],
  [/^(delete|remove|remover|excluir|destroy|deletar)/, 'remover'],
  [
    /^(validate|validar|check|verify|verificar|ensure|assert|is|has|can)/,
    'validar/verificar',
  ],
  [
    /^(transfer|transferir|move|send|enviar|pay|pagar|charge|withdraw|deposit|sacar|depositar)/,
    'movimentar/enviar',
  ],
  [/^(calc|calcular|compute|sum|total|count)/, 'calcular'],
  [
    /^(handle|process|processar|run|execute|executar|perform|on)/,
    'processar/tratar',
  ],
  [/^(login|signin|authenticate|autenticar|auth)/, 'autenticar'],
  [/^(parse|format|convert|map|transform|to|serialize)/, 'converter/formatar'],
  [/^(render|draw|display|mostrar)/, 'renderizar na tela'],
  [/^(save|salvar|store|persist|write)/, 'salvar'],
  [/^(build|make|generate|gerar|montar)/, 'gerar/montar'],
];

function describeName(name: string): string {
  const words = splitWords(name);
  const lower = name.toLowerCase();
  const verb = VERBS.find(([re]) => re.test(lower))?.[1];
  const subject = words
    .filter((w) => !VERBS.some(([re]) => re.test(w)))
    .join(' ');
  if (verb && subject)
    return `**${verb}** — pelo nome, algo relacionado a _${subject}_`;
  if (verb) return `**${verb}**`;
  return subject
    ? `lidar com _${subject}_`
    : `executar a lógica de \`${name}\``;
}

function scoreUnit(u: CodeUnit): number {
  let s = 0;
  for (const t of TRAITS) if (t.test.test(u.code)) s += t.weight;
  s += Math.min(6, (u.code.match(BUSINESS_WORDS) ?? []).length);
  if (u.lines >= 6 && u.lines <= 45) s += 4;
  else if (u.lines > 80) s -= 3;
  else if (u.lines < 4) s -= 3;
  if (
    /^(constructor|__init__|toString|equals|hashCode|onModuleInit|onModuleDestroy|ngOnInit|ngOnDestroy|componentDidMount|bootstrap|main)$/.test(
      u.name,
    )
  )
    s -= 6;
  return s;
}

function buildHighlight(
  file: SourceFile,
  role: Role,
  unit: CodeUnit | null,
): Highlight {
  const language = languageOf(file.path) ?? 'texto';
  let code: string;
  let startLine: number;
  let endLine: number;
  let title: string;
  if (unit) {
    const lines = unit.code.split('\n');
    const truncated = lines.length > 45;
    code = (
      truncated ? [...lines.slice(0, 42), '    // … (trecho encurtado)'] : lines
    ).join('\n');
    startLine = unit.startLine;
    endLine = unit.endLine;
    title = `${unit.name}()`;
  } else {
    const lines = file.content.split('\n');
    const first = lines.findIndex(
      (l) =>
        l.trim() &&
        !/^\s*(import|from|using|package|require|#include|\/\/|\/\*|\*)/.test(
          l,
        ),
    );
    const start = Math.max(0, first);
    code = lines.slice(start, start + 30).join('\n');
    startLine = start + 1;
    endLine = Math.min(lines.length, start + 30);
    title = basename(file.path);
  }
  const traits = TRAITS.filter((t) => t.test.test(code));
  const observations = traits.map((t) => t.observation);
  const interesting = traits
    .filter((t) => t.interesting)
    .map((t) => t.interesting!)
    .slice(0, 3);

  if (unit && unit.lines > 60)
    interesting.push(
      `Dica: este trecho tem ${unit.lines} linhas. Quebrá-lo em funções menores, cada uma com um nome claro, facilitaria a leitura e os testes.`,
    );
  else if (unit && unit.complexity > 10)
    interesting.push(
      `Dica: há ${unit.complexity} caminhos de decisão aqui (if/else, loops, &&). Extrair partes para funções com nomes descritivos reduziria a carga mental de quem lê.`,
    );
  if (interesting.length === 0)
    interesting.push(
      unit && unit.lines <= 20
        ? 'O trecho é curto e focado em uma única responsabilidade — fácil de ler e de testar.'
        : 'É um bom ponto de partida para entender como o projeto funciona por dentro.',
    );

  // as observações já aparecem em lista, não repetir aqui
  const whatItDoes = unit
    ? `A função \`${unit.name}\` (linhas ${unit.startLine}–${unit.endLine} de \`${file.path}\`) tem como objetivo ${describeName(unit.name)}.` +
      (observations.length
        ? ' Veja abaixo o que chama atenção na implementação.'
        : '')
    : `Este arquivo (\`${file.path}\`, ${countLines(file.content)} linhas) tem o papel de **${role.label.toLowerCase()}** no projeto.`;

  return {
    file: file.path,
    role: role.label,
    roleExplanation: role.explanation,
    title,
    language,
    startLine,
    endLine,
    code: redactSecrets(code),
    whatItDoes,
    observations,
    interesting,
  };
}

// quantos arquivos de cada papel têm as funções avaliadas uma a uma
const CANDIDATES_PER_ROLE = 8;

// Os 5 trechos que mais ensinam: regra de negócio (services, casos de uso,
// domínio) vem antes de código de apoio, e funções com lógica de verdade antes
// de getters. Saem em ordem de importância.
// unitsByFile: funções já extraídas pelo motor, para não extrair de novo
export function selectHighlights(
  files: SourceFile[],
  max = 5,
  unitsByFile?: Map<string, CodeUnit[]>,
): Highlight[] {
  // etapa 1 (barata): pré-nota de cada arquivo pelo papel e pelo tamanho
  const byRole = new Map<
    string,
    { f: SourceFile; role: Role; pre: number }[]
  >();
  for (const f of files) {
    const language = languageOf(f.path);
    if (
      !language ||
      SKIP.test(f.path) ||
      isAuxiliaryPath(f.path) ||
      /^(HTML|CSS|SCSS|Less|SQL|Jupyter Notebook)$/.test(language)
    )
      continue;
    const lines = countLines(f.content);
    if (lines < 5) continue;
    const role = roleOf(f.path, f.content);
    const list = byRole.get(role.id) ?? [];
    list.push({ f, role, pre: role.weight * 2 + Math.log2(lines + 1) });
    byRole.set(role.id, list);
  }

  // etapa 2 (cara): só os melhores de cada papel têm as funções avaliadas.
  // Limitar por papel (e não no geral) mantém os trechos variados.
  const candidates = [...byRole.values()]
    .flatMap((list) =>
      list.sort((a, b) => b.pre - a.pre).slice(0, CANDIDATES_PER_ROLE),
    )
    .map(({ f, role, pre }) => {
      const units = unitsByFile?.get(f.path) ?? extractUnits(f);
      const best = units
        .map((u) => ({ u, s: scoreUnit(u) }))
        .sort((a, b) => b.s - a.s)[0];
      // sem função reconhecida a explicação fica fraca
      const score = pre + (best && best.s > 0 ? best.s : -8);
      return { f, role, unit: best?.u ?? null, score };
    })
    .sort((a, b) => b.score - a.score);

  // evita relatório com 6 controllers iguais
  const limitFor = (id: string) =>
    id === 'service' || id === 'usecase' ? 2 : 1;
  const perRole = new Map<string, number>();
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if ((perRole.get(c.role.id) ?? 0) >= limitFor(c.role.id)) continue;
    if (!c.unit && c.role.id === 'other' && chosen.length >= 2) continue;
    perRole.set(c.role.id, (perRole.get(c.role.id) ?? 0) + 1);
    chosen.push(c);
    if (chosen.length >= max) break;
  }
  return chosen.map((c) => buildHighlight(c.f, c.role, c.unit));
}
