// Piezas comunes del Pase de las Islas (franja del selector y pantalla del pase).
import { eur } from '../comun/money.js'

// Nombre corto de cada juego, para los botones «Ir a …» de las misiones.
export const GAME_NAMES = {
  roulette: 'Ruleta',
  crash: 'Cohete',
  race: 'Carrera',
  plinko: 'Plinko',
  frog: 'Rana',
  fish: 'Pez Gordo',
  dig: 'Arena',
  tower: 'La Torre',
  heist: 'El Atraco',
  bingo: 'Bingo',
  auction: 'Subasta',
  elevator: 'Ascensor',
  blackjack: 'Blackjack',
  poker: 'Póker',
  chess: 'Ajedrez',
  gacha: 'Gacha',
  dive: 'Apnea',
  regatta: 'Regata',
  scratch: 'Rasca',
  hilo: 'Mayor o Menor',
  bola: 'Bola Canaria',
}

// Premios por reclamar: niveles desbloqueados que aún no se han cobrado, y su total.
export function unclaimed(pase) {
  const list = pase?.rewards.filter((r) => r.unlocked && !r.claimed) ?? []
  return { count: list.length, eur: list.reduce((sum, r) => sum + r.eur, 0) }
}

// Anillo del nivel: el número en el centro y el progreso hacia el siguiente alrededor.
export function LevelRing({ pase, size = 96 }) {
  const r = 42
  const c = 2 * Math.PI * r
  const max = pase && pase.level >= pase.maxLevel
  const frac = pase ? (max ? 1 : pase.levelXp / pase.perLevel) : 0
  return (
    <span className="s4-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="s4-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe36e" />
            <stop offset="0.5" stopColor="#ff8a4c" />
            <stop offset="1" stopColor="#ff4f8b" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle
          className="s4-ring__fill"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#s4-ring-grad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="s4-ring__num">
        <small>Nivel</small>
        <b>{pase ? pase.level : '–'}</b>
      </span>
    </span>
  )
}

// Barra de XP del nivel actual.
export function XpBar({ pase }) {
  if (!pase) return <span className="s4-xp s4-xp--skel" />
  const max = pase.level >= pase.maxLevel
  const pct = max ? 100 : Math.round((pase.levelXp / pase.perLevel) * 100)
  return (
    <span className="s4-xp" role="progressbar" aria-valuemin={0} aria-valuemax={pase.perLevel} aria-valuenow={max ? pase.perLevel : pase.levelXp} aria-label="Experiencia del nivel">
      <span className="s4-xp__fill" style={{ width: `${pct}%` }} />
      <span className="s4-xp__text">{max ? '¡Nivel máximo!' : `${pase.levelXp} / ${pase.perLevel} XP`}</span>
    </span>
  )
}

// Una misión del día: casilla, texto, barra de progreso y XP.
export function Mission({ mission, onGo, compact = false }) {
  const pct = Math.round((mission.progress / mission.goal) * 100)
  const name = mission.game ? GAME_NAMES[mission.game] : null
  return (
    <li className={`s4-mission ${mission.done ? 'is-done' : ''} ${compact ? 's4-mission--compact' : ''}`}>
      <span className="s4-mission__check" aria-hidden="true">
        {mission.done ? '✓' : ''}
      </span>
      <span className="s4-mission__body">
        <span className="s4-mission__text">{mission.text}</span>
        <span className="s4-mission__bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="s4-mission__meta">
          <span>
            {mission.done ? 'Hecha' : `${mission.progress} / ${mission.goal}`}
            <span className="sr-only">{mission.done ? '' : ` de ${mission.text}`}</span>
          </span>
          <b>+{mission.xp} XP</b>
        </span>
      </span>
      {!compact && !mission.done && name && onGo && (
        <button type="button" className="s4-btn s4-btn--sm" onClick={() => onGo(mission.game)}>
          Ir a {name}
        </button>
      )}
    </li>
  )
}

// Cofre cerrado (o abierto) en SVG.
export function Chest({ open = false, className = '' }) {
  return (
    <svg className={`s4-chest ${open ? 'is-open' : ''} ${className}`} viewBox="0 0 100 90" aria-hidden="true">
      <ellipse cx="50" cy="84" rx="38" ry="5" fill="rgba(0,0,0,0.3)" />
      <rect x="12" y="40" width="76" height="42" rx="6" fill="#b5622a" stroke="#5a2a0e" strokeWidth="3" />
      <rect x="12" y="52" width="76" height="6" fill="#ffd25e" stroke="#5a2a0e" strokeWidth="2" />
      <rect x="22" y="40" width="7" height="42" fill="#ffd25e" stroke="#5a2a0e" strokeWidth="2" />
      <rect x="71" y="40" width="7" height="42" fill="#ffd25e" stroke="#5a2a0e" strokeWidth="2" />
      {open && <ellipse className="s4-chest__light" cx="50" cy="40" rx="30" ry="9" fill="#fff3b0" />}
      <g className="s4-chest__lid">
        <path d="M12 40 C 12 18, 88 18, 88 40 Z" fill="#cf7a36" stroke="#5a2a0e" strokeWidth="3" />
        <rect x="22" y="22" width="7" height="18" fill="#ffd25e" stroke="#5a2a0e" strokeWidth="2" />
        <rect x="71" y="22" width="7" height="18" fill="#ffd25e" stroke="#5a2a0e" strokeWidth="2" />
      </g>
      <rect x="43" y="44" width="14" height="14" rx="3" fill="#ffe8a0" stroke="#5a2a0e" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="2.4" fill="#5a2a0e" />
    </svg>
  )
}

export const chestReward = (pase) => (pase?.streak.next ? `${eur(pase.streak.next.eur)} + ${pase.streak.next.xp} XP` : null)
