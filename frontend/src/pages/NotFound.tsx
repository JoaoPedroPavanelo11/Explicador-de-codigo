import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="page narrow">
      <p className="label">Erro 404</p>
      <h1 className="page-title">Página não encontrada</h1>
      <p className="muted">O endereço pode ter mudado — ou essa análise não é sua.</p>
      <Link to="/" className="btn" style={{ marginTop: 16 }}>
        Voltar ao início
      </Link>
    </div>
  )
}
