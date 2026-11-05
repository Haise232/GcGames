import { useEffect, useId, useMemo, useRef, useState } from 'react'

// La jaula del bote del bingo: una jaula dorada con el dinero dentro. El montón sube con el bote (en escala logarítmica,
// para que se note crecer tanto con 1.000 € como con un millón) y, cada vez que entra dinero, caen monedas entre los barrotes.
const FLOOR = 222 // suelo de la jaula (unidades del dibujo)
const TOP = 56 // hasta dónde puede llegar el montón
const DROP_MS = 1300

// Ruido determinista: el montón es siempre el mismo para el mismo bote.
const noise = (i, salt) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Lo lleno que está la jaula (0-1): 100 € casi vacía, 10.000 € a media altura, 1,5 millones llena.
export const fillOf = (pot) => (pot <= 0 ? 0 : Math.min(1, Math.max(0.05, (Math.log10(pot) - 2) / 4.2)))

// Monedas del montón: filas de abajo arriba hasta la altura del bote, más alto en el centro (como un montón de verdad).
function pile(fill) {
  const top = FLOOR - fill * (FLOOR - TOP)
  const coins = []
  const bills = []
  if (fill <= 0) return { top, coins, bills }
  for (let row = 0, y = FLOOR - 4; y > top - 14; row++, y -= 6.2) {
    for (let col = 0, x = 40 + (row % 2) * 6.5; x < 162; col++, x += 13) {
      // Los lados del montón caen: cuanto más lejos del centro, más baja la cima.
      const edge = ((x - 100) / 62) ** 2 * 22
      if (y < top + edge) continue
      const k = row * 20 + col
      coins.push({ x: x + (noise(k, 1) - 0.5) * 3, y: y + (noise(k, 2) - 0.5) * 2, tone: noise(k, 3) < 0.18 ? 'silver' : 'gold' })
    }
  }
  // Algún billete asomando entre las monedas.
  const n = Math.round(2 + fill * 9)
  for (let i = 0; i < n; i++) {
    const x = 50 + noise(i, 4) * 100
    const y = FLOOR - 10 - noise(i, 5) * Math.max(0, FLOOR - top - 26)
    const edge = ((x - 100) / 62) ** 2 * 22
    if (y < top + edge + 6) continue
    bills.push({ x, y, rot: (noise(i, 6) - 0.5) * 70 })
  }
  return { top, coins, bills }
}

// Barrotes de la cúpula: de cada barrote del cuerpo a la anilla de arriba.
const BARS = Array.from({ length: 11 }, (_, i) => 36 + i * 12.8)

function BingoCage({ pot, className = '' }) {
  const id = useId().replace(/:/g, '')
  const fill = fillOf(pot)
  const { top, coins, bills } = useMemo(() => pile(fill), [fill])
  const [drops, setDrops] = useState([])
  const before = useRef(pot)
  const seq = useRef(0)

  // Entra dinero: caen unas monedas (más cuanto más entra) desde lo alto de la jaula hasta el montón.
  useEffect(() => {
    const gain = pot - before.current
    before.current = pot
    if (gain <= 0) return
    const many = Math.min(9, 2 + Math.round(Math.log10(gain)))
    const fresh = Array.from({ length: many }, (_, i) => {
      const k = ++seq.current
      return { key: k, x: 56 + noise(k, 7) * 88, delay: i * 90 + noise(k, 8) * 120, spin: noise(k, 9) < 0.5 ? -1 : 1 }
    })
    setDrops((list) => [...list, ...fresh].slice(-24))
    const timer = setTimeout(() => setDrops((list) => list.filter((d) => !fresh.includes(d))), DROP_MS + 1200)
    return () => clearTimeout(timer)
  }, [pot])

  return (
    <svg className={`cage ${className}`} viewBox="0 0 200 252" role="img" aria-label="Jaula del bote del bingo">
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor="#ffd86b" stopOpacity={0.18 + fill * 0.4} />
          <stop offset="100%" stopColor="#ffd86b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-brass`} x1="0" x2="1">
          <stop offset="0%" stopColor="#7a5418" />
          <stop offset="35%" stopColor="#f6d27a" />
          <stop offset="55%" stopColor="#fff1c2" />
          <stop offset="80%" stopColor="#c8962f" />
          <stop offset="100%" stopColor="#6d4813" />
        </linearGradient>
        <radialGradient id={`${id}-gold`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#fff4bf" />
          <stop offset="45%" stopColor="#f2c246" />
          <stop offset="100%" stopColor="#a36f12" />
        </radialGradient>
        <radialGradient id={`${id}-silver`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#c9d2da" />
          <stop offset="100%" stopColor="#7d8893" />
        </radialGradient>
        <clipPath id={`${id}-inside`}>
          <path d="M32 222 V112 C32 62 64 36 100 36 C136 36 168 62 168 112 V222 Z" />
        </clipPath>
      </defs>

      <ellipse cx="100" cy="150" rx="98" ry="104" fill={`url(#${id}-glow)`} className="cage__glow" />
      {/* Fondo de la jaula: un poco de oscuridad para que se lea el dinero. */}
      <path d="M32 222 V112 C32 62 64 36 100 36 C136 36 168 62 168 112 V222 Z" className="cage__back" />

      <g clipPath={`url(#${id}-inside)`}>
        {bills.map((b, i) => (
          <g key={`b${i}`} transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
            <rect x="-15" y="-7" width="30" height="14" rx="1.5" className="cage__bill" />
            <rect x="-11" y="-4" width="22" height="8" rx="1" className="cage__bill-in" />
            <circle r="3" className="cage__bill-seal" />
          </g>
        ))}
        {coins.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <ellipse rx="7.4" ry="3.5" cy="1.6" className="cage__coin-edge" />
            <ellipse rx="7.4" ry="3.5" fill={`url(#${id}-${c.tone})`} className="cage__coin" />
          </g>
        ))}
        {drops.map((d) => (
          <g key={d.key} className="cage__drop" style={{ '--fall': `${Math.max(20, top - 30)}px`, '--delay': `${d.delay}ms`, '--spin': d.spin }}>
            <g transform={`translate(${d.x} 30)`}>
              <ellipse rx="7.4" ry="7.4" fill={`url(#${id}-gold)`} className="cage__coin cage__coin--fly" />
            </g>
          </g>
        ))}
      </g>

      {/* Barrotes por delante del dinero. */}
      <g className="cage__bars" stroke={`url(#${id}-brass)`}>
        {BARS.map((x) => (
          <path key={x} d={`M${x} 222 V112 Q${x + (x - 100) * 0.05} 52 100 36`} />
        ))}
      </g>
      <g className="cage__hoops" stroke={`url(#${id}-brass)`}>
        <path d="M33 112 H167" />
        <path d="M32 160 H168" />
        <path d="M45 72 Q100 60 155 72" />
      </g>
      <circle cx="100" cy="22" r="10" className="cage__ring" stroke={`url(#${id}-brass)`} />
      <rect x="92" y="30" width="16" height="9" rx="3" fill={`url(#${id}-brass)`} />
      <rect x="18" y="220" width="164" height="14" rx="4" fill={`url(#${id}-brass)`} />
      <rect x="28" y="234" width="144" height="10" rx="3" fill={`url(#${id}-brass)`} className="cage__plinth" />
      <path d="M86 227 h28" className="cage__plate" />
    </svg>
  )
}

export default BingoCage
