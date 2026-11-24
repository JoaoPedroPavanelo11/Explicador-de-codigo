import { coverageNotice } from './format'

const base = {
  files: 5000,
  lines: 100,
  analyzedAt: '2026-11-21T00:00:00Z',
  engineVersion: '1.1.0',
  aiEnhanced: false,
  skippedFiles: 0,
}

describe('coverageNotice', () => {
  it('não avisa nada quando o projeto foi lido inteiro', () => {
    expect(coverageNotice({ ...base, relevantFiles: 5000, leftOutFiles: 0, oversizedFiles: 0 })).toBeNull()
  })

  it('não quebra em relatórios antigos, sem os campos novos', () => {
    expect(coverageNotice(base)).toBeNull()
  })

  it('explica a visão panorâmica com os números do projeto', () => {
    const text = coverageNotice({ ...base, relevantFiles: 7200, leftOutFiles: 2200 })
    expect(text).toContain('visão panorâmica')
    expect(text).toContain('7.200 arquivos')
    expect(text).toContain('5.000 mais importantes')
  })

  it('avisa sobre arquivos grandes demais ignorados', () => {
    expect(coverageNotice({ ...base, oversizedFiles: 3 })).toContain('3 arquivo(s) com mais de 512 KB')
  })
})
