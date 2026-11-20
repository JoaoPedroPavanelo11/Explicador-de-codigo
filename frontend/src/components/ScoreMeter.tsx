interface Props {
  score: number
  level: string
}

export function ScoreMeter({ score, level }: Props) {
  return (
    <div className="score">
      <div className="score-number" aria-label={`Nota ${score.toFixed(1)} de 10`}>
        {score.toFixed(1)}
        <span>/10</span>
      </div>
      <div className="score-scale" aria-hidden="true">
        <div className="bar">
          <span style={{ width: `${score * 10}%` }} />
        </div>
        <div className="score-ticks">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i}>{i}</span>
          ))}
        </div>
      </div>
      <p className="label" style={{ marginTop: 12 }}>
        {level}
      </p>
    </div>
  )
}
