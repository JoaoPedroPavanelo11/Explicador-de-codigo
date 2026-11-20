import type { AnalysisResult, CheckStatus } from './types.js';

const STATUS_ICON: Record<CheckStatus, string> = {
  ok: '✅',
  atencao: '🟡',
  melhorar: '🔴',
  na: '➖',
};

const LANG_FENCE: Record<string, string> = {
  TypeScript: 'ts',
  JavaScript: 'js',
  Python: 'python',
  Java: 'java',
  Kotlin: 'kotlin',
  Go: 'go',
  Rust: 'rust',
  'C#': 'csharp',
  PHP: 'php',
  Ruby: 'ruby',
  'C++': 'cpp',
  C: 'c',
  Swift: 'swift',
  Dart: 'dart',
  Vue: 'vue',
  Svelte: 'svelte',
  Scala: 'scala',
};

/** Evita que um texto quebre a formatação de uma tabela Markdown. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Escolhe uma cerca de código que não apareça dentro do trecho. */
function fence(code: string): string {
  let f = '```';
  while (code.includes(f)) f += '`';
  return f;
}

export function renderMarkdown(r: AnalysisResult, title: string): string {
  const out: string[] = [];
  const { idea, stack, highlights, quality, meta } = r;

  out.push(`# Explicação do código — ${title}`);
  out.push('');
  out.push(
    `> Gerado pelo **Explicador de Código** em ${new Date(meta.analyzedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ` +
      `${meta.files} arquivos · ${meta.lines.toLocaleString('pt-BR')} linhas` +
      (meta.aiEnhanced ? ' · explicações enriquecidas com IA' : '') +
      (meta.skippedFiles
        ? ` · ${meta.skippedFiles} arquivo(s) ignorado(s)`
        : ''),
  );
  out.push('');
  out.push(`**Nota geral: ${quality.score.toFixed(1)}/10 — ${quality.level}**`);
  out.push('');

  // ------------------------------------------------------------------ 1
  out.push('## 1. A ideia do código');
  out.push('');
  out.push(idea.summary);
  out.push('');
  out.push(`**Para quem serve:** ${idea.audience}`);
  out.push('');
  if (idea.features.length) {
    out.push('**Principais funcionalidades identificadas:**');
    out.push('');
    for (const f of idea.features) out.push(`- ${f}`);
    out.push('');
  }
  if (idea.endpoints.length) {
    out.push('<details><summary>Endpoints encontrados</summary>');
    out.push('');
    out.push('| Método | Rota | Arquivo |');
    out.push('|---|---|---|');
    for (const e of idea.endpoints)
      out.push(`| ${e.method} | \`${cell(e.path)}\` | ${cell(e.file)} |`);
    out.push('');
    out.push('</details>');
    out.push('');
  }

  // ------------------------------------------------------------------ 2
  out.push('## 2. Stack e estrutura');
  out.push('');
  out.push(stack.summary);
  out.push('');
  if (stack.languages.length) {
    out.push('### Linguagens');
    out.push('');
    out.push('| Linguagem | Arquivos | Linhas | % |');
    out.push('|---|---:|---:|---:|');
    for (const l of stack.languages.slice(0, 8))
      out.push(
        `| ${l.language} | ${l.files} | ${l.lines.toLocaleString('pt-BR')} | ${l.percent}% |`,
      );
    out.push('');
  }
  if (stack.technologies.length) {
    out.push('### Tecnologias e versões');
    out.push('');
    out.push(
      '| Tecnologia | Versão | Categoria | Para que serve | Por que provavelmente foi escolhida |',
    );
    out.push('|---|---|---|---|---|');
    for (const t of stack.technologies)
      out.push(
        `| **${cell(t.name)}** | ${t.version ? `\`${cell(t.version)}\`` : '—'} | ${t.category} | ${cell(t.description)} | ${cell(t.why)} |`,
      );
    out.push('');
  }
  out.push('### Como o código está organizado');
  out.push('');
  out.push('```text');
  out.push(stack.tree);
  out.push('```');
  out.push('');
  if (stack.architecture.length) {
    for (const a of stack.architecture) {
      out.push(`**${a.name}**`);
      out.push('');
      out.push(`- _O que é:_ ${a.explanation}`);
      out.push(`- _Possível motivo:_ ${a.why}`);
      out.push(`- _Evidências:_ ${a.evidence.join('; ')}`);
      out.push('');
    }
  } else {
    out.push(
      'Não identifiquei um padrão de arquitetura conhecido — a organização é simples/direta, o que é normal em projetos pequenos ou trechos de código.',
    );
    out.push('');
  }

  // ------------------------------------------------------------------ 3
  out.push('## 3. Pontos importantes do código');
  out.push('');
  if (highlights.length === 0)
    out.push('Não encontrei trechos de código suficientes para destacar.');
  highlights.forEach((h, i) => {
    out.push(`### 3.${i + 1} \`${h.title}\` — ${h.role}`);
    out.push('');
    out.push(`📄 \`${h.file}\` (linhas ${h.startLine}–${h.endLine})`);
    out.push('');
    out.push(`> ${h.roleExplanation}`);
    out.push('');
    const f = fence(h.code);
    out.push(`${f}${LANG_FENCE[h.language] ?? ''}`);
    out.push(h.code);
    out.push(f);
    out.push('');
    out.push(`**O que faz:** ${h.whatItDoes}`);
    out.push('');
    if (h.observations.length) {
      for (const o of h.observations) out.push(`- ${o}`);
      out.push('');
    }
    out.push('**O que achei interessante:**');
    out.push('');
    for (const x of h.interesting) out.push(`- ${x}`);
    out.push('');
  });

  // ------------------------------------------------------------------ 4
  out.push('## 4. Nota e como melhorar');
  out.push('');
  out.push(`### ${quality.score.toFixed(1)} / 10 — ${quality.level}`);
  out.push('');
  out.push(quality.message);
  out.push('');
  if (quality.strengths.length) {
    out.push('**Pontos fortes:**');
    out.push('');
    for (const s of quality.strengths) out.push(`- ✅ ${s}`);
    out.push('');
  }
  if (quality.improvements.length) {
    out.push('**O que pode melhorar (em ordem de prioridade):**');
    out.push('');
    quality.improvements.forEach((m, i) => {
      out.push(`${i + 1}. **${m.title}** _(prioridade ${m.priority})_`);
      out.push(`   - Por quê: ${m.why}`);
      out.push(`   - Como: ${m.how}`);
    });
    out.push('');
  }
  if (r.ai) {
    out.push('### Comentário do mentor (IA)');
    out.push('');
    out.push(r.ai.mentorNote);
    out.push('');
    if (r.ai.extraSuggestions.length) {
      out.push('**Outras ideias para evoluir o código:**');
      out.push('');
      for (const s of r.ai.extraSuggestions) out.push(`- ${s}`);
      out.push('');
    }
  }
  out.push('<details><summary>Critérios da nota</summary>');
  out.push('');
  out.push('| | Critério | Pontos | Detalhe |');
  out.push('|---|---|---:|---|');
  for (const c of quality.checks)
    out.push(
      `| ${STATUS_ICON[c.status]} | ${c.label} | ${c.status === 'na' ? 'n/a' : `${c.earned}/${c.weight}`} | ${cell(c.detail)} |`,
    );
  out.push('');
  out.push('</details>');
  out.push('');
  out.push('---');
  out.push('');
  out.push(
    '_Este relatório foi gerado automaticamente a partir de análise estática' +
      (meta.aiEnhanced ? ' e IA' : '') +
      '. Ele é um ponto de partida para conversas e melhorias — não um julgamento. Todo código pode evoluir. 🚀_',
  );
  out.push('');
  return out.join('\n');
}
