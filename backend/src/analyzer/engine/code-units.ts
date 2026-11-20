import { languageOf } from './languages.js';
import type { SourceFile } from './types.js';

export interface CodeUnit {
  file: string;
  name: string;
  language: string;
  startLine: number; // 1-based
  endLine: number;
  code: string;
  lines: number;
  // ciclomática aproximada
  complexity: number;
  maxNesting: number;
}

const BRACE_LANGS = new Set([
  'TypeScript',
  'JavaScript',
  'Java',
  'Kotlin',
  'C#',
  'Go',
  'Rust',
  'PHP',
  'C',
  'C++',
  'Swift',
  'Dart',
  'Scala',
  'Vue',
  'Svelte',
]);

const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'function',
  'else',
  'new',
  'typeof',
  'await',
  'do',
  'try',
  'with',
  'super',
  'this',
  'constructor',
]);

function signatureName(line: string, language: string): string | null {
  const l = line.trim();
  if (l.startsWith('//') || l.startsWith('*') || l.startsWith('#')) return null;
  const patterns: RegExp[] = [];
  switch (language) {
    case 'Python':
      patterns.push(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
      break;
    case 'Ruby':
      patterns.push(/^def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/);
      break;
    case 'Go':
      patterns.push(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/);
      break;
    case 'Rust':
      patterns.push(
        /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
      );
      break;
    case 'Kotlin':
      patterns.push(
        /^(?:[\w@]+\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)\s*\(/,
      );
      break;
    case 'PHP':
      patterns.push(
        /^(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?([A-Za-z_]\w*)\s*\(/,
      );
      break;
    case 'Java':
    case 'C#':
    case 'Scala':
    case 'Dart':
    case 'Swift':
    case 'C':
    case 'C++':
      patterns.push(
        /^(?:(?:public|private|protected|internal|static|final|override|virtual|abstract|async|synchronized|sealed|open|func|def)\s+)*[\w<>[\],.?\s]*?\b([A-Za-z_]\w*)\s*\([^;]*$/,
      );
      break;
    default:
      // js/ts
      patterns.push(
        /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/,
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>/,
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\($/,
        // método: exige "{" no fim, senão pega chamada de função
        /^(?:(?:public|private|protected|static|async|override|readonly|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^;]*\)\s*(?::\s*[^{;]+)?\{\s*$/,
      );
  }
  for (const re of patterns) {
    const m = l.match(re);
    if (m && m[1] && !KEYWORDS.has(m[1])) return m[1];
  }
  return null;
}

function findBraceEnd(lines: string[], start: number): number | null {
  let depth = 0;
  let opened = false;
  let inBlockComment = false;
  for (let i = start; i < lines.length && i < start + 400; i++) {
    const line = lines[i];
    let quote: string | null = null;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const next = line[j + 1];
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          j++;
        }
        continue;
      }
      if (quote) {
        if (ch === '\\') j++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        j++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
        if (opened && depth === 0) return i;
      } else if (ch === ';' && !opened && i === start) {
        // sem corpo (interface/abstract)
        return null;
      }
    }
    if (!opened && i > start + 4) return null;
  }
  return null;
}

// python
function findIndentEnd(lines: string[], start: number): number {
  const indent = (s: string) => s.match(/^\s*/)?.[0].length ?? 0;
  const base = indent(lines[start]);
  let end = start;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    if (indent(l) <= base) break;
    end = i;
  }
  return end;
}

// ruby
function findRubyEnd(lines: string[], start: number): number {
  const indent = (s: string) => s.match(/^\s*/)?.[0].length ?? 0;
  const base = indent(lines[start]);
  for (let i = start + 1; i < lines.length; i++)
    if (lines[i].trim() === 'end' && indent(lines[i]) === base) return i;
  return Math.min(start + 30, lines.length - 1);
}

export function measureComplexity(code: string): number {
  const decisions =
    code.match(
      /\b(if|elif|else if|for|foreach|while|case|catch|except|when)\b|&&|\|\||\?\?|\?\s*[^:.?]+\s*:/g,
    ) ?? [];
  return 1 + decisions.length;
}

function measureNesting(code: string, language: string): number {
  if (language === 'Python' || language === 'Ruby') {
    const indents = code
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.match(/^\s*/)?.[0].length ?? 0);
    const base = indents[0] ?? 0;
    const step = 4;
    return Math.max(0, ...indents.map((i) => Math.floor((i - base) / step)));
  }
  let depth = 0;
  let max = 0;
  for (const ch of code) {
    if (ch === '{') max = Math.max(max, ++depth);
    else if (ch === '}') depth--;
  }
  return Math.max(0, max - 1);
}

export function extractUnits(file: SourceFile): CodeUnit[] {
  const language = languageOf(file.path);
  if (!language) return [];
  const lines = file.content.split('\n');
  const units: CodeUnit[] = [];
  let i = 0;
  while (i < lines.length) {
    const name = signatureName(lines[i], language);
    if (!name) {
      i++;
      continue;
    }
    let end: number | null;
    if (language === 'Python') end = findIndentEnd(lines, i);
    else if (language === 'Ruby') end = findRubyEnd(lines, i);
    else if (BRACE_LANGS.has(language)) end = findBraceEnd(lines, i);
    else end = null;

    if (end === null || end <= i) {
      i++;
      continue;
    }
    // puxa decorators e docblock junto
    let start = i;
    while (
      start > 0 &&
      /^\s*(@[\w.]+|\/\/\/|\/\*\*|\*|#\[)/.test(lines[start - 1]) &&
      i - start < 8
    )
      start--;
    const code = lines.slice(start, end + 1).join('\n');
    units.push({
      file: file.path,
      name,
      language,
      startLine: start + 1,
      endLine: end + 1,
      code,
      lines: end - start + 1,
      complexity: measureComplexity(code),
      maxNesting: measureNesting(lines.slice(i, end + 1).join('\n'), language),
    });
    // em python/ruby os métodos ficam dentro da classe, então não pula o corpo
    i = language === 'Python' || language === 'Ruby' ? i + 1 : end + 1;
  }
  return units.filter((u) => u.lines >= 2);
}
