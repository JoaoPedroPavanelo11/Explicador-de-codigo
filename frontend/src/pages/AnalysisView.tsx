import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, api } from '../api/client'
import type { AnalysisDetail, AnalysisResult, QualityCheck } from '../api/types'
import { CodeBlock } from '../components/CodeBlock'
import { Prose } from '../components/Prose'
import { ScoreMeter } from '../components/ScoreMeter'
import { SourceCard } from '../components/SourceCard'
import { Status } from '../components/Status'
import { SOURCE_LABEL, coverageNotice, formatDate, isPending } from '../lib/format'
import { NotFound } from './NotFound'

const CHECK_MARK: Record<QualityCheck['status'], string> = {
  ok: 'OK',
  atencao: 'ATENÇÃO',
  melhorar: 'MELHORAR',
  na: 'N/A',
}

export function AnalysisView() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, error, isLoading } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api<AnalysisDetail>(`/analyses/${id}`),
    refetchInterval: (q) => (q.state.data && isPending(q.state.data.status) ? 1500 : false),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 400)) && count < 2,
  })

  const download = useMutation({
    mutationFn: async () => {
      const blob = await api<Blob>(`/analyses/${id}/report`, { raw: true })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const slug = (data?.title ?? 'relatorio').toLowerCase().replace(/[^\w-]+/g, '-').slice(0, 60)
      a.href = href
      a.download = `explicacao-${slug}.md`
      a.click()
      URL.revokeObjectURL(href)
    },
  })

  const remove = useMutation({
    mutationFn: () => api(`/analyses/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/painel'),
  })

  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return <NotFound />
  if (isLoading || !data)
    return (
      <div className="page" style={{ paddingTop: 80 }}>
        <div className="spinner-line" />
      </div>
    )

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <p className="label">
            {SOURCE_LABEL[data.sourceType]} · {formatDate(data.createdAt)}
          </p>
          <h1 className="page-title" style={{ overflowWrap: 'anywhere' }}>
            {data.title}
          </h1>
          <Status status={data.status} />
        </div>
        {data.status === 'DONE' && (
          <div className="head-actions">
            <button type="button" className="btn btn-solid" onClick={() => download.mutate()} disabled={download.isPending}>
              Baixar .md
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => confirm('Excluir esta análise?') && remove.mutate()}
            >
              Excluir
            </button>
          </div>
        )}
      </div>

      {isPending(data.status) && (
        <div className="empty">
          <p className="label">{data.status === 'QUEUED' ? 'Na fila' : 'Lendo o código'}</p>
          <p className="muted">Identificando a ideia, a stack, os trechos importantes e calculando a nota…</p>
          <div className="spinner-line" style={{ maxWidth: 320, margin: '24px auto 0' }} />
        </div>
      )}

      {data.status === 'FAILED' && (
        <div className="empty">
          <p className="label">Não foi possível analisar</p>
          <p>{data.errorMessage}</p>
          <Link to="/nova" className="btn" style={{ marginTop: 12 }}>
            Tentar de novo
          </Link>
        </div>
      )}

      {data.status === 'DONE' && data.result && <Report result={data.result} source={<SourceCard {...data} />} />}
    </div>
  )
}

function Section({ n, title, id, children }: { n: string; title: string; id: string; children: React.ReactNode }) {
  return (
    <section className="report-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="report-section-head">
        <span className="section-n">{n}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <div className="report-section-body">{children}</div>
    </section>
  )
}

function Report({ result, source }: { result: AnalysisResult; source: React.ReactNode }) {
  const { idea, stack, highlights, quality, meta, ai } = result
  const notice = coverageNotice(meta)
  return (
    <div className="report">
      <aside className="report-index" aria-label="Seções do relatório">
        <nav>
          <a href="#ideia">01 Ideia</a>
          <a href="#stack">02 Stack</a>
          <a href="#destaques">03 Pontos importantes</a>
          <a href="#nota">04 Nota</a>
        </nav>
        <div className="report-meta mono">
          <div>{meta.files} arquivos</div>
          <div>{meta.lines.toLocaleString('pt-BR')} linhas</div>
          {meta.aiEnhanced && <div>com IA</div>}
          <div className="report-score-mini">{quality.score.toFixed(1)}</div>
        </div>
      </aside>

      <div className="report-content">
        {source}
        {notice && (
          <div className="coverage-notice" role="note">
            <p className="label">{meta.leftOutFiles ? 'Visão panorâmica' : 'Aviso'}</p>
            <Prose>{notice}</Prose>
          </div>
        )}
        <Section n="01" title="A ideia do código" id="ideia">
          <div className="lead-block">
            <Prose>{idea.summary}</Prose>
          </div>
          <dl className="facts">
            <div>
              <dt className="label">Tipo</dt>
              <dd>{idea.projectType}</dd>
            </div>
            <div>
              <dt className="label">Domínio</dt>
              <dd>{idea.domain ?? 'Não identificado'}</dd>
            </div>
          </dl>
          <h3 className="sub">Para quem serve</h3>
          <Prose>{idea.audience}</Prose>
          {idea.features.length > 0 && (
            <>
              <h3 className="sub">Funcionalidades identificadas</h3>
              <ul className="list">
                {idea.features.map((f) => (
                  <li key={f}>
                    <Prose inline>{f}</Prose>
                  </li>
                ))}
              </ul>
            </>
          )}
          {idea.endpoints.length > 0 && (
            <details className="details">
              <summary className="label">{idea.endpoints.length} endpoints encontrados</summary>
              <div className="table-scroll">
                <table className="table">
                  <tbody>
                    {idea.endpoints.map((e) => (
                      <tr key={`${e.method} ${e.path}`}>
                        <td className="mono" style={{ width: 90 }}>
                          {e.method}
                        </td>
                        <td className="mono">{e.path}</td>
                        <td className="muted hide-sm" style={{ fontSize: 13 }}>
                          {e.file}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Section>

        <Section n="02" title="Stack e estrutura" id="stack">
          <Prose>{stack.summary}</Prose>

          {stack.languages.length > 0 && (
            <div className="langs">
              {stack.languages.slice(0, 6).map((l) => (
                <div key={l.language} className="lang">
                  <div className="lang-row">
                    <span>{l.language}</span>
                    <span className="mono muted">{l.percent}%</span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${l.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 className="sub">Tecnologias e versões</h3>
          <div className="techs">
            {stack.technologies.map((t) => (
              <article key={t.name} className="tech">
                <header>
                  <h4>{t.name}</h4>
                  <span className="mono">{t.version ?? '—'}</span>
                </header>
                <p className="label">{t.category}</p>
                <p>{t.description}</p>
                <p className="muted">
                  <span className="why">Por quê:</span> {t.why}
                </p>
              </article>
            ))}
          </div>

          <h3 className="sub">Como o código está organizado</h3>
          <pre className="tree">{stack.tree}</pre>
          {stack.architecture.map((a) => (
            <article key={a.name} className="pattern">
              <h4>{a.name}</h4>
              <p>{a.explanation}</p>
              <p className="muted">
                <span className="why">Possível motivo:</span> {a.why}
              </p>
              <p className="mono muted" style={{ fontSize: 12 }}>
                Evidências: {a.evidence.join('; ')}
              </p>
            </article>
          ))}
        </Section>

        <Section n="03" title="Pontos importantes do código" id="destaques">
          {highlights.length === 0 && <p className="muted">Não encontrei trechos suficientes para destacar.</p>}
          {highlights.map((h, i) => (
            <article key={`${h.file}-${h.startLine}`} className="highlight">
              <p className="label">
                03.{i + 1} — {h.role}
              </p>
              <h3 className="highlight-title mono">{h.title}</h3>
              <p className="muted role-explanation">{h.roleExplanation}</p>
              <CodeBlock code={h.code} startLine={h.startLine} file={h.file} language={h.language} />
              <div className="highlight-body">
                <div>
                  <h4 className="label">O que faz</h4>
                  <Prose>{h.whatItDoes}</Prose>
                  {h.observations.length > 0 && (
                    <ul className="list compact">
                      {h.observations.map((o) => (
                        <li key={o}>
                          <Prose inline>{o}</Prose>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="label">O que achei interessante</h4>
                  <ul className="list compact">
                    {h.interesting.map((x) => (
                      <li key={x}>
                        <Prose inline>{x}</Prose>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </Section>

        <Section n="04" title="Nota e como melhorar" id="nota">
          <ScoreMeter score={quality.score} level={quality.level} />
          <p className="lead" style={{ marginTop: 24 }}>
            {quality.message}
          </p>

          {quality.strengths.length > 0 && (
            <>
              <h3 className="sub">Pontos fortes</h3>
              <ul className="list">
                {quality.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {quality.improvements.length > 0 && (
            <>
              <h3 className="sub">O que pode melhorar</h3>
              <ol className="improvements">
                {quality.improvements.map((m) => (
                  <li key={m.title}>
                    <div className="improvement-head">
                      <h4>{m.title}</h4>
                      <span className="mono muted">prioridade {m.priority}</span>
                    </div>
                    <Prose>{`**Por quê:** ${m.why}`}</Prose>
                    <Prose>{`**Como:** ${m.how}`}</Prose>
                  </li>
                ))}
              </ol>
            </>
          )}

          {ai && (
            <div className="mentor">
              <p className="label">Comentário do mentor · IA</p>
              <Prose>{ai.mentorNote}</Prose>
              {ai.extraSuggestions.length > 0 && (
                <ul className="list compact">
                  {ai.extraSuggestions.map((s) => (
                    <li key={s}>
                      <Prose inline>{s}</Prose>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <details className="details">
            <summary className="label">Critérios da nota</summary>
            <div className="checks">
              {quality.checks.map((c) => (
                <div key={c.id} className={`check is-${c.status}`}>
                  <div className="check-row">
                    <span>{c.label}</span>
                    <span className="mono">
                      {c.status === 'na' ? 'n/a' : `${c.earned}/${c.weight}`} · {CHECK_MARK[c.status]}
                    </span>
                  </div>
                  {c.status !== 'na' && (
                    <div className="bar">
                      <span style={{ width: `${(c.earned / c.weight) * 100}%` }} />
                    </div>
                  )}
                  <p className="muted">{c.detail}</p>
                </div>
              ))}
            </div>
          </details>
        </Section>
      </div>
    </div>
  )
}
