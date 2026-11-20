import type { AnalysisStatus, SourceType } from '../api/types'

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  QUEUED: 'Na fila',
  PROCESSING: 'Lendo o código',
  DONE: 'Pronta',
  FAILED: 'Falhou',
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  PASTE: 'Colado',
  ZIP: 'Arquivo .zip',
  GITHUB: 'GitHub',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(1)
}

export const isPending = (status: AnalysisStatus) => status === 'QUEUED' || status === 'PROCESSING'
