import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { Meta } from '../api/types'

type Mode = 'paste' | 'zip' | 'github'

interface PastedFile {
  path: string
  content: string
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'paste', label: 'Colar código' },
  { id: 'zip', label: 'Enviar .zip' },
  { id: 'github', label: 'Repositório GitHub' },
]

export function NewAnalysis() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: 60_000 })

  const [mode, setMode] = useState<Mode>('paste')
  const [title, setTitle] = useState('')
  const [useAi, setUseAi] = useState(false)
  const [files, setFiles] = useState<PastedFile[]>([{ path: 'index.ts', content: '' }])
  const [zip, setZip] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useMutation({
    mutationFn: async () => {
      const base = { ...(title.trim() ? { title: title.trim() } : {}), useAi }
      if (mode === 'paste')
        return api<{ id: string }>('/analyses/paste', {
          method: 'POST',
          body: { ...base, files: files.filter((f) => f.content.trim()) },
        })
      if (mode === 'github')
        return api<{ id: string }>('/analyses/github', { method: 'POST', body: { ...base, url } })
      const form = new FormData()
      form.append('file', zip!)
      if (base.title) form.append('title', base.title)
      form.append('useAi', String(useAi))
      return api<{ id: string }>('/analyses/upload', { method: 'POST', body: form })
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['analyses'] })
      navigate(`/analises/${id}`)
    },
  })

  const maxMb = meta?.limits.uploadMaxMb ?? 10
  const canSubmit =
    (mode === 'paste' && files.some((f) => f.content.trim() && f.path.trim())) ||
    (mode === 'zip' && zip !== null) ||
    (mode === 'github' && url.trim().length > 0)

  function pickZip(file: File | undefined) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      submit.reset()
      alert('Escolha um arquivo .zip')
      return
    }
    setZip(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    pickZip(e.dataTransfer.files[0])
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (canSubmit) submit.mutate()
  }

  const updateFile = (i: number, patch: Partial<PastedFile>) =>
    setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <div className="page page-top">
      <p className="label">Nova análise</p>
      <h1 className="page-title">O que vamos ler hoje?</h1>

      <div className="tabs" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit}>
        {submit.error && (
          <p className="form-error" role="alert">
            {(submit.error as Error).message}
          </p>
        )}

        {mode === 'paste' && (
          <div>
            {files.map((f, i) => (
              <div key={i} className="paste-file">
                <div className="paste-file-head">
                  <label className="visually-hidden" htmlFor={`path-${i}`}>
                    Nome do arquivo
                  </label>
                  <input
                    id={`path-${i}`}
                    className="input mono"
                    value={f.path}
                    onChange={(e) => updateFile(i, { path: e.target.value })}
                    placeholder="src/usuarios/usuarios.service.ts"
                    maxLength={300}
                  />
                  {files.length > 1 && (
                    <button
                      type="button"
                      className="link-button mono"
                      style={{ fontSize: 12 }}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      remover
                    </button>
                  )}
                </div>
                <label className="visually-hidden" htmlFor={`code-${i}`}>
                  Código
                </label>
                <textarea
                  id={`code-${i}`}
                  className="textarea"
                  value={f.content}
                  spellCheck={false}
                  onChange={(e) => updateFile(i, { content: e.target.value })}
                  placeholder="Cole o código aqui. O nome do arquivo ajuda a identificar a linguagem."
                />
              </div>
            ))}
            {files.length < (meta?.limits.pasteMaxFiles ?? 100) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFiles((prev) => [...prev, { path: `arquivo-${prev.length + 1}.ts`, content: '' }])}
              >
                + Adicionar arquivo
              </button>
            )}
          </div>
        )}

        {mode === 'zip' && (
          <div
            className={`dropzone${dragging ? ' is-over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => pickZip(e.target.files?.[0])}
            />
            {zip ? (
              <>
                <p className="mono">{zip.name}</p>
                <p className="muted">{(zip.size / 1024 / 1024).toFixed(2)} MB · clique para trocar</p>
              </>
            ) : (
              <>
                <p>Arraste o .zip do projeto aqui</p>
                <p className="muted">ou clique para escolher · até {maxMb} MB · node_modules e builds são ignorados</p>
              </>
            )}
          </div>
        )}

        {mode === 'github' && (
          <label className="field">
            <span className="label">URL do repositório público</span>
            <input
              className="input mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/usuario/repositorio"
              inputMode="url"
              autoComplete="off"
            />
            <span className="muted" style={{ fontSize: 13 }}>
              Lemos o branch padrão. Repositórios privados não são acessados.
            </span>
          </label>
        )}

        <hr className="rule" style={{ margin: '40px 0 32px' }} />

        <div className="options">
          <label className="field">
            <span className="label">Título (opcional)</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: API do meu TCC" />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={useAi}
              disabled={!meta?.aiAvailable}
              onChange={(e) => setUseAi(e.target.checked)}
            />
            <span>
              Enriquecer as explicações com IA
              <span className="muted" style={{ display: 'block', fontSize: 14 }}>
                {meta?.aiAvailable
                  ? 'Um resumo do projeto e os trechos destacados (com segredos mascarados) são enviados à API do Claude. A nota não muda.'
                  : 'Indisponível neste servidor (nenhuma chave de API configurada). A análise estática funciona normalmente.'}
              </span>
            </span>
          </label>
        </div>

        <p className="muted privacy-note">
          Seu código é usado só para gerar a explicação e é apagado assim que a análise termina. Guardamos a explicação
          com a nota e, para você reconhecer de onde ela veio, o link do GitHub ou uma impressão digital e o formato das
          linhas (sem o código).
        </p>

        <div style={{ marginTop: 24 }}>
          <button className="btn btn-solid" type="submit" disabled={!canSubmit || submit.isPending}>
            {submit.isPending ? 'Enviando…' : 'Analisar código'}
          </button>
        </div>
      </form>
    </div>
  )
}
