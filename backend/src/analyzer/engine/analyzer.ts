import { buildTree, detectArchitecture } from './architecture.js';
import { extractUnits } from './code-units.js';
import { selectHighlights } from './highlights.js';
import { analyzeIdea } from './idea.js';
import { countLines, languageOf, languageStats } from './languages.js';
import { parseManifests } from './manifests.js';
import { assessQuality } from './quality.js';
import { findSecrets } from './secrets.js';
import { detectTechnologies, featuresFromPackages } from './stack.js';
import type { AnalysisResult, SourceFile, StackSection } from './types.js';

export const ENGINE_VERSION = '1.0.0';

/**
 * Pipeline completo de análise estática:
 *
 *   arquivos → manifestos → stack → arquitetura → ideia → destaques → nota
 *
 * Tudo é determinístico (a mesma entrada gera o mesmo resultado) e roda
 * sem internet. A IA, quando ativada, só reescreve os textos depois.
 */
export function analyzeProject(
  files: SourceFile[],
  skippedFiles = 0,
): AnalysisResult {
  const manifest = parseManifests(files);
  const technologies = detectTechnologies(files, manifest);
  const languages = languageStats(files);
  const architecture = detectArchitecture(files);
  const packageFeatures = featuresFromPackages(manifest, files);
  const idea = analyzeIdea(files, technologies, manifest, packageFeatures);

  const codeFiles = files.filter((f) => languageOf(f.path));
  const units = codeFiles.flatMap((f) => extractUnits(f));
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
    tree: buildTree(files),
  };

  const quality = assessQuality({
    files,
    units,
    techs: technologies,
    secrets: findSecrets(files),
    isApi:
      idea.endpoints.length > 0 ||
      technologies.some((t) => t.category === 'Framework backend'),
    isSnippet,
  });

  return {
    idea,
    stack,
    highlights: selectHighlights(files),
    quality,
    meta: {
      files: files.length,
      lines: files.reduce((s, f) => s + countLines(f.content), 0),
      analyzedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      aiEnhanced: false,
      skippedFiles,
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
