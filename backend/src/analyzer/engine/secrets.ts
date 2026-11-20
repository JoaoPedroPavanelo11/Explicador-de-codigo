import { basename, isAuxiliaryPath } from './languages.js';
import type { SourceFile } from './types.js';

export interface SecretFinding {
  file: string;
  line: number;
  kind: string;
  /** Prévia mascarada — o valor real NUNCA é guardado nem exibido. */
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

/** Valores claramente de exemplo não contam como vazamento. */
const PLACEHOLDER =
  /(example|exemplo|changeme|change-me|troque|your[_-]|seu[_-]|xxx|\*\*\*|<.+>|\$\{|process\.env|os\.environ|getenv|dummy|placeholder|sample|fake|test|localhost|123456|password$|senha$)/i;

/** Arquivos onde exemplos de credenciais são esperados. */
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

export function findSecrets(files: SourceFile[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (shouldSkip(file.path)) continue;
    const isEnvFile =
      /(^|\/)\.env(\.[\w-]+)?$/.test(file.path) &&
      !file.path.includes('example');
    const lines = file.content.split('\n');
    lines.forEach((line, idx) => {
      if (line.length > 2000) return; // linhas minificadas
      for (const { kind, re } of PATTERNS) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) {
          const value = m[1] ?? m[0];
          if (PLACEHOLDER.test(value)) continue;
          findings.push({
            file: file.path,
            line: idx + 1,
            kind,
            preview: mask(value),
          });
        }
      }
      // Um arquivo .env versionado é um problema por si só.
      if (
        isEnvFile &&
        /^\s*[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Z0-9_]*\s*=\s*\S{6,}/.test(
          line,
        )
      ) {
        const value = line.split('=').slice(1).join('=').trim();
        if (!PLACEHOLDER.test(value))
          findings.push({
            file: file.path,
            line: idx + 1,
            kind: 'Segredo em arquivo .env versionado',
            preview: mask(value),
          });
      }
    });
  }
  // Remove duplicatas na mesma linha.
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.file}:${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Mascara segredos dentro de um trecho de código antes de exibi-lo no
 * relatório ou enviá-lo para a IA.
 */
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
