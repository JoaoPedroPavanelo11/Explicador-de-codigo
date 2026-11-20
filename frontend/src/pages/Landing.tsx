import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'

const STEPS = [
  {
    n: '01',
    title: 'A ideia',
    text: 'O que o código faz, que problema resolve e para quem ele serve — de uma API bancária a um jogo.',
  },
  {
    n: '02',
    title: 'A stack',
    text: 'Linguagens, frameworks e versões, como as pastas estão organizadas e o provável motivo de cada escolha.',
  },
  {
    n: '03',
    title: 'Os pontos importantes',
    text: 'Os trechos que carregam a regra de negócio, explicados linha a linha, com o que há de interessante neles.',
  },
  {
    n: '04',
    title: 'A nota',
    text: 'Uma nota de 0 a 10 com critérios claros e sugestões práticas — para evoluir, nunca para humilhar.',
  },
]

export function Landing() {
  const { user } = useAuth()
  return (
    <div className="page">
      <section className="hero">
        <p className="label">Leitor de código</p>
        <h1 className="display">
          Leia qualquer código.
          <br />
          Entenda a ideia.
          <br />
          <span className="muted">Escreva melhor.</span>
        </h1>
        <p className="lead">
          Cole um trecho, envie um .zip ou aponte um repositório do GitHub. O Explicador lê o projeto e devolve um
          relatório que você pode baixar — seu ou de outra pessoa, feito à mão ou com IA.
        </p>
        <div className="hero-actions">
          <Link to={user ? '/nova' : '/criar-conta'} className="btn btn-solid">
            {user ? 'Nova análise' : 'Começar agora'}
          </Link>
          {!user && (
            <Link to="/entrar" className="btn btn-ghost">
              Já tenho conta
            </Link>
          )}
        </div>
      </section>

      <hr className="rule" />

      <section className="steps" aria-label="O que o relatório traz">
        {STEPS.map((s) => (
          <article key={s.n} className="step">
            <span className="step-n">{s.n}</span>
            <h2>{s.title}</h2>
            <p className="muted">{s.text}</p>
          </article>
        ))}
      </section>

      <hr className="rule" />

      <section className="manifesto">
        <p className="label">Por que isso existe</p>
        <p>
          A IA escreve código cada vez mais rápido. Entender esse código — e garantir que ele é seguro, testado e fácil
          de manter — continua sendo trabalho de gente. O Explicador existe para encurtar esse caminho e incentivar
          código mais confiável, feito com capricho.
        </p>
      </section>
    </div>
  )
}
