import type { CodeUnit } from './code-units.js';
import {
  basename,
  countLines,
  isAuxiliaryPath,
  isTestPath,
  languageOf,
} from './languages.js';
import type { SecretFinding } from './secrets.js';
import type {
  CheckStatus,
  Improvement,
  QualityCheck,
  QualitySection,
  SourceFile,
  Technology,
} from './types.js';

export interface QualityInput {
  files: SourceFile[];
  units: CodeUnit[];
  techs: Technology[];
  secrets: SecretFinding[];
  isApi: boolean;
  // trecho solto: testes, readme, ci etc. não entram na conta
  isSnippet: boolean;
  // Caminho de TODOS os arquivos relevantes, inclusive os que ficaram fora da
  // leitura em projetos grandes. Checagens que só dependem do nome (tem testes?
  // tem CI?) usam esta lista, para a visão panorâmica não distorcer a nota.
  paths?: string[];
}

const isCodeFile = (p: string) => {
  const l = languageOf(p);
  return (
    !!l &&
    !['HTML', 'CSS', 'SCSS', 'Less', 'SQL', 'Jupyter Notebook'].includes(l)
  );
};

// critério com ratio null não se aplica e sai do denominador
export function assessQuality(input: QualityInput): QualitySection {
  const { files, units, techs, secrets, isApi, isSnippet } = input;
  const paths = input.paths ?? files.map((f) => f.path);
  const checks: QualityCheck[] = [];
  const improvements: Improvement[] = [];
  const strengths: string[] = [];
  const has = (...names: string[]) => techs.some((t) => names.includes(t.name));
  const hasFile = (re: RegExp) => paths.some((p) => re.test(p));
  const isProductCode = (p: string) =>
    isCodeFile(p) && !isTestPath(p) && !isAuxiliaryPath(p);
  // conteúdo: só dos arquivos lidos
  const sourceFiles = files.filter((f) => isProductCode(f.path));
  // contagem por nome: do projeto inteiro
  const sourceCount = paths.filter(isProductCode).length;
  const testCount = paths.filter((p) => isCodeFile(p) && isTestPath(p)).length;
  const prodUnits = units.filter(
    (u) => !isTestPath(u.file) && !isAuxiliaryPath(u.file),
  );

  const check = (
    id: string,
    label: string,
    weight: number,
    ratio: number | null, // null = não se aplica
    detail: string,
  ) => {
    let status: CheckStatus = 'na';
    let earned = 0;
    if (ratio !== null) {
      earned = Math.round(weight * ratio * 10) / 10;
      status = ratio >= 0.85 ? 'ok' : ratio >= 0.4 ? 'atencao' : 'melhorar';
    }
    checks.push({ id, label, status, weight, earned, detail });
    return status;
  };

  if (secrets.length === 0) {
    check(
      'secrets',
      'Sem segredos expostos no código',
      15,
      1,
      'Nenhuma chave, senha ou token encontrado no código.',
    );
    strengths.push(
      'Nenhum segredo (senha, token, chave de API) foi encontrado no código — ótimo cuidado com segurança.',
    );
  } else {
    const list = secrets
      .slice(0, 5)
      .map((s) => `${s.file}:${s.line} (${s.kind}: ${s.preview})`)
      .join('; ');
    check(
      'secrets',
      'Sem segredos expostos no código',
      15,
      0,
      `${secrets.length} possível(is) segredo(s): ${list}`,
    );
    improvements.push({
      title: 'Tire os segredos do código',
      why: `Encontrei ${secrets.length} possível(is) segredo(s) no código (ex.: ${secrets[0].file}, linha ${secrets[0].line}). Qualquer pessoa com acesso ao repositório — ou ao histórico do git — pode usá-los.`,
      how: 'Mova os valores para variáveis de ambiente (arquivo .env fora do git + .env.example só com nomes) e **revogue/troque** as chaves que já foram commitadas: apagar o arquivo não remove do histórico.',
      priority: 'alta',
    });
  }

  if (isSnippet)
    check(
      'tests',
      'Testes automatizados',
      15,
      null,
      'Não se aplica a um trecho isolado.',
    );
  else {
    const ratio = sourceCount ? testCount / sourceCount : 0;
    const score =
      testCount === 0
        ? 0
        : ratio >= 0.25
          ? 1
          : ratio >= 0.1
            ? 0.75
            : 0.45;
    check(
      'tests',
      'Testes automatizados',
      15,
      score,
      `${testCount} arquivo(s) de teste para ${sourceCount} arquivo(s) de código.`,
    );
    if (testCount === 0)
      improvements.push({
        title: 'Escreva os primeiros testes automatizados',
        why: 'Sem testes, cada mudança pode quebrar algo sem ninguém perceber — e com código gerado por IA isso fica ainda mais importante: o teste é o que prova que o código faz o que deveria.',
        how: `Comece pelas regras de negócio mais críticas (services/casos de uso). ${has('TypeScript', 'JavaScript') ? 'Vitest ou Jest' : has('Python') ? 'pytest' : has('Java', 'Kotlin') ? 'JUnit + Mockito' : 'O framework de testes da sua linguagem'} resolve. Um teste por regra importante já muda o jogo.`,
        priority: 'alta',
      });
    else if (score < 1)
      improvements.push({
        title: 'Aumente a cobertura de testes',
        why: `Há testes, mas poucos em relação ao tamanho do código (${testCount} para ${sourceCount} arquivos).`,
        how: 'Priorize testar regras de negócio e casos de erro (entradas inválidas, recurso não encontrado). Ative o relatório de cobertura para ver o que falta.',
        priority: 'média',
      });
    else
      strengths.push(
        `Boa presença de testes automatizados (${testCount} arquivos de teste).`,
      );
  }

  if (prodUnits.length === 0)
    check(
      'function-size',
      'Funções pequenas e focadas',
      10,
      null,
      'Nenhuma função identificada.',
    );
  else {
    const long = prodUnits.filter((u) => u.lines > 50);
    const pct = long.length / prodUnits.length;
    const ratio = pct === 0 ? 1 : pct <= 0.05 ? 0.8 : pct <= 0.15 ? 0.5 : 0.2;
    check(
      'function-size',
      'Funções pequenas e focadas',
      10,
      ratio,
      `${long.length} de ${prodUnits.length} funções têm mais de 50 linhas.`,
    );
    if (long.length) {
      const worst = [...long].sort((a, b) => b.lines - a.lines)[0];
      improvements.push({
        title: 'Quebre funções muito longas',
        why: `${long.length} função(ões) passam de 50 linhas — a maior é \`${worst.name}\` em ${worst.file} (${worst.lines} linhas). Funções longas costumam fazer várias coisas ao mesmo tempo.`,
        how: 'Extraia blocos com uma responsabilidade clara para funções com nomes descritivos (ex.: `validarSaldo()`, `registrarTransacao()`). O código passa a "se explicar" pelos nomes.',
        priority: pct > 0.15 ? 'média' : 'baixa',
      });
    } else
      strengths.push(
        'As funções são curtas e focadas — fáceis de ler e de testar.',
      );
  }

  if (prodUnits.length === 0)
    check(
      'complexity',
      'Complexidade sob controle',
      8,
      null,
      'Nenhuma função identificada.',
    );
  else {
    const complex = prodUnits.filter(
      (u) => u.complexity > 10 || u.maxNesting > 4,
    );
    const pct = complex.length / prodUnits.length;
    const ratio =
      pct === 0 ? 1 : pct <= 0.05 ? 0.75 : pct <= 0.15 ? 0.45 : 0.15;
    check(
      'complexity',
      'Complexidade sob controle',
      8,
      ratio,
      `${complex.length} função(ões) com muitos caminhos de decisão ou aninhamento profundo.`,
    );
    if (complex.length) {
      const worst = [...complex].sort((a, b) => b.complexity - a.complexity)[0];
      improvements.push({
        title: 'Reduza o aninhamento e os caminhos de decisão',
        why: `\`${worst.name}\` (${worst.file}) tem complexidade ~${worst.complexity} e ${worst.maxNesting} níveis de aninhamento. Cada if/else extra dobra os cenários que alguém precisa entender e testar.`,
        how: 'Use guard clauses (retorne cedo nos casos de erro), extraia condições para funções com nome (`podeSacar(conta)`) e troque cadeias de if/else por mapas ou polimorfismo quando fizer sentido.',
        priority: 'média',
      });
    }
  }

  const readme = files.find(
    (f) =>
      /^readme(\.\w+)?$/i.test(basename(f.path)) &&
      f.path.split('/').length <= 2,
  );
  if (isSnippet)
    check(
      'readme',
      'README que explica o projeto',
      7,
      null,
      'Não se aplica a um trecho isolado.',
    );
  else if (!readme) {
    check(
      'readme',
      'README que explica o projeto',
      7,
      0,
      'Nenhum README encontrado.',
    );
    improvements.push({
      title: 'Crie um README',
      why: 'O README é a porta de entrada do projeto: sem ele, quem chega (inclusive recrutadores) não sabe o que o código faz nem como rodar.',
      how: 'Inclua: o que é o projeto, tecnologias, como instalar e rodar, variáveis de ambiente necessárias e exemplos de uso.',
      priority: 'média',
    });
  } else {
    const size = readme.content.trim().length;
    const hasHowTo =
      /(instal|install|como rodar|getting started|usage|uso|npm |docker|pip |mvn )/i.test(
        readme.content,
      );
    const ratio = size > 600 && hasHowTo ? 1 : size > 200 ? 0.6 : 0.3;
    check(
      'readme',
      'README que explica o projeto',
      7,
      ratio,
      `README com ${size} caracteres${hasHowTo ? ' e instruções de uso' : ''}.`,
    );
    if (ratio < 1)
      improvements.push({
        title: 'Deixe o README mais completo',
        why: 'O README existe, mas está curto ou sem instruções de como rodar o projeto.',
        how: 'Adicione um passo a passo de instalação, as variáveis de ambiente e um exemplo de uso (ex.: uma requisição e a resposta esperada).',
        priority: 'baixa',
      });
    else strengths.push('O README explica o projeto e como executá-lo.');
  }

  const STATIC = [
    'TypeScript',
    'Java',
    'Kotlin',
    'C#',
    'Go',
    'Rust',
    'Swift',
    'Dart',
    'Scala',
    'C',
    'C++',
  ];
  const langs = new Set(sourceFiles.map((f) => languageOf(f.path)!));
  if (langs.size === 0)
    check('typing', 'Tipagem', 7, null, 'Sem código para avaliar.');
  else if ([...langs].some((l) => STATIC.includes(l))) {
    check(
      'typing',
      'Tipagem',
      7,
      1,
      `Linguagem com tipagem estática (${[...langs].filter((l) => STATIC.includes(l)).join(', ')}).`,
    );
    strengths.push(
      'Usa tipagem estática, o que pega muitos erros antes mesmo de rodar.',
    );
  } else if (langs.has('Python')) {
    const py = sourceFiles.filter((f) => f.path.endsWith('.py'));
    const typed = py.filter((f) =>
      /def \w+\([^)]*:\s*\w+|\)\s*->\s*\w+/.test(f.content),
    ).length;
    const ratio = py.length ? typed / py.length : 0;
    check(
      'typing',
      'Tipagem',
      7,
      ratio >= 0.6 ? 1 : ratio >= 0.2 ? 0.6 : 0.2,
      `${typed} de ${py.length} arquivos Python usam type hints.`,
    );
    if (ratio < 0.6)
      improvements.push({
        title: 'Adicione type hints no Python',
        why: 'Type hints documentam o que cada função espera e devolve, e ferramentas como mypy/pyright pegam erros antes da execução.',
        how: 'Comece pelas funções públicas: `def calcular_total(itens: list[Item]) -> Decimal:`.',
        priority: 'baixa',
      });
  } else if (langs.has('JavaScript')) {
    check('typing', 'Tipagem', 7, 0.2, 'JavaScript sem tipagem estática.');
    improvements.push({
      title: 'Considere migrar para TypeScript',
      why: 'Em JavaScript puro, erros como acessar uma propriedade inexistente só aparecem em produção.',
      how: 'Dá para migrar aos poucos: renomeie um arquivo por vez para .ts, ou comece com JSDoc + `// @ts-check`.',
      priority: 'baixa',
    });
  } else check('typing', 'Tipagem', 7, 0.6, 'Linguagem dinâmica.');

  const lint =
    hasFile(
      /(^|\/)(\.eslintrc[\w.]*|eslint\.config\.\w+|\.oxlintrc\.json|biome\.json|\.prettierrc[\w.]*|prettier\.config\.\w+|\.editorconfig|ruff\.toml|\.flake8|\.pylintrc|checkstyle\.xml|\.rubocop\.yml|\.golangci\.ya?ml|rustfmt\.toml)$/,
    ) ||
    has(
      'ESLint',
      'Prettier',
      'Oxlint',
      'Biome',
      'Ferramentas de qualidade Python',
    ) ||
    files.some(
      (f) =>
        basename(f.path) === 'pyproject.toml' &&
        /\[tool\.(ruff|black|mypy|pylint)/.test(f.content),
    );
  if (isSnippet)
    check(
      'lint',
      'Linter e formatador configurados',
      6,
      null,
      'Não se aplica a um trecho isolado.',
    );
  else if (lint) {
    check(
      'lint',
      'Linter e formatador configurados',
      6,
      1,
      'Ferramentas de padronização de código configuradas.',
    );
    strengths.push(
      'Tem linter/formatador configurado, mantendo o código padronizado.',
    );
  } else {
    check(
      'lint',
      'Linter e formatador configurados',
      6,
      0,
      'Nenhuma configuração de linter/formatador encontrada.',
    );
    improvements.push({
      title: 'Configure um linter e um formatador',
      why: 'Eles apontam bugs comuns automaticamente e acabam com discussões de estilo no time.',
      how: `${has('Python') ? 'Ruff (lint + format) resolve tudo em Python.' : 'ESLint/Oxlint + Prettier (ou Biome) para JS/TS.'} Rode-os no CI e, se quiser, num hook de pre-commit.`,
      priority: 'baixa',
    });
  }

  const bigFiles = sourceFiles.filter((f) => countLines(f.content) > 400);
  if (sourceFiles.length === 0)
    check('file-size', 'Arquivos com tamanho razoável', 5, null, 'Sem código.');
  else {
    const pct = bigFiles.length / sourceFiles.length;
    check(
      'file-size',
      'Arquivos com tamanho razoável',
      5,
      pct === 0 ? 1 : pct <= 0.1 ? 0.6 : 0.2,
      `${bigFiles.length} arquivo(s) com mais de 400 linhas.`,
    );
    if (bigFiles.length)
      improvements.push({
        title: 'Divida arquivos muito grandes',
        why: `${bigFiles.length} arquivo(s) passam de 400 linhas (ex.: ${bigFiles[0].path}). Arquivos grandes geralmente acumulam responsabilidades demais.`,
        how: 'Separe por responsabilidade: tipos em um arquivo, regras em outro, utilitários em outro.',
        priority: 'baixa',
      });
  }

  const errorHandling = sourceFiles.some((f) =>
    /\btry\s*[{:]|\bcatch\b|\bexcept\b|\brescue\b|throw new|raise \w|if err != nil|ExceptionFilter|@ControllerAdvice|errorHandler/.test(
      f.content,
    ),
  );
  if (sourceFiles.length === 0)
    check('errors', 'Tratamento de erros', 5, null, 'Sem código.');
  else if (errorHandling) {
    check(
      'errors',
      'Tratamento de erros',
      5,
      1,
      'O código trata e sinaliza erros explicitamente.',
    );
  } else {
    check(
      'errors',
      'Tratamento de erros',
      5,
      0.2,
      'Não encontrei tratamento explícito de erros.',
    );
    improvements.push({
      title: 'Trate os erros explicitamente',
      why: 'Quando algo dá errado (banco fora do ar, entrada inválida), o usuário deve receber uma mensagem clara — e não um erro genérico ou um travamento.',
      how: 'Lance erros com mensagens descritivas nos pontos de falha e centralize o tratamento (ex.: um middleware/filtro global de exceções).',
      priority: 'média',
    });
  }

  if (!isApi)
    check(
      'validation',
      'Validação de dados de entrada',
      5,
      null,
      'Não é uma API.',
    );
  else {
    const validates =
      has(
        'Zod',
        'class-validator',
        'Joi / Yup',
        'Pydantic',
        'Bean Validation',
        'FastAPI',
      ) ||
      sourceFiles.some((f) =>
        /@Valid\b|serializers\.|FormRequest|validator\.|\.validate\(/.test(
          f.content,
        ),
      );
    check(
      'validation',
      'Validação de dados de entrada',
      5,
      validates ? 1 : 0,
      validates
        ? 'Usa biblioteca/mecanismo de validação.'
        : 'Não encontrei validação de entrada.',
    );
    if (validates)
      strengths.push(
        'Valida os dados que chegam na API — uma das defesas mais importantes.',
      );
    else
      improvements.push({
        title: 'Valide tudo o que chega na API',
        why: 'Sem validação, dados inválidos ou maliciosos chegam até o banco. É uma das maiores fontes de bugs e falhas de segurança.',
        how: `Declare um schema para cada entrada (${has('Python') ? 'Pydantic' : has('Java', 'Kotlin') ? 'Bean Validation com @Valid' : 'Zod ou class-validator'}) e rejeite com 400 o que não bater.`,
        priority: 'alta',
      });
  }

  let debugCount = 0;
  let debugExample = '';
  for (const f of sourceFiles) {
    const matches = f.content.match(
      /\bconsole\.log\(|\bdebugger;|\bvar_dump\(|\bdd\(|System\.out\.println\(|\bpp\s|binding\.pry/g,
    );
    if (matches) {
      debugCount += matches.length;
      if (!debugExample) debugExample = f.path;
    }
  }
  check(
    'debug',
    'Sem restos de depuração',
    4,
    debugCount === 0 ? 1 : debugCount <= 3 ? 0.6 : 0.2,
    `${debugCount} ocorrência(s) de console.log/print de depuração.`,
  );
  if (debugCount > 3)
    improvements.push({
      title: 'Troque prints de depuração por um logger',
      why: `Encontrei ${debugCount} console.log/println (ex.: ${debugExample}). Eles poluem a saída e podem vazar dados sensíveis em produção.`,
      how: 'Use um logger com níveis (info/warn/error), que pode ser configurado por ambiente e mascarar campos sensíveis.',
      priority: 'baixa',
    });

  const todos = sourceFiles.reduce(
    (s, f) => s + (f.content.match(/\b(TODO|FIXME|HACK|XXX)\b/g)?.length ?? 0),
    0,
  );
  check(
    'todos',
    'Pendências (TODO/FIXME) sob controle',
    3,
    todos === 0 ? 1 : todos <= 5 ? 0.7 : 0.3,
    `${todos} TODO/FIXME no código.`,
  );
  if (todos > 5)
    improvements.push({
      title: 'Transforme TODOs em issues',
      why: `Há ${todos} TODO/FIXME espalhados. Comentários de pendência tendem a ser esquecidos.`,
      how: 'Crie issues no GitHub para cada pendência relevante e remova o comentário (ou referencie a issue nele).',
      priority: 'baixa',
    });

  if (isSnippet)
    check(
      'config',
      '.gitignore e configuração por ambiente',
      4,
      null,
      'Não se aplica a um trecho isolado.',
    );
  else {
    const gitignore = hasFile(/(^|\/)\.gitignore$/);
    const usesEnv = sourceFiles.some((f) =>
      /process\.env|os\.environ|os\.getenv|System\.getenv|ConfigService|env\(/.test(
        f.content,
      ),
    );
    const envExample = hasFile(
      /\.env\.(example|sample|template)$|\.env\.dist$/,
    );
    const envCommitted = hasFile(/(^|\/)\.env$/);
    let ratio = (gitignore ? 0.5 : 0) + (!usesEnv || envExample ? 0.5 : 0);
    if (envCommitted) ratio = Math.min(ratio, 0.2);
    check(
      'config',
      '.gitignore e configuração por ambiente',
      4,
      ratio,
      `${gitignore ? 'Tem' : 'Sem'} .gitignore; ${usesEnv ? (envExample ? 'variáveis documentadas em .env.example' : 'usa variáveis de ambiente sem .env.example') : 'sem variáveis de ambiente'}${envCommitted ? '; arquivo .env versionado!' : ''}.`,
    );
    if (envCommitted)
      improvements.push({
        title: 'Remova o arquivo .env do repositório',
        why: 'O .env costuma conter senhas e chaves; versionado, elas ficam visíveis para todos e para sempre no histórico.',
        how: 'Adicione `.env` ao .gitignore, rode `git rm --cached .env`, crie um `.env.example` só com os nomes das variáveis e troque os segredos expostos.',
        priority: 'alta',
      });
    else if (usesEnv && !envExample)
      improvements.push({
        title: 'Documente as variáveis de ambiente',
        why: 'O código lê variáveis de ambiente, mas não há um .env.example dizendo quais são — quem clona o projeto fica adivinhando.',
        how: 'Crie um `.env.example` com todas as variáveis (sem valores reais) e um comentário curto explicando cada uma.',
        priority: 'baixa',
      });
  }

  if (isSnippet) {
    check(
      'ci',
      'Integração contínua (CI)',
      3,
      null,
      'Não se aplica a um trecho isolado.',
    );
    check(
      'docker',
      'Ambiente reproduzível (Docker)',
      3,
      null,
      'Não se aplica a um trecho isolado.',
    );
  } else {
    const ci =
      has('GitHub Actions', 'GitLab CI', 'Jenkins') ||
      hasFile(/\.circleci\/|azure-pipelines\.yml|bitbucket-pipelines\.yml/);
    check(
      'ci',
      'Integração contínua (CI)',
      3,
      ci ? 1 : 0,
      ci ? 'Pipeline de CI configurado.' : 'Sem pipeline de CI.',
    );
    if (ci)
      strengths.push(
        'Tem integração contínua: testes e build rodam automaticamente.',
      );
    else
      improvements.push({
        title: 'Adicione um pipeline de CI',
        why: 'Com CI, testes e lint rodam a cada push/pull request — erros são pegos antes de chegar à branch principal.',
        how: 'Um workflow simples do GitHub Actions (instalar dependências, rodar lint, testes e build) leva poucos minutos para configurar.',
        priority: 'baixa',
      });
    const docker = has('Docker', 'Docker Compose');
    check(
      'docker',
      'Ambiente reproduzível (Docker)',
      3,
      docker ? 1 : 0,
      docker ? 'Containerizado com Docker.' : 'Sem Docker.',
    );
    if (docker)
      strengths.push('Usa Docker, então o ambiente é fácil de reproduzir.');
    else
      improvements.push({
        title: 'Containerize o projeto',
        why: 'Com Docker, qualquer pessoa sobe o projeto (e o banco) com um comando, sem "na minha máquina funciona".',
        how: 'Crie um Dockerfile para a aplicação e um docker-compose.yml com os serviços de que ela depende (banco, cache).',
        priority: 'baixa',
      });
  }

  const applicable = checks.filter((c) => c.status !== 'na');
  const total = applicable.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = applicable.reduce((s, c) => s + c.earned, 0);
  const score = Math.round((earned / total) * 100) / 10;

  const level =
    score >= 9
      ? 'Excelente'
      : score >= 7.5
        ? 'Muito bom'
        : score >= 6
          ? 'Bom caminho'
          : score >= 4
            ? 'Em evolução'
            : 'Primeiros passos';
  const message =
    score >= 9
      ? 'Código muito bem cuidado! As sugestões abaixo são refinamentos — você já está num nível alto.'
      : score >= 7.5
        ? 'Código sólido, com boas práticas visíveis. Alguns ajustes pontuais vão deixá-lo ainda mais confiável.'
        : score >= 6
          ? 'Uma base boa, que já funciona. Com as melhorias abaixo, o código fica mais seguro e fácil de manter.'
          : score >= 4
            ? 'Todo código bom começou assim. Foque primeiro nas sugestões de prioridade alta — elas trazem o maior ganho com o menor esforço.'
            : 'Esse é o começo da jornada — e começar é a parte mais difícil. Escolha uma sugestão por vez; cada uma vai fazer diferença.';

  const finalMessage = isSnippet
    ? `${message} (Como é um trecho isolado, a nota considera só os critérios que se aplicam a um trecho — testes, README, CI e Docker ficam de fora.)`
    : message;

  const order = { alta: 0, média: 1, baixa: 2 } as const;
  improvements.sort((a, b) => order[a.priority] - order[b.priority]);

  return {
    score,
    level,
    message: finalMessage,
    strengths,
    improvements,
    checks,
  };
}
