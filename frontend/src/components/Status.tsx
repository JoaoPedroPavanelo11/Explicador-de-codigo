import type { AnalysisStatus } from '../api/types'
import { STATUS_LABEL, isPending } from '../lib/format'

export function Status({ status }: { status: AnalysisStatus }) {
  return <span className={`status${isPending(status) ? ' is-pending' : ''}`}>{STATUS_LABEL[status]}</span>
}
