import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import type { AnalysisSummary } from '../api/types'
import { Minimap } from '../components/Minimap'
import { Status } from '../components/Status'
import { SOURCE_LABEL, formatDate, formatScore, isPending } from '../lib/format'

interface Page {
  items: AnalysisSummary[]
  nextCursor: string | null
}

export function Dashboard() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['analyses'],
    queryFn: () => api<Page>('/analyses?limit=50'),
    // polling só enquanto tiver análise pendente
    refetchInterval: (q) => (q.state.data?.items.some((i) => isPending(i.status)) ? 2000 : false),
  })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="label">Painel</p>
          <h1 className="page-title">Suas análises</h1>
        </div>
        <Link to="/nova" className="btn btn-solid">
          Nova análise
        </Link>
      </div>

      {isLoading && <div className="spinner-line" />}
      {error && <p className="form-error">{(error as Error).message}</p>}

      {data && data.items.length === 0 && (
        <div className="empty">
          <p className="label">Nada por aqui ainda</p>
          <p className="muted">Envie seu primeiro código e receba a explicação em segundos.</p>
          <Link to="/nova" className="btn" style={{ marginTop: 12 }}>
            Analisar um código
          </Link>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th className="hide-sm">Origem</th>
                <th>Status</th>
                <th className="num">Nota</th>
                <th className="hide-sm num">Data</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr
                  key={a.id}
                  className="is-link"
                  tabIndex={0}
                  onClick={() => navigate(`/analises/${a.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/analises/${a.id}`)}
                >
                  <td>
                    <div className="project-cell">
                      {a.sourceIdentity?.minimap[0] ? (
                        <Minimap file={a.sourceIdentity.minimap[0]} thumbnail />
                      ) : (
                        <span className="minimap is-thumb" aria-hidden="true" />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/analises/${a.id}`} style={{ textDecoration: 'none' }}>
                          {a.title}
                        </Link>
                        {a.fileCount !== null && (
                          <div className="muted mono" style={{ fontSize: 12 }}>
                            {a.fileCount} arquivos · {a.lineCount?.toLocaleString('pt-BR')} linhas
                            {a.aiEnhanced ? ' · IA' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hide-sm muted">{SOURCE_LABEL[a.sourceType]}</td>
                  <td>
                    <Status status={a.status} />
                  </td>
                  <td className="num" style={{ fontSize: 18 }}>
                    {formatScore(a.score)}
                  </td>
                  <td className="hide-sm num muted" style={{ fontSize: 13 }}>
                    {formatDate(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
