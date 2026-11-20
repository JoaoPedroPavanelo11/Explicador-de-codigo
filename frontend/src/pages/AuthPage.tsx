import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isLogin = mode === 'login'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isLogin) await login(email, password)
      else await register(name, email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/painel', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível continuar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page narrow">
      <p className="label">{isLogin ? 'Acesso' : 'Cadastro'}</p>
      <h1 className="page-title">{isLogin ? 'Entrar' : 'Criar conta'}</h1>
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!isLogin && (
          <label className="field">
            <span className="label">Nome</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
          </label>
        )}
        <label className="field">
          <span className="label">E-mail</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span className="label">Senha</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
            minLength={isLogin ? 1 : 8}
            maxLength={128}
          />
          {!isLogin && <span className="muted" style={{ fontSize: 13 }}>Mínimo de 8 caracteres, com letras e números.</span>}
        </label>
        <button className="btn btn-solid" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Aguarde…' : isLogin ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 28, fontSize: 14 }}>
        {isLogin ? (
          <>
            Ainda não tem conta? <Link to="/criar-conta">Criar conta</Link>
          </>
        ) : (
          <>
            Já tem conta? <Link to="/entrar">Entrar</Link>
          </>
        )}
      </p>
    </div>
  )
}
