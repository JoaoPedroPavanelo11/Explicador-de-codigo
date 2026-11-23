import { buildTree, detectArchitecture } from './architecture.js';
import { extractUnits, type CodeUnit } from './code-units.js';
import { selectHighlights } from './highlights.js';
import { analyzeIdea } from './idea.js';
import {
  countLines,
  isAuxiliaryPath,
  languageOf,
  languageStats,
} from './languages.js';
import { parseManifests } from './manifests.js';
import type { Coverage } from './normalize.js';
import { assessQuality } from './quality.js';
import { findSecrets } from './secrets.js';
import { detectTechnologies, featuresFromPackages } from './stack.js';
import type { AnalysisResult, SourceFile, StackSection } from './types.js';

// 1.1: triagem + visão panorâmica, 5 trechos
export const ENGINE_VERSION = '1.1.0';

// Determinístico e offline. A IA (opcional) só reescreve texto depois, nunca a nota.
// files: o que foi lido. coverage (só em .zip/GitHub): o índice do projeto
// inteiro, usado no que depende apenas de nomes (árvore, arquitetura, testes).
export function analyzeProject(
  files: SourceFile[],
  skippedFiles = 0,
  coverage?: Coverage,
): AnalysisResult {
  const paths = coverage?.inventory ?? files.map((f) => f.path);
  const pathItems = paths.map((path) => ({ path }));

  // 1. ideia e 2. stack
  const manifest = parseManifests(files);
  const technologies = detectTechnologies(files, manifest);
  const languages = languageStats(files);
  const architecture = detectArchitecture(pathItems);
  const packageFeatures = featuresFromPackages(manifest, files);
  const idea = analyzeIdea(files, technologies, manifest, packageFeatures);

  // Funções extraídas uma vez só, e só do código do produto: trechos e nota
  // ignoram testes, mocks, exemplos e .d.ts, então extrair deles é desperdício.
  const codeFiles = files.filter((f) => languageOf(f.path));
  const unitsByFile = new Map<string, CodeUnit[]>();
  for (const f of codeFiles)
    if (!isAuxiliaryPath(f.path)) unitsByFile.set(f.path, extractUnits(f));
  const units = [...unitsByFile.values()].flat();
  const hasManifest =
    manifest.packages.length > 0 || manifest.extras.length > 0;
  const isSnippet = !hasManifest && codeFiles.length <= 3;

  const stack: StackSection = {
    summary: summarizeStack(
      languages,
      technologies.length,
      architecture.map((a) => a.name),
    ),
    languages,
    technologies,
    architecture,
    tree: buildTree(pathItems),
  };

  // 3. trechos
  const highlights = selectHighlights(files, 5, unitsByFile);

  // 4. nota
  const quality = assessQuality({
    files,
    units,
    techs: technologies,
    secrets: findSecrets(files),
    isApi:
      idea.endpoints.length > 0 ||
      technologies.some((t) => t.category === 'Framework backend'),
    isSnippet,
    paths,
  });

  return {
    idea,
    stack,
    highlights,
    quality,
    meta: {
      files: files.length,
      lines: files.reduce((s, f) => s + countLines(f.content), 0),
      analyzedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      aiEnhanced: false,
      skippedFiles,
      relevantFiles: paths.length,
      leftOutFiles: coverage?.leftOut ?? 0,
      oversizedFiles: coverage?.oversized ?? 0,
    },
  };
}

function summarizeStack(
  languages: StackSection['languages'],
  techCount: number,
  patterns: string[],
): string {
  if (languages.length === 0)
    return 'Não identifiquei linguagens de programação nos arquivos enviados.';
  const main = languages[0];
  const others = languages
    .slice(1, 3)
    .map((l) => `${l.language} (${l.percent}%)`);
  return (
    `A linguagem principal é **${main.language}** (${main.percent}% das linhas)` +
    (others.length ? `, acompanhada de ${others.join(' e ')}` : '') +
    `. Identifiquei **${techCount} tecnologia(s)**` +
    (patterns.length
      ? ` e o código segue ${patterns.length === 1 ? 'o padrão' : 'os padrões'} **${patterns.join('**, **')}**.`
      : '.')
  );
}
