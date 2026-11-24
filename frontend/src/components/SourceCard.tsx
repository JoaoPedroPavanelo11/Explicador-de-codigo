import type { AnalysisSummary } from '../api/types'
import { Minimap } from './Minimap'

type Props = Pick<AnalysisSummary, 'sourceType' | 'sourceRef' | 'sourceIdentity'>

// O código enviado é apagado logo depois da análise. Este cartão mostra o que
// sobra para reconhecer de onde veio a explicação: o link da versão exata
// (GitHub), o nome do .zip, a impressão digital e o formato dos arquivos.
export function SourceCard({ sourceType, sourceRef, sourceIdentity }: Props) {
  const commit = sourceIdentity?.commit
  const fingerprint = sourceIdentity?.fingerprint

  let origin: React.ReactNode = 'Código colado'
  if (sourceType === 'ZIP') origin = <span className="mono">{sourceRef ?? 'arquivo .zip'}</span>
  if (sourceType === 'GITHUB' && sourceRef) {
    const name = sourceRef.replace('https://github.com/', '')
    origin = (
      <a
        href={commit ? `${sourceRef}/tree/${commit}` : sourceRef}
        target="_blank"
        rel="noopener noreferrer"
        className="mono"
      >
        {name}
        {commit ? ` @ ${commit.slice(0, 7)}` : ''}
      </a>
    )
  }

  return (
    <section className="source-card" aria-label="De onde veio esta explicação">
      <p className="label">De onde veio esta explicação</p>
      <dl className="source-facts">
        <div>
          <dt className="muted">Origem</dt>
          <dd>{origin}</dd>
        </div>
        {fingerprint && (
          <div>
            <dt className="muted">Impressão digital</dt>
            <dd className="mono" title={`sha256:${fingerprint}`}>
              sha256:{fingerprint.slice(0, 16)}…
            </dd>
          </div>
        )}
      </dl>

      {sourceIdentity && sourceIdentity.minimap.length > 0 && (
        <div className="source-minimaps">
          {sourceIdentity.minimap.map((f) => (
            <figure key={f.path}>
              <Minimap file={f} />
              <figcaption className="mono muted">
                {f.path} · {f.totalLines.toLocaleString('pt-BR')} linhas
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="muted source-note">
        {sourceType === 'GITHUB'
          ? 'O código foi lido direto do GitHub e apagado após a análise; o link acima abre a versão exata que foi analisada.'
          : 'O código foi apagado logo após a análise. Guardamos só o formato das linhas (ilegível) e a impressão digital, para você reconhecer de qual código veio esta explicação.'}
      </p>
    </section>
  )
}
