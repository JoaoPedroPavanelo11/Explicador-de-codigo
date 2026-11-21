import type { AnalysisResult, AnalysisStatus, SourceType } from '../api/types'

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

const fmt = (n: number) => n.toLocaleString('pt-BR')

// mesmo texto do coverageNotice do backend (relatório em Markdown)
export function coverageNotice(meta: AnalysisResult['meta']): string | null {
  const parts: string[] = []
  if (meta.leftOutFiles && meta.relevantFiles)
    parts.push(
      `Este projeto tem **${fmt(meta.relevantFiles)} arquivos** de código e configuração, mais do que conseguimos ler de uma vez. ` +
        `Esta é uma **visão panorâmica**: lemos os **${fmt(meta.files)} mais importantes** (configuração, depois código do produto, depois testes). ` +
        `A estrutura de pastas, a arquitetura e a contagem de testes consideram o projeto inteiro.`,
    )
  if (meta.oversizedFiles)
    parts.push(
      `${fmt(meta.oversizedFiles)} arquivo(s) com mais de 512 KB foram ignorados sem abrir; arquivos desse tamanho costumam ser gerados por ferramentas.`,
    )
  return parts.length ? parts.join(' ') : null
}
