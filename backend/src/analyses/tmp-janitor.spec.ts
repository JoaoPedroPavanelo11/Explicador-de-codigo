import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepUploads } from './tmp-janitor.js';

describe('faxina da pasta temporária', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'faxina-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('apaga só o código esquecido há mais tempo que o limite', async () => {
    const now = Date.now();
    await writeFile(join(dir, 'velho.json'), '[]');
    await writeFile(join(dir, 'novo.zip'), 'PK');
    const old = new Date(now - 31 * 60 * 1000);
    await utimes(join(dir, 'velho.json'), old, old);

    expect(await sweepUploads(dir, 30 * 60 * 1000, now)).toBe(1);
    expect(await readdir(dir)).toEqual(['novo.zip']);
  });

  it('não quebra se a pasta ainda não existe', async () => {
    expect(await sweepUploads(join(dir, 'nao-existe'), 1000)).toBe(0);
  });
});
