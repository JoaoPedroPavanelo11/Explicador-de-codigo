interface Props {
  code: string
  startLine: number
  file: string
  language: string
}

/** Bloco de código monocromático com numeração de linhas real do arquivo. */
export function CodeBlock({ code, startLine, file, language }: Props) {
  const lines = code.replace(/\n$/, '').split('\n')
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="code-head">
        <span>{file}</span>
        <span>{language}</span>
      </figcaption>
      <pre className="code">
        <table>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="ln">{startLine + i}</td>
                <td className="lc">{line || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </pre>
    </figure>
  )
}
