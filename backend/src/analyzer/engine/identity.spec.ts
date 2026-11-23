import { analyzeProject } from './analyzer.js';
import {
  MINIMAP_MAX_FILES,
  MINIMAP_MAX_LINES,
  buildSourceIdentity,
  encodeMinimap,
  fingerprintOf,
} from './identity.js';
import { renderMarkdown } from './report.js';

const SEGREDO = 'SENHA_DO_CLIENTE_123';
const code = [
  '// conexão com o banco',
  `const db = "postgres://admin:${SEGREDO}@prod/db";`,
  '',
  'export function total(itens) {',
  '    return itens.reduce((s, i) => s + i.preco, 0);',
  '}',
].join('\n');

describe('identidade da fonte', () => {
  it('a impressão digital não depende da ordem dos arquivos, só do conteúdo', () => {
    const a = { path: 'a.ts', content: 'x' };
    const b = { path: 'b.ts', content: 'y' };
    expect(fingerprintOf([a, b])).toBe(fingerprintOf([b, a]));
    expect(fingerprintOf([a, b])).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf([a, { ...b, content: 'z' }])).not.toBe(
      fingerprintOf([a, b]),
    );
  });

  it('o minimapa guarda só o formato das linhas, nenhum caractere do código', () => {
    const { lines, totalLines } = encodeMinimap(code);
    expect(totalLines).toBe(6);
    expect(lines).toHaveLength(6 * 3);
    // só o alfabeto do minimapa: tipo + 2 dígitos base 36
    expect(lines).toMatch(/^([c#_][0-9a-z]{2})+$/);
    expect(lines).not.toContain('SENHA');
    expect(lines.slice(0, 3)[0]).toBe('#'); // comentário
    expect(lines.slice(6, 9)).toBe('_00'); // linha vazia
    expect(lines.slice(12, 15)[1]).toBe('2'); // recuo de 4 espaços = 2
  });

  it('limita linhas e arquivos e prefere o código do produto', () => {
    const big = Array.from({ length: 500 }, (_, i) => `linha ${i}`).join('\n');
    const files = [
      { path: 'README.md', content: big + big },
      { path: 'src/a.test.ts', content: big + big },
      ...Array.from({ length: 6 }, (_, i) => ({
        path: `src/m${i}.ts`,
        content: big,
      })),
    ];
    const id = buildSourceIdentity(files, 'a'.repeat(40));
    expect(id.commit).toBe('a'.repeat(40));
    expect(id.minimap).toHaveLength(MINIMAP_MAX_FILES);
    expect(id.minimap.every((m) => m.path.startsWith('src/m'))).toBe(true);
    expect(id.minimap[0].totalLines).toBe(500);
    expect(id.minimap[0].lines).toHaveLength(MINIMAP_MAX_LINES * 3);
    expect(JSON.stringify(id)).not.toContain('linha');
  });

  it('o relatório diz de onde veio o código', () => {
    const files = [{ path: 'total.ts', content: code }];
    const md = renderMarkdown(analyzeProject(files), 'Total', {
      label: 'dono/repo @ abc1234',
      url: 'https://github.com/dono/repo/tree/abc1234',
      fingerprint: fingerprintOf(files),
    });
    expect(md).toContain(
      '**Fonte:** [dono/repo @ abc1234](https://github.com/dono/repo/tree/abc1234)',
    );
    expect(md).toContain(`sha256:${fingerprintOf(files).slice(0, 16)}`);
  });
});
