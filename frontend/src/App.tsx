import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { AnalysisView } from './pages/AnalysisView'
import { AuthPage } from './pages/AuthPage'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { NewAnalysis } from './pages/NewAnalysis'
import { NotFound } from './pages/NotFound'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="entrar" element={<AuthPage mode="login" />} />
        <Route path="criar-conta" element={<AuthPage mode="register" />} />
        <Route path="painel" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="nova" element={<RequireAuth><NewAnalysis /></RequireAuth>} />
        <Route path="analises/:id" element={<RequireAuth><AnalysisView /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
