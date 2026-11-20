import Markdown from 'react-markdown'

/**
 * Renderiza o Markdown simples dos textos do relatório (negrito, itálico,
 * `código`). O react-markdown NÃO interpreta HTML bruto por padrão — então
 * um texto malicioso vindo do código analisado não vira script na página.
 */
export function Prose({ children, inline = false }: { children: string; inline?: boolean }) {
  return (
    <div className="prose">
      <Markdown
        allowedElements={['p', 'strong', 'em', 'code', 'a', 'ul', 'ol', 'li']}
        components={{
          p: ({ children: c }) => (inline ? <>{c}</> : <p>{c}</p>),
          a: ({ children: c, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {c}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
