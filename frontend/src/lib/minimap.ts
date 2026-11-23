// Decodifica o minimapa guardado pelo servidor (ver backend/src/analyzer/engine/identity.ts):
// 3 caracteres por linha (tipo, recuo/2 e comprimento/4 em base 36).

export interface MinimapRow {
  kind: 'code' | 'comment' | 'blank'
  indent: number // em colunas
  length: number // em colunas
}

export function decodeMinimap(lines: string): MinimapRow[] {
  const rows: MinimapRow[] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const kind = lines[i] === '#' ? 'comment' : lines[i] === '_' ? 'blank' : 'code'
    rows.push({
      kind,
      indent: parseInt(lines[i + 1], 36) * 2,
      length: parseInt(lines[i + 2], 36) * 4,
    })
  }
  return rows
}
