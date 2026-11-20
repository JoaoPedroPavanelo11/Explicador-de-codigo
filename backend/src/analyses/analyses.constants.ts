export const ANALYSIS_QUEUE = 'analysis';

/** Quantas análises a mesma pessoa pode ter na fila ao mesmo tempo. */
export const MAX_PENDING_PER_USER = 3;

export type AnalysisSource =
  | { kind: 'paste'; files: { path: string; content: string }[] }
  | { kind: 'zip'; tmpPath: string }
  | { kind: 'github'; owner: string; repo: string };

export interface AnalysisJobData {
  analysisId: string;
  source: AnalysisSource;
}
