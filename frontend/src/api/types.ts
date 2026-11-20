// Espelho dos tipos que a API devolve (backend/src/analyzer/engine/types.ts).

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

export type AnalysisStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED'
export type SourceType = 'PASTE' | 'ZIP' | 'GITHUB'

export interface AnalysisSummary {
  id: string
  title: string
  sourceType: SourceType
  sourceRef: string | null
  status: AnalysisStatus
  score: number | null
  aiEnhanced: boolean
  fileCount: number | null
  lineCount: number | null
  createdAt: string
  finishedAt: string | null
}

export interface Technology {
  name: string
  version?: string
  category: string
  description: string
  why: string
  source: string
}

export interface ArchitecturePattern {
  name: string
  evidence: string[]
  explanation: string
  why: string
}

export interface Highlight {
  file: string
  role: string
  roleExplanation: string
  title: string
  language: string
  startLine: number
  endLine: number
  code: string
  whatItDoes: string
  observations: string[]
  interesting: string[]
}

export interface QualityCheck {
  id: string
  label: string
  status: 'ok' | 'atencao' | 'melhorar' | 'na'
  weight: number
  earned: number
  detail: string
}

export interface Improvement {
  title: string
  why: string
  how: string
  priority: 'alta' | 'média' | 'baixa'
}

export interface AnalysisResult {
  ai?: { model: string; mentorNote: string; extraSuggestions: string[] }
  idea: {
    projectName: string
    projectType: string
    domain: string | null
    summary: string
    audience: string
    features: string[]
    endpoints: { method: string; path: string; file: string }[]
    evidence: string[]
  }
  stack: {
    summary: string
    languages: { language: string; files: number; lines: number; percent: number }[]
    technologies: Technology[]
    architecture: ArchitecturePattern[]
    tree: string
  }
  highlights: Highlight[]
  quality: {
    score: number
    level: string
    message: string
    strengths: string[]
    improvements: Improvement[]
    checks: QualityCheck[]
  }
  meta: {
    files: number
    lines: number
    analyzedAt: string
    engineVersion: string
    aiEnhanced: boolean
    skippedFiles: number
  }
}

export interface AnalysisDetail extends AnalysisSummary {
  useAi: boolean
  errorMessage: string | null
  result: AnalysisResult | null
}

export interface Meta {
  engineVersion: string
  aiAvailable: boolean
  limits: { uploadMaxMb: number; maxPendingPerUser: number; pasteMaxFiles: number }
}
