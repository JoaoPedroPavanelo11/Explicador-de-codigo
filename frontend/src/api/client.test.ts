import { ApiError, api, setAccessToken } from './client'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('cliente da API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setAccessToken(null)
  })

  it('envia o token e renova a sessão automaticamente quando recebe 401', async () => {
    setAccessToken('expirado')
    const calls: { url: string; auth?: string }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      calls.push({ url, auth })
      if (url === '/api/auth/refresh') return json(200, { accessToken: 'novo' })
      return auth === 'Bearer novo' ? json(200, { ok: true }) : json(401, { message: 'Unauthorized' })
    })

    await expect(api('/analyses')).resolves.toEqual({ ok: true })
    expect(calls.map((c) => c.url)).toEqual(['/api/analyses', '/api/auth/refresh', '/api/analyses'])
    expect(calls[2].auth).toBe('Bearer novo')
  })

  it('transforma erros de validação em uma mensagem legível', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(400, { message: ['email: E-mail inválido', 'password: curta'] }))
    const error = await api('/auth/login', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('email: E-mail inválido · password: curta')
  })
})
