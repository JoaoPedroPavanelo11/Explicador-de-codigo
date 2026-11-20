import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="page" style={{ paddingTop: 80 }}><div className="spinner-line" /></div>
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
