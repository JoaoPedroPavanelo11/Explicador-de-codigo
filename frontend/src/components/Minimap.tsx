import type { MinimapFile } from '../api/types'
import { decodeMinimap } from '../lib/minimap'

// Desenha o "formato" de um arquivo, como o minimapa do VS Code: cada linha vira
// uma barra com o recuo e o comprimento da linha original. Não há texto do
// código aqui; o servidor nem guarda o código, só esses números.

const ROW = 2 // altura de cada linha no desenho
const COL = 0.5 // largura de cada coluna de texto
const WIDTH = 100

export function Minimap({ file, thumbnail = false }: { file: MinimapFile; thumbnail?: boolean }) {
  const rows = decodeMinimap(file.lines)
  const height = Math.max(rows.length * ROW, ROW)
  return (
    <svg
      className={thumbnail ? 'minimap is-thumb' : 'minimap'}
      viewBox={`0 0 ${WIDTH} ${thumbnail ? WIDTH * 1.2 : height}`}
      preserveAspectRatio={thumbnail ? 'xMinYMin slice' : 'xMinYMin meet'}
      role="img"
      aria-label={`Formato de ${file.path}: ${file.totalLines} linhas`}
    >
      {rows.map((r, i) =>
        r.kind === 'blank' ? null : (
          <rect
            key={i}
            className={r.kind === 'comment' ? 'mm-comment' : 'mm-code'}
            x={Math.min(r.indent * COL, WIDTH - 2)}
            y={i * ROW}
            width={Math.max(Math.min(r.length * COL, WIDTH - r.indent * COL), 1)}
            height={ROW * 0.7}
            rx={0.4}
          />
        ),
      )}
    </svg>
  )
}
