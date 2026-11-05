import { useId } from 'react'

// Leyenda impresa en el paño, en curva paralela al borde de la mesa, como en las mesas de juegos.
function FeltPrint({ note }) {
  const id = useId()
  return (
    <svg className="felt-print" viewBox="0 0 640 110" role="img" aria-label={`Blackjack paga 3 a 2. ${note}`}>
      <path id={`${id}a`} d="M 40 18 Q 320 118 600 18" fill="none" />
      <path id={`${id}b`} d="M 120 52 Q 320 132 520 52" fill="none" />
      <text className="felt-print__main">
        <textPath href={`#${id}a`} startOffset="50%" textAnchor="middle">
          Blackjack paga 3 a 2
        </textPath>
      </text>
      <text className="felt-print__note">
        <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">
          {note}
        </textPath>
      </text>
    </svg>
  )
}

export default FeltPrint
