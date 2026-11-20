// access token só em memória (nada de localStorage). Em 401 tenta um refresh
// pelo cookie e repete a request uma vez.

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (Array.isArray(body.message)) return body.message.join(' · ')
    if (body.message) return body.message
  } catch {
    // corpo vazio ou não-json
  }
  if (res.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  return 'Algo deu errado. Tente novamente.'
}

// requests simultâneas esperam o mesmo refresh
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return false
      const body = (await res.json()) as { accessToken: string }
      accessToken = body.accessToken
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type Body = Record<string, unknown> | FormData | undefined

export async function api<T>(
  path: string,
  options: { method?: string; body?: Body; raw?: boolean } = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  let body: BodyInit | undefined
  if (options.body instanceof FormData) body = options.body
  else if (options.body) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'same-origin',
  })

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, options, false)
    onSessionExpired?.()
  }
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  if (options.raw) return (await res.blob()) as T
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
