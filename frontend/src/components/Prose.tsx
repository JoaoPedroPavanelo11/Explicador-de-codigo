import Markdown from 'react-markdown'

// o texto pode vir do código analisado: react-markdown não renderiza HTML cru,
// e ainda limitamos os elementos permitidos
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
