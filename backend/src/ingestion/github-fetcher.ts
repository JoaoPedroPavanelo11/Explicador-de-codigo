import { IngestError } from '../analyzer/engine/normalize.js';

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

// regras de nome do github
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

// a URL do usuário nunca é requisitada: só tiramos dono/repo dela e o download
// é montado sempre em codeload.github.com (evita SSRF)
export function parseGithubUrl(input: string): GithubRepoRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new IngestError(
      'URL inválida. Use o formato https://github.com/dono/repositorio',
    );
  }
  if (
    url.protocol !== 'https:' ||
    !['github.com', 'www.github.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new IngestError(
      'Só aceitamos URLs https://github.com/dono/repositorio',
    );
  }
  const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, '');
  if (
    !owner ||
    !repo ||
    !OWNER.test(owner) ||
    !REPO.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    throw new IngestError(
      'Não consegui identificar o dono e o repositório na URL.',
    );
  }
  return { owner, repo };
}

export interface FetchOptions {
  maxBytes: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export async function downloadGithubZip(
  ref: GithubRepoRef,
  opts: FetchOptions,
): Promise<Buffer> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://codeload.github.com/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/zip/HEAD`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      redirect: 'error', // não seguimos redirecionamentos para outros hosts
      headers: { 'User-Agent': 'explicador-de-codigo' },
    });
    if (res.status === 404)
      throw new IngestError(
        'Repositório não encontrado ou privado. Só repositórios públicos podem ser analisados.',
      );
    if (!res.ok || !res.body)
      throw new IngestError(
        `O GitHub respondeu com erro (${res.status}). Tente novamente mais tarde.`,
      );

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > opts.maxBytes)
      throw new IngestError(
        `O repositório é grande demais (limite de ${Math.round(opts.maxBytes / 1024 / 1024)} MB compactado).`,
      );

    // content-length pode faltar ou mentir, então conta durante a leitura
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > opts.maxBytes) {
        await reader.cancel();
        throw new IngestError(
          `O repositório é grande demais (limite de ${Math.round(opts.maxBytes / 1024 / 1024)} MB compactado).`,
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof IngestError) throw error;
    if (controller.signal.aborted)
      throw new IngestError('O download do repositório demorou demais.');
    throw new IngestError('Não foi possível baixar o repositório do GitHub.');
  } finally {
    clearTimeout(timer);
  }
}
