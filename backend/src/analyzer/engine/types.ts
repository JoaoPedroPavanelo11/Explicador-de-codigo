/**
 * Tipos do motor de análise. O motor é TypeScript puro (não depende do
 * NestJS), então pode ser testado isoladamente e reaproveitado (ex.: numa CLI).
 */

export interface SourceFile {
  /** Caminho relativo e normalizado, sempre com "/" (ex.: src/app.ts). */
  path: string;
  content: string;
}

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
  percent: number;
}

export type TechCategory =
  | 'Linguagem'
  | 'Runtime'
  | 'Framework backend'
  | 'Framework frontend'
  | 'Mobile'
  | 'Banco de dados'
  | 'ORM / acesso a dados'
  | 'Testes'
  | 'Autenticação e segurança'
  | 'Validação'
  | 'Filas e mensageria'
  | 'Cache'
  | 'Infraestrutura e DevOps'
  | 'Build e bundling'
  | 'Qualidade de código'
  | 'Estilização / UI'
  | 'HTTP e integrações'
  | 'Documentação'
  | 'IA e dados'
  | 'Tempo real'
  | 'Utilitários';

export interface Technology {
  name: string;
  version?: string;
  category: TechCategory;
  /** Para que serve, em linguagem simples. */
  description: string;
  /** Possível motivo de o autor ter escolhido essa tecnologia. */
  why: string;
  /** Onde foi encontrada (ex.: package.json, import em src/x.py). */
  source: string;
}

export interface ArchitecturePattern {
  name: string;
  evidence: string[];
  explanation: string;
  why: string;
}

export interface StackSection {
  summary: string;
  languages: LanguageStat[];
  technologies: Technology[];
  architecture: ArchitecturePattern[];
  tree: string;
}

export interface Endpoint {
  method: string;
  path: string;
  file: string;
}

export interface IdeaSection {
  projectName: string;
  projectType: string;
  domain: string | null;
  summary: string;
  audience: string;
  features: string[];
  endpoints: Endpoint[];
  evidence: string[];
}

export interface Highlight {
  file: string;
  role: string;
  roleExplanation: string;
  title: string;
  language: string;
  startLine: number;
  endLine: number;
  code: string;
  whatItDoes: string;
  observations: string[];
  interesting: string[];
}

export type CheckStatus = 'ok' | 'atencao' | 'melhorar' | 'na';

export interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  weight: number;
  earned: number;
  detail: string;
}

export interface Improvement {
  title: string;
  why: string;
  how: string;
  priority: 'alta' | 'média' | 'baixa';
}

export interface QualitySection {
  score: number;
  level: string;
  message: string;
  strengths: string[];
  improvements: Improvement[];
  checks: QualityCheck[];
}

export interface AnalysisMeta {
  files: number;
  lines: number;
  analyzedAt: string;
  engineVersion: string;
  aiEnhanced: boolean;
  skippedFiles: number;
}

export interface AnalysisResult {
  idea: IdeaSection;
  stack: StackSection;
  highlights: Highlight[];
  quality: QualitySection;
  meta: AnalysisMeta;
}
