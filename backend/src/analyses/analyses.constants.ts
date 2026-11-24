import { join } from 'node:path';

export const ANALYSIS_QUEUE = 'analysis';

export const MAX_PENDING_PER_USER = 3;

// Em produção é um volume tmpfs (RAM) compartilhado entre API e worker:
// nada do que passa por aqui chega ao disco, e um reinício apaga tudo.
export const UPLOAD_DIR = join(process.cwd(), 'tmp', 'uploads');

// Arquivo temporário esquecido (worker morto no meio, fila parada) é apagado
// depois deste tempo pela faxina do worker.
export const TMP_MAX_AGE_MS = 30 * 60 * 1000;
export const TMP_SWEEP_EVERY_MS = 10 * 60 * 1000;

// O código NUNCA viaja dentro do pedido na fila: o Redis grava tudo em disco
// (appendonly) e guarda pedidos que falharam. Na fila vai só o caminho do
// arquivo temporário, que fica numa pasta em RAM e é apagado ao terminar.
export type AnalysisSource =
  | { kind: 'paste'; tmpPath: string }
  | { kind: 'zip'; tmpPath: string }
  | { kind: 'github'; owner: string; repo: string };

// Pedidos enfileirados antes desta versão ainda levam o código dentro.
// Só existe para a transição; pode sair depois que a fila antiga esvaziar.
export type LegacyPasteSource = {
  kind: 'paste';
  files: { path: string; content: string }[];
};

export interface AnalysisJobData {
  analysisId: string;
  source: AnalysisSource | LegacyPasteSource;
}

export function tmpPathOf(source: AnalysisJobData['source']): string | null {
  return 'tmpPath' in source ? source.tmpPath : null;
}
