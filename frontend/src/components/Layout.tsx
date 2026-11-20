import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <header className="site-header">
        <div className="page">
          <Link to="/" className="wordmark">
            Explicador <span>de</span> Código
          </Link>
          <nav className="nav" aria-label="Principal">
            {user ? (
              <>
                <NavLink to="/painel" end>
                  Análises
                </NavLink>
                <NavLink to="/nova">Nova análise</NavLink>
                <span className="muted hide-sm">{user.name.split(' ')[0]}</span>
                <button
                  type="button"
                  className="link-button mono"
                  style={{ fontSize: 13 }}
                  onClick={async () => {
                    await logout()
                    navigate('/')
                  }}
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <NavLink to="/entrar">Entrar</NavLink>
                <NavLink to="/criar-conta">Criar conta</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="page">
          <span>Explicador de Código — leia, entenda, melhore.</span>
          <span>Seu código não é armazenado: só o relatório.</span>
        </div>
      </footer>
    </>
  )
}
