import { IngestError, normalizeFiles, normalizePath } from './normalize.js';

describe('normalizePath (proteção contra path traversal)', () => {
  it.each([
    ['../../etc/passwd', null],
    ['/etc/passwd', null],
    ['C:\\Windows\\system.ini', null],
    ['src/../../segredo', null],
    ['node_modules/lib/index.js', null],
    ['__MACOSX/src/._app.ts', null],
    ['./src\\app.ts', 'src/app.ts'],
    ['src//utils/./x.ts', 'src/utils/x.ts'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('normalizeFiles', () => {
  it('descarta binários, lockfiles e extensões desconhecidas', () => {
    const { files, skipped } = normalizeFiles([
      { path: 'src/app.ts', content: 'export const a = 1;' },
      { path: 'logo.png', content: Buffer.from([0x89, 0x50, 0x00, 0x01]) },
      { path: 'package-lock.json', content: '{}' },
      { path: 'arquivo.exe', content: 'MZ' },
    ]);
    expect(files.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(skipped).toBe(3);
  });

  it('respeita os limites de quantidade e tamanho', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      path: `f${i}.ts`,
      content: 'x',
    }));
    expect(() =>
      normalizeFiles(many, {
        maxFiles: 3,
        maxFileBytes: 100,
        maxTotalBytes: 1000,
      }),
    ).toThrow(IngestError);
    const big = [
      { path: 'a.ts', content: 'x'.repeat(600) },
      { path: 'b.ts', content: 'y'.repeat(600) },
    ];
    expect(() =>
      normalizeFiles(big, {
        maxFiles: 10,
        maxFileBytes: 1000,
        maxTotalBytes: 1000,
      }),
    ).toThrow(/limite/);
  });

  it('falha com mensagem clara quando não há código', () => {
    expect(() => normalizeFiles([{ path: 'foto.jpg', content: 'x' }])).toThrow(
      /Não encontrei/,
    );
  });
});
