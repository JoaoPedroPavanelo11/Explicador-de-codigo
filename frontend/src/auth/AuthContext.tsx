import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

interface SessionResponse {
  user: User
  accessToken: string
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Ao abrir o site, tenta restaurar a sessão pelo cookie de refresh.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null)
      setUser(null)
    })
    refreshSession()
      .then(async (ok) => {
        if (ok) setUser(await api<User>('/auth/me'))
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const start = useCallback((session: SessionResponse) => {
    setAccessToken(session.accessToken)
    setUser(session.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      start(await api<SessionResponse>('/auth/login', { method: 'POST', body: { email, password } }))
    },
    [start],
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      start(await api<SessionResponse>('/auth/register', { method: 'POST', body: { name, email, password } }))
    },
    [start],
  )

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
