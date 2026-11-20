import { extractUnits, measureComplexity } from './code-units.js';

describe('extractUnits', () => {
  it('extrai funções e métodos de TypeScript com as linhas corretas', () => {
    const units = extractUnits({
      path: 'src/x.ts',
      content: [
        'export function soma(a: number, b: number) {',
        '  return a + b;',
        '}',
        '',
        'export class Conta {',
        '  async sacar(valor: number): Promise<void> {',
        "    if (valor <= 0) throw new Error('inválido');",
        '    this.saldo -= valor;',
        '  }',
        '}',
        'const dobro = (n: number) => {',
        '  return n * 2;',
        '};',
      ].join('\n'),
    });
    expect(units.map((u) => [u.name, u.startLine, u.endLine])).toEqual([
      ['soma', 1, 3],
      ['sacar', 6, 9],
      ['dobro', 11, 13],
    ]);
  });

  it('extrai funções Python pela indentação', () => {
    const units = extractUnits({
      path: 'app.py',
      content:
        'def ola(nome):\n    if not nome:\n        return "?"\n    return f"Olá {nome}"\n\nx = 1\n',
    });
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ name: 'ola', startLine: 1, endLine: 4 });
  });

  it('não confunde chaves dentro de strings com blocos', () => {
    const units = extractUnits({
      path: 'a.js',
      content: "function f() {\n  const s = '}{';\n  return s;\n}\n",
    });
    expect(units[0].endLine).toBe(4);
  });
});

describe('measureComplexity', () => {
  it('conta pontos de decisão', () => {
    expect(measureComplexity('return 1;')).toBe(1);
    expect(
      measureComplexity('if (a && b) { for (;;) {} } else if (c) {}'),
    ).toBe(5);
  });
});
