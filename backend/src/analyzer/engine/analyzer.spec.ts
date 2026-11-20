import { analyzeProject } from './analyzer.js';
import { bankingApi } from './__fixtures__/banking-api.js';
import { renderMarkdown } from './report.js';

describe('analyzeProject (API bancária de exemplo)', () => {
  const result = analyzeProject(bankingApi);

  it('entende a ideia: API do domínio bancário', () => {
    expect(result.idea.projectName).toBe('Banco Digital API');
    expect(result.idea.projectType).toBe('API / backend');
    expect(result.idea.domain).toBe('bancário / financeiro');
    expect(result.idea.audience).toMatch(/fintechs/);
  });

  it('extrai os endpoints do NestJS com prefixo do controller', () => {
    const routes = result.idea.endpoints.map((e) => `${e.method} ${e.path}`);
    expect(routes).toEqual(
      expect.arrayContaining([
        'POST /accounts',
        'GET /accounts/:id/balance',
        'POST /transfers',
        'GET /transfers',
      ]),
    );
  });

  it('detecta tecnologias com versões', () => {
    const byName = Object.fromEntries(
      result.stack.technologies.map((t) => [t.name, t]),
    );
    expect(byName['NestJS'].version).toBe('11.0.1');
    expect(byName['Prisma'].version).toBe('6.2.0');
    expect(byName['TypeScript'].version).toBe('5.7.3');
    expect(byName['Node.js'].version).toBe('20.0.0');
    expect(byName['PostgreSQL']).toBeDefined(); // vindo do schema.prisma
    expect(byName['Jest'].category).toBe('Testes');
  });

  it('reconhece a arquitetura modular e em camadas', () => {
    const names = result.stack.architecture.map((a) => a.name);
    expect(names.some((n) => n.includes('modular'))).toBe(true);
    expect(names.some((n) => n.includes('camadas'))).toBe(true);
  });

  it('destaca a transferência atômica como trecho mais importante', () => {
    const first = result.highlights[0];
    expect(first.title).toBe('transfer()');
    expect(first.file).toBe('src/transfers/transfers.service.ts');
    expect(first.observations.join(' ')).toMatch(/transação/);
    expect(first.interesting.length).toBeGreaterThan(0);
  });

  it('encontra o segredo fixo no código e não o expõe', () => {
    const secrets = result.quality.checks.find((c) => c.id === 'secrets')!;
    expect(secrets.status).toBe('melhorar');
    expect(secrets.detail).not.toContain('meuSegredoSuperForte2024');
    expect(result.quality.improvements[0].title).toMatch(/segredos/);
  });

  it('dá uma nota entre 0 e 10 com sugestões construtivas', () => {
    expect(result.quality.score).toBeGreaterThan(0);
    expect(result.quality.score).toBeLessThanOrEqual(10);
    expect(result.quality.improvements.every((i) => i.why && i.how)).toBe(true);
  });

  it('gera o relatório com as 4 seções e sem o segredo', () => {
    const md = renderMarkdown(result, 'Banco');
    expect(md).toContain('## 1. A ideia do código');
    expect(md).toContain('## 2. Stack e estrutura');
    expect(md).toContain('## 3. Pontos importantes do código');
    expect(md).toContain('## 4. Nota e como melhorar');
    expect(md).not.toContain('meuSegredoSuperForte2024');
  });
});

describe('analyzeProject (trecho isolado)', () => {
  it('trata um arquivo solto como trecho e ignora critérios de projeto', () => {
    const r = analyzeProject([
      {
        path: 'main.py',
        content:
          'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/ping")\ndef ping():\n    return "pong"\n',
      },
    ]);
    expect(r.stack.technologies.map((t) => t.name)).toContain('Flask');
    expect(r.quality.checks.find((c) => c.id === 'tests')!.status).toBe('na');
    expect(r.idea.endpoints[0]).toMatchObject({ method: 'GET', path: '/ping' });
  });
});

describe('leitura do README', () => {
  it('usa o parágrafo de introdução mesmo dentro de citação e ignora instruções', () => {
    const r = analyzeProject([
      {
        path: 'README.md',
        content:
          '# ![Minha API](logo.png)\n\n> ### Uma API de exemplo com autenticação, artigos e comentários.\n\nRode o comando abaixo para instalar as dependências:\n\n```\nnpm i\n```\n',
      },
      { path: 'src/app.ts', content: 'export const app = 1;\n' },
    ]);
    expect(r.idea.projectName).toBe('Minha API');
    expect(r.idea.summary).toContain('Uma API de exemplo com autenticação');
    expect(r.idea.summary).not.toContain('Rode o comando');
  });
});
