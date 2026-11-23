import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { AnalysisDetail } from '../api/types'
import { AnalysisView } from './AnalysisView'

const api = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (original) => ({
  ...(await original<typeof import('../api/client')>()),
  api,
}))

const analysis = (status: AnalysisDetail['status']): AnalysisDetail => ({
  id: 'a1',
  title: 'Meu projeto',
  sourceType: 'PASTE',
  sourceRef: null,
  sourceIdentity: null,
  status,
  score: null,
  aiEnhanced: false,
  fileCount: null,
  lineCount: null,
  createdAt: '2026-11-23T12:00:00Z',
  finishedAt: null,
  useAi: false,
  errorMessage: status === 'FAILED' ? 'Não encontrei nenhum arquivo de código.' : null,
  result: null,
})

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/analises/a1']}>
        <Routes>
          <Route path="/analises/:id" element={<AnalysisView />} />
          <Route path="/painel" element={<p>Painel</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const deleteCalls = () => api.mock.calls.filter(([, opts]) => opts?.method === 'DELETE')

describe('AnalysisView: cancelar e excluir', () => {
  beforeEach(() => {
    api.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it('análise em andamento: "Cancelar análise" manda um único DELETE e volta ao painel', async () => {
    let resolveDelete!: () => void
    api.mockImplementation((_path: string, opts?: { method?: string }) =>
      opts?.method === 'DELETE'
        ? new Promise<void>((r) => (resolveDelete = r))
        : Promise.resolve(analysis('PROCESSING')),
    )
    renderView()
    const button = await screen.findByRole('button', { name: 'Cancelar análise' })

    const user = userEvent.setup()
    await user.click(button)
    // enquanto o DELETE não volta, o botão fica travado: cliques extras não viram requests
    expect(screen.getByRole('button', { name: 'Cancelando…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancelando…' }))
    expect(deleteCalls()).toHaveLength(1)

    resolveDelete()
    expect(await screen.findByText('Painel')).toBeInTheDocument()
  })

  it('análise que falhou agora pode ser excluída', async () => {
    api.mockImplementation((_path: string, opts?: { method?: string }) =>
      opts?.method === 'DELETE' ? Promise.resolve(undefined) : Promise.resolve(analysis('FAILED')),
    )
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Painel')).toBeInTheDocument()
    expect(deleteCalls()).toHaveLength(1)
  })

  it('não faz nada se o usuário desistir na confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    api.mockResolvedValue(analysis('QUEUED'))
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar análise' }))
    expect(deleteCalls()).toHaveLength(0)
  })
})
