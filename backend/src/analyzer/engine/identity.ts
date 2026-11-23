import { createHash } from 'node:crypto';
import { isAuxiliaryPath, languageOf } from './languages.js';
import type { SourceFile } from './types.js';

// Identidade do código analisado: serve para o usuário reconhecer, depois, de
// qual código veio uma explicação, SEM guardarmos o código.
//
// - fingerprint: SHA-256 do conteúdo. Mesmo código = mesma impressão digital,
//   mas não dá para voltar do hash para o código.
// - minimap: o "formato" dos arquivos principais, como o minimapa do VS Code.
//   Cada linha vira 3 caracteres (tipo, recuo e comprimento); nenhum caractere
//   do código original entra aqui, só esses números.
// - commit: quando veio do GitHub, a versão exata que foi lida.

export interface MinimapFile {
  path: string;
  totalLines: number;
  // 3 caracteres por linha: tipo (c código, # comentário, _ vazia),
  // recuo/2 e comprimento/4, os dois em base 36 limitados a "z" (35)
  lines: string;
}

export interface SourceIdentity {
  fingerprint: string;
  commit?: string;
  minimap: MinimapFile[];
}

export const MINIMAP_MAX_FILES = 4;
export const MINIMAP_MAX_LINES = 160;

const COMMENT = /^(\/\/|#|\/\*|\*|--|<!--|""")/;

const b36 = (n: number) => Math.min(35, Math.max(0, n)).toString(36);

function encodeLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '_00';
  const indent =
    line.replace(/\t/g, '    ').length -
    line.trimStart().replace(/\t/g, '    ').length;
  const kind = COMMENT.test(trimmed) ? '#' : 'c';
  return (
    kind + b36(Math.round(indent / 2)) + b36(Math.ceil(trimmed.length / 4))
  );
}

export function encodeMinimap(content: string): Omit<MinimapFile, 'path'> {
  const all = content.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return {
    totalLines: all.length,
    lines: all.slice(0, MINIMAP_MAX_LINES).map(encodeLine).join(''),
  };
}

export function fingerprintOf(files: SourceFile[]): string {
  const hash = createHash('sha256');
  // ordem fixa: o mesmo projeto dá o mesmo hash, venha o zip na ordem que vier
  for (const f of [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  ))
    hash.update(f.path).update('\0').update(f.content).update('\0');
  return hash.digest('hex');
}

// os arquivos que melhor "desenham" o projeto: código do produto, maiores primeiro
function pickFiles(files: SourceFile[]): SourceFile[] {
  const product = files.filter(
    (f) => languageOf(f.path) && !isAuxiliaryPath(f.path),
  );
  const pool = product.length ? product : files;
  return [...pool]
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, MINIMAP_MAX_FILES);
}

export function buildSourceIdentity(
  files: SourceFile[],
  commit?: string,
): SourceIdentity {
  return {
    fingerprint: fingerprintOf(files),
    ...(commit ? { commit } : {}),
    minimap: pickFiles(files).map((f) => ({
      path: f.path,
      ...encodeMinimap(f.content),
    })),
  };
}
