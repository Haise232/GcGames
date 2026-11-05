import './PlayingCard.css'

const SUIT_GLYPHS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_NAMES = { spades: 'picas', hearts: 'corazones', diamonds: 'diamantes', clubs: 'tréboles' }
const RED = new Set(['hearts', 'diamonds'])

// Carta con anverso y reverso; al destaparse da la vuelta.
function PlayingCard({ rank, suit, down = false, index = 0 }) {
  const glyph = SUIT_GLYPHS[suit]
  return (
    <span
      className={`card ${down ? 'card--down' : ''} ${RED.has(suit) ? 'card--red' : ''}`}
      style={{ '--i': index }}
      role="img"
      aria-label={down ? 'Carta tapada' : `${rank} de ${SUIT_NAMES[suit]}`}
    >
      <span className="card__inner">
        <span className="card__face" aria-hidden="true">
          <span className="card__corner">
            {rank}
            <br />
            {glyph}
          </span>
          <span className="card__pip">{glyph}</span>
          <span className="card__corner card__corner--end">
            {rank}
            <br />
            {glyph}
          </span>
        </span>
        <span className="card__back" aria-hidden="true" />
      </span>
    </span>
  )
}

export default PlayingCard
