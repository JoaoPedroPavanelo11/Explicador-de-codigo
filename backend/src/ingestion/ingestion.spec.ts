import { deflateRawSync } from 'node:zlib';
import { IngestError } from '../analyzer/engine/normalize.js';
import { downloadGithubZip, parseGithubUrl } from './github-fetcher.js';
import { priorityOf, triage } from './triage.js';
import { extractZip, isZip } from './zip-extractor.js';

// zip mínimo montado na mão, para não depender de lib nos testes.
// declaredSize: mente no índice o tamanho descompactado (simula zip bomb)
function makeZip(
  entries: {
    name: string;
    data: string;
    symlink?: boolean;
    declaredSize?: number;
  }[],
): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const raw = Buffer.from(e.data);
    const comp = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.declaredSize ?? raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // criado em Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(e.declaredSize ?? raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((e.symlink ? 0o120777 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const limits = {
  maxEntries: 100,
  maxFiles: 50,
  maxTotalBytes: 10_000,
  maxFileBytes: 5_000,
};

describe('extractZip', () => {
  it('extrai arquivos, ignora links simbólicos e remove a pasta raiz', async () => {
    const zip = makeZip([
      { name: 'repo-main/src/app.ts', data: 'export const x = 1;' },
      { name: 'repo-main/link.ts', data: '/etc/shadow', symlink: true },
    ]);
    expect(isZip(zip)).toBe(true);
    const { files, skipped } = await extractZip(zip, limits);
    expect(files.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(skipped).toBe(1);
  });

  it('descarta lixo e arquivo grande demais sem abrir, e segue com o resto', async () => {
    const zip = makeZip([
      { name: 'src/app.ts', data: 'export const x = 1;' },
      { name: 'node_modules/lib/index.js', data: 'lixo' },
      { name: 'logo.png', data: 'png' },
      { name: 'src/gerado.ts', data: 'x'.repeat(6_000) }, // > maxFileBytes
    ]);
    const { files, triage: plan } = await extractZip(zip, limits);
    expect(files.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(plan.oversized).toBe(1);
    expect(plan.leftOut).toBe(0);
  });

  it('projeto acima do orçamento vira visão panorâmica, não erro', async () => {
    const zip = makeZip([
      { name: 'src/a.ts', data: 'a'.repeat(4_000) },
      { name: 'src/b.ts', data: 'b'.repeat(4_000) },
      { name: 'src/c.ts', data: 'c'.repeat(4_000) }, // estoura os 10.000 bytes
    ]);
    const { files, triage: plan } = await extractZip(zip, limits);
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(plan.leftOut).toBe(1);
    expect(plan.inventory).toHaveLength(3); // o índice conhece os 3
  });

  it('recusa zip bomb (índice declara tamanho menor que o real)', async () => {
    const zip = makeZip([
      { name: 'bomba.ts', data: 'a'.repeat(4_000), declaredSize: 10 },
    ]);
    await expect(extractZip(zip, limits)).rejects.toThrow(/zip bomb/);
  });

  it('recusa zip slip (entradas com "../")', async () => {
    const zip = makeZip([
      { name: 'src/app.ts', data: 'ok' },
      { name: '../../etc/passwd', data: 'root:x:0:0' },
    ]);
    await expect(extractZip(zip, limits)).rejects.toThrow(/caminhos inválidos/);
  });

  it('recusa zip com entradas demais antes de ler qualquer coisa', async () => {
    const zip = makeZip(
      Array.from({ length: 101 }, (_, i) => ({ name: `f${i}.ts`, data: 'x' })),
    );
    await expect(extractZip(zip, limits)).rejects.toThrow(/entradas/);
  });

  it('recusa arquivos que não são zip', async () => {
    await expect(
      extractZip(Buffer.from('não sou um zip'), limits),
    ).rejects.toBeInstanceOf(IngestError);
  });
});

describe('triage', () => {
  const entry = (name: string, size = 100) => ({ name, size });

  it('ordena por importância: configuração, código do produto, testes, resto', () => {
    expect(priorityOf('package.json')).toBe(0);
    expect(priorityOf('apps/api/Dockerfile')).toBe(0);
    expect(priorityOf('.github/workflows/ci.yml')).toBe(0);
    expect(priorityOf('src/users/users.service.ts')).toBe(1);
    expect(priorityOf('src/users/users.service.spec.ts')).toBe(2);
    expect(priorityOf('docs/guia.md')).toBe(3);
  });

  it('no limite de quantidade, fica com os mais importantes e conhece todos', () => {
    const plan = triage(
      [
        entry('docs/a.md'),
        entry('src/app.spec.ts'),
        entry('src/app.ts'),
        entry('package.json'),
      ],
      { maxFiles: 2, maxFileBytes: 1_000, maxTotalBytes: 10_000 },
    );
    expect([...plan.toRead.values()]).toEqual(['package.json', 'src/app.ts']);
    expect(plan.leftOut).toBe(2);
    expect(plan.inventory).toHaveLength(4);
  });

  it('um arquivo que não coube no total não impede os menores depois dele', () => {
    const plan = triage(
      [entry('src/a.ts', 600), entry('src/b.ts', 600), entry('src/c.ts', 300)],
      { maxFiles: 10, maxFileBytes: 1_000, maxTotalBytes: 1_000 },
    );
    expect([...plan.toRead.values()]).toEqual(['src/a.ts', 'src/c.ts']);
    expect(plan.leftOut).toBe(1);
  });
});

describe('parseGithubUrl (proteção contra SSRF)', () => {
  it('aceita URLs públicas do GitHub', () => {
    expect(parseGithubUrl('https://github.com/nestjs/nest')).toEqual({
      owner: 'nestjs',
      repo: 'nest',
    });
    expect(
      parseGithubUrl('https://github.com/user/repo.git/tree/main'),
    ).toEqual({ owner: 'user', repo: 'repo' });
  });

  it.each([
    'http://github.com/a/b',
    'https://evil.com/a/b',
    'https://github.com.evil.com/a/b',
    'https://user:pass@github.com/a/b',
    'https://github.com:8080/a/b',
    'https://169.254.169.254/latest/meta-data',
    'https://github.com/a',
    'https://github.com/-invalido/repo',
    'file:///etc/passwd',
  ])('recusa %s', (url) => {
    expect(() => parseGithubUrl(url)).toThrow(IngestError);
  });
});

describe('downloadGithubZip', () => {
  it('monta a URL no host fixo e respeita o limite de tamanho', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return new Response(new Uint8Array(2_000), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      downloadGithubZip(
        { owner: 'a', repo: 'b' },
        { maxBytes: 1_000, timeoutMs: 1_000, fetchImpl: fakeFetch },
      ),
    ).rejects.toThrow(/grande demais/);
    expect(calls[0]).toBe('https://codeload.github.com/a/b/zip/HEAD');
  });

  it('explica quando o repositório não existe ou é privado', async () => {
    const fakeFetch = (async () =>
      new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(
      downloadGithubZip(
        { owner: 'a', repo: 'b' },
        { maxBytes: 1_000, timeoutMs: 1_000, fetchImpl: fakeFetch },
      ),
    ).rejects.toThrow(/privado/);
  });
});
