import { render, screen } from '@testing-library/react'
import { decodeMinimap } from '../lib/minimap'
import { CodeBlock } from './CodeBlock'
import { Minimap } from './Minimap'
import { Prose } from './Prose'
import { ScoreMeter } from './ScoreMeter'
import { SourceCard } from './SourceCard'

describe('Prose', () => {
  it('renderiza negrito e código inline', () => {
    render(<Prose>{'Usa **transação** com `prisma.$transaction`'}</Prose>)
    expect(screen.getByText('transação').tagName).toBe('STRONG')
    expect(screen.getByText('prisma.$transaction').tagName).toBe('CODE')
  })

  it('não executa HTML vindo do código analisado (proteção contra XSS)', () => {
    const { container } = render(<Prose>{'Olá <img src=x onerror="alert(1)"> <script>alert(2)</script>'}</Prose>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })
})

describe('ScoreMeter', () => {
  it('mostra a nota com uma casa decimal e o nível', () => {
    render(<ScoreMeter score={7} level="Bom caminho" />)
    expect(screen.getByLabelText('Nota 7.0 de 10')).toBeInTheDocument()
    expect(screen.getByText('Bom caminho')).toBeInTheDocument()
  })
})

describe('CodeBlock', () => {
  it('numera as linhas a partir da linha real do arquivo', () => {
    render(<CodeBlock code={'a()\nb()'} startLine={41} file="src/x.ts" language="TypeScript" />)
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})

describe('Minimap', () => {
  it('desenha uma barra por linha não vazia e nenhum texto de código', () => {
    // comentário, código com recuo 2 (4 colunas), linha vazia
    const file = { path: 'a.ts', totalLines: 3, lines: '#05c23_00' }
    const { container } = render(<Minimap file={file} />)
    expect(decodeMinimap(file.lines)).toEqual([
      { kind: 'comment', indent: 0, length: 20 },
      { kind: 'code', indent: 4, length: 12 },
      { kind: 'blank', indent: 0, length: 0 },
    ])
    expect(container.querySelectorAll('rect')).toHaveLength(2)
    expect(container.textContent).toBe('')
    expect(screen.getByRole('img', { name: 'Formato de a.ts: 3 linhas' })).toBeInTheDocument()
  })
})

describe('SourceCard', () => {
  it('liga para a versão exata do GitHub que foi analisada', () => {
    const sha = '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d'
    render(
      <SourceCard
        sourceType="GITHUB"
        sourceRef="https://github.com/octocat/Hello-World"
        sourceIdentity={{ fingerprint: 'f'.repeat(64), commit: sha, minimap: [] }}
      />,
    )
    expect(screen.getByRole('link', { name: 'octocat/Hello-World @ 7fd1a60' })).toHaveAttribute(
      'href',
      `https://github.com/octocat/Hello-World/tree/${sha}`,
    )
    expect(screen.getByText(/sha256:ffffffffffffffff/)).toBeInTheDocument()
  })

  it('código colado: avisa que o código foi apagado e mostra o formato', () => {
    render(
      <SourceCard
        sourceType="PASTE"
        sourceRef={null}
        sourceIdentity={{ fingerprint: 'a'.repeat(64), minimap: [{ path: 'x.ts', totalLines: 1, lines: 'c05' }] }}
      />,
    )
    expect(screen.getByText('Código colado')).toBeInTheDocument()
    expect(screen.getByText(/foi apagado logo após a análise/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Formato de x.ts: 1 linhas' })).toBeInTheDocument()
  })
})
