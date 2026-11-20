import { render, screen } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'
import { Prose } from './Prose'
import { ScoreMeter } from './ScoreMeter'

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
