import { basename, isAuxiliaryPath } from './languages.js';
import type { SourceFile } from './types.js';

export interface SecretFinding {
  file: string;
  line: number;
  kind: string;
  // já mascarado, o valor real não é guardado
  preview: string;
}

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'Chave de acesso AWS', re: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    kind: 'Chave privada',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  { kind: 'Token do GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: 'Chave da API Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'Chave de API (sk-...)', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/g },
  { kind: 'Chave secreta do Stripe', re: /\b[sr]k_live_[0-9a-zA-Z]{20,}\b/g },
  { kind: 'Chave de API do Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'Token do Slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    kind: 'JWT fixo no código',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    kind: 'String de conexão com senha',
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/'"]+:[^@\s'"]{3,}@[^\s'"]+/g,
  },
  {
    kind: 'Senha/segredo atribuído no código',
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|senha|jwt[_-]?secret)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
  },
];

const PLACEHOLDER =
  /(example|exemplo|changeme|change-me|troque|your[_-]|seu[_-]|xxx|\*\*\*|<.+>|\$\{|process\.env|os\.environ|getenv|dummy|placeholder|sample|fake|test|localhost|123456|password$|senha$)/i;

function shouldSkip(path: string): boolean {
  const name = basename(path).toLowerCase();
  return (
    /\.(md|txt|rst|lock)$/.test(name) ||
    name.includes('.example') ||
    name.includes('.sample') ||
    name.includes('.template') ||
    isAuxiliaryPath(path)
  );
}

export function mask(value: string): string {
  if (value.length <= 6) return '****';
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(12, value.length - 4))}`;
}

const MAX_LINE = 2000; // linha maior que isso é minificada: ignorada

// início de cada linha, para achar o número da linha de um match
function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1))
    starts.push(i + 1);
  return starts;
}

// índice (0-based) da linha que contém o offset
function lineIndexAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Cada regex roda uma vez sobre o arquivo inteiro (e não linha a linha): em
// projetos grandes isso é várias vezes mais rápido. O número da linha só é
// calculado quando aparece um match, o que é raro.
export function findSecrets(files: SourceFile[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (shouldSkip(file.path)) continue;
    const text = file.content;
    const found: SecretFinding[] = [];
    let starts: number[] | null = null;

    for (const { kind, re } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        if (m[0].includes('\n')) continue; // segredo não atravessa linhas
        const value = m[1] ?? m[0];
        if (PLACEHOLDER.test(value)) continue;
        starts ??= lineStartsOf(text);
        const idx = lineIndexAt(starts, m.index);
        const end = idx + 1 < starts.length ? starts[idx + 1] - 1 : text.length;
        if (end - starts[idx] > MAX_LINE) continue;
        found.push({ file: file.path, line: idx + 1, kind, preview: mask(value) });
      }
    }

    // .env commitado: arquivo pequeno, linha a linha mesmo
    const isEnvFile =
      /(^|\/)\.env(\.[\w-]+)?$/.test(file.path) &&
      !file.path.includes('example');
    if (isEnvFile)
      text.split('\n').forEach((line, idx) => {
        if (
          line.length > MAX_LINE ||
          !/^\s*[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Z0-9_]*\s*=\s*\S{6,}/.test(
            line,
          )
        )
          return;
        const value = line.split('=').slice(1).join('=').trim();
        if (!PLACEHOLDER.test(value))
          found.push({
            file: file.path,
            line: idx + 1,
            kind: 'Segredo em arquivo .env versionado',
            preview: mask(value),
          });
      });

    // em ordem de linha, como antes (sort estável mantém a ordem dos padrões)
    findings.push(...found.sort((a, b) => a.line - b.line));
  }
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.file}:${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// usado antes de mostrar trecho no relatório e antes de mandar para a IA
export function redactSecrets(code: string): string {
  let out = code;
  for (const { re } of PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, (match: string, group?: unknown) => {
      const value = typeof group === 'string' ? group : match;
      if (PLACEHOLDER.test(value)) return match;
      return match.replace(value, mask(value));
    });
  }
  return out;
}
