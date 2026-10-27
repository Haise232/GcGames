import { eur } from './money.js'
import { useCountUp } from './useCountUp.js'
import './celebrate.css'

const COIN_TONES = ['brass', 'ivory', 'green', 'purple', 'red']
const PARTY_TONES = ['#ffe27a', '#ff7a6b', '#7fe0b0', '#c9a2ff', '#f1e9d6']
const SPARKS = 14

// Ruido determinista para repartir las piezas sin usar Math.random al renderizar.
const noise = (i, salt) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Celebración a pantalla completa que comparten todos los juegos: «¡Felicidades! Has ganado …».
// who: tu nombre, en las mesas en vivo (así se nota que el aviso es para ti y no para otro jugador).
function WinBurst({ amount, caption, coins, big, tags = [], who = '' }) {
  const shown = useCountUp(amount, 900, 0)
  const fireworks = big ? 7 : 3
  const confetti = big ? 90 : 40
  return (
    <div className="win" aria-hidden="true">
      <div className="win__flash" />
      <div className="win__rays" />
      {[0, 1, 2].map((i) => (
        <span key={i} className="win__ring" style={{ '--delay': `${i * 0.18}s` }} />
      ))}
      {Array.from({ length: fireworks }, (_, b) => (
        <div
          key={b}
          className="firework"
          style={{
            left: `${10 + noise(b, 6) * 80}%`,
            top: `${10 + noise(b, 7) * 50}%`,
            '--delay': `${0.15 + b * 0.28}s`,
            '--tone': PARTY_TONES[b % PARTY_TONES.length],
          }}
        >
          {Array.from({ length: SPARKS }, (_, k) => (
            <i
              key={k}
              style={{
                '--a': `${k * (360 / SPARKS)}deg`,
                '--d': `${70 + noise(b * SPARKS + k, 8) * 70}px`,
              }}
            />
          ))}
        </div>
      ))}
      {Array.from({ length: confetti }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${noise(i, 9) * 100}%`,
            '--tone': PARTY_TONES[i % PARTY_TONES.length],
            '--delay': `${noise(i, 10) * 1.2}s`,
            '--sway': `${(noise(i, 11) * 2 - 1) * 80}px`,
            '--rot': `${(noise(i, 12) * 2 - 1) * 900}deg`,
            '--fall': `${1.6 + noise(i, 13) * 1.4}s`,
          }}
        />
      ))}
      {Array.from({ length: coins }, (_, i) => (
        <span
          key={i}
          className={`coin coin--${COIN_TONES[i % COIN_TONES.length]}`}
          style={{
            '--x': `${(noise(i, 1) * 2 - 1) * 46}vw`,
            '--peak': `${-(18 + noise(i, 2) * 30)}vh`,
            '--rot': `${(noise(i, 3) * 2 - 1) * 720}deg`,
            '--delay': `${noise(i, 4) * 0.45}s`,
            '--size': `${24 + noise(i, 5) * 24}px`,
          }}
        />
      ))}
      <p className="win__banner">
        <em className="win__title">{big ? '¡Premio gordo!' : `¡Felicidades${who ? `, ${who}` : ''}!`}</em>
        <b className="win__lead">{big && who ? `¡Felicidades, ${who}! Has ganado` : 'Has ganado'}</b>
        <strong>+{eur(shown)}</strong>
        <span>{caption}</span>
        {tags.map((tag) => (
          <b key={tag} className="win__tag">
            {tag}
          </b>
        ))}
      </p>
    </div>
  )
}

export default WinBurst
