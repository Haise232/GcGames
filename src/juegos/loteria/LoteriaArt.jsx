// Dibujos de la Lotería de Navidad (SVG en línea, sin imágenes): los dos bombos dorados, los niños que cantan, el
// décimo y la cenefa del teatro. Todo es de diseño propio; solo se inspira en el ambiente del sorteo.
import { PRIZES, fmtNumber } from './loteria.js'
import { eur } from '../comun/money.js'

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function hasta999(n, apocopar) {
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  const partes = []
  if (c) partes.push(CENTENAS[c])
  if (r) {
    if (r < 30) partes.push(apocopar && (r === 1 || r === 21) ? (r === 1 ? 'un' : 'veintiún') : UNIDADES[r])
    else {
      const u = r % 10
      partes.push(DECENAS[Math.floor(r / 10)] + (u ? ` y ${apocopar && u === 1 ? 'un' : UNIDADES[u]}` : ''))
    }
  }
  return partes.join(' ')
}

// El número como lo cantan los niños: 25854 -> «veinticinco mil ochocientos cincuenta y cuatro».
export function enLetras(n) {
  if (n === 0) return 'cero'
  const miles = Math.floor(n / 1000)
  const resto = n % 1000
  const partes = []
  if (miles) partes.push(miles === 1 ? 'mil' : `${hasta999(miles, true)} mil`)
  if (resto) partes.push(hasta999(resto, false))
  return partes.join(' ')
}

// Los dos bombos: el grande (números) y el pequeño (premios), con sus asas, su base y la boquilla por donde cae la bola.
export function Bombos({ spinning, fast }) {
  const balls = (n, r, seed) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i * 137.5 + seed) * (Math.PI / 180)
      const d = r * Math.sqrt((i + 0.5) / n) * 0.82
      return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={r * 0.12} fill={i % 7 === 0 ? '#f8c54e' : '#fff8ec'} stroke="#b89a5a" strokeWidth="0.8" />
    })
  const bars = (r, angles) => angles.map((a) => <line key={a} x1={-r} y1="0" x2={r} y2="0" stroke="#f1cf7a" strokeWidth="2" transform={`rotate(${a})`} opacity="0.65" />)
  return (
    <svg className={`lt-bombos ${spinning ? 'is-spin' : ''} ${fast ? 'is-fast' : ''}`} viewBox="0 0 320 190" aria-hidden="true">
      <defs>
        <radialGradient id="lt-glass" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="0.6" stopColor="#ffe6a8" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.03" />
        </radialGradient>
        <linearGradient id="lt-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0b0" />
          <stop offset="0.45" stopColor="#f0c04e" />
          <stop offset="1" stopColor="#a86f12" />
        </linearGradient>
        <linearGradient id="lt-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a3a1c" />
          <stop offset="1" stopColor="#4a1a0c" />
        </linearGradient>
      </defs>
      {/* Bombo grande: soportes, bola cayendo por la boquilla y tambor */}
      <g transform="translate(104 88)">
        <path d="M-52 94 L-36 62 L-30 62 L-14 94 Z" fill="url(#lt-wood)" />
        <path d="M52 94 L36 62 L30 62 L14 94 Z" fill="url(#lt-wood)" />
        <rect x="-62" y="92" width="124" height="9" rx="4" fill="url(#lt-gold)" />
        <g className="lt-bombo__drum">
          <circle r="64" fill="#2a0c12" opacity="0.55" />
          {balls(36, 62, 11)}
          <circle r="64" fill="url(#lt-glass)" stroke="url(#lt-gold)" strokeWidth="6" />
          {bars(64, [0, 45, 90, 135])}
        </g>
        <circle r="9" fill="url(#lt-gold)" stroke="#7a4d0a" strokeWidth="1.5" />
        {/* Manivela */}
        <g className="lt-bombo__crank">
          <rect x="9" y="-3" width="30" height="6" rx="3" fill="url(#lt-gold)" />
          <circle cx="40" cy="0" r="6" fill="#d42a35" stroke="#7a0f1a" strokeWidth="1.5" />
        </g>
      </g>
      {/* Bombo pequeño: el de las bolitas de los premios */}
      <g transform="translate(250 112)">
        <path d="M-32 70 L-22 46 L-17 46 L-8 70 Z" fill="url(#lt-wood)" />
        <path d="M32 70 L22 46 L17 46 L8 70 Z" fill="url(#lt-wood)" />
        <rect x="-38" y="68" width="76" height="8" rx="4" fill="url(#lt-gold)" />
        <g className="lt-bombo__drum lt-bombo__drum--small">
          <circle r="40" fill="#2a0c12" opacity="0.55" />
          {balls(16, 38, 47)}
          <circle r="40" fill="url(#lt-glass)" stroke="url(#lt-gold)" strokeWidth="5" />
          {bars(40, [0, 60, 120])}
        </g>
        <circle r="6" fill="url(#lt-gold)" stroke="#7a4d0a" strokeWidth="1.2" />
      </g>
    </svg>
  )
}

// Dos niños de San Ildefonso a su manera: batas y cabezas redondas, la boca se abre mientras cantan.
export function Ninos({ singing }) {
  const nino = (x, pelo, piel, bata, flequillo) => (
    <g transform={`translate(${x} 0)`}>
      <path d="M-26 110 Q-26 66 0 64 Q26 66 26 110 Z" fill={bata} />
      <path d="M-8 66 L0 80 L8 66 Z" fill="#fffaf0" />
      <rect x="-5" y="56" width="10" height="12" rx="4" fill={piel} />
      <circle r="22" cx="0" cy="38" fill={piel} />
      <path d={flequillo} fill={pelo} />
      <circle cx="-8" cy="40" r="2.4" fill="#2a0c06" />
      <circle cx="8" cy="40" r="2.4" fill="#2a0c06" />
      <circle cx="-13" cy="47" r="3.6" fill="#ff8a90" opacity="0.5" />
      <circle cx="13" cy="47" r="3.6" fill="#ff8a90" opacity="0.5" />
      <ellipse className="lt-boca" cx="0" cy="50" rx="5.5" ry="4" fill="#7a1420" />
    </g>
  )
  return (
    <svg className={`lt-ninos ${singing ? 'is-sing' : ''}`} viewBox="0 0 140 110" aria-hidden="true">
      {nino(36, '#3a1a0c', '#f5cfa8', '#1d4f8f', 'M-23 36 Q-22 12 0 14 Q22 12 23 36 Q12 24 -2 26 Q-14 26 -23 36 Z')}
      {nino(102, '#1a1008', '#e8b98a', '#b81f2c', 'M-23 38 Q-24 10 0 12 Q24 10 23 38 Q18 24 6 22 Q-6 30 -23 38 Z')}
      {/* Atril dorado delante de los dos */}
      <path d="M8 84 L132 84 L124 110 L16 110 Z" fill="url(#lt-wood)" />
      <rect x="6" y="80" width="128" height="7" rx="3.5" fill="#f0c04e" />
    </svg>
  )
}

// El décimo, de diseño propio: matriz a la izquierda, número grande, cenefa roja y verde y la estrella.
export function Decimo({ number, bet, prize, done, hit }) {
  const state = done ? (prize ? 'is-prize' : 'is-blank') : ''
  return (
    <div className={`lt-decimo ${state} ${hit ? 'is-hit' : ''}`} aria-label={`Tu décimo: ${fmtNumber(number)}`}>
      <span className="lt-decimo__stub" aria-hidden="true">
        <b>{String(number % 1000).padStart(3, '0')}</b>
        <small>matriz</small>
      </span>
      <span className="lt-decimo__body">
        <span className="lt-decimo__top">
          <b>GcGames</b> · Sorteo de Navidad
        </span>
        <span className="lt-decimo__num">{fmtNumber(number)}</span>
        <span className="lt-decimo__row">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 2 L25 15 L39 15 L28 24 L32 38 L20 30 L8 38 L12 24 L1 15 L15 15 Z" fill="#c8202c" />
            <circle cx="20" cy="22" r="4" fill="#f8c54e" />
          </svg>
          <small>22 de diciembre · Teatro</small>
          <b>{eur(bet)}</b>
        </span>
      </span>
      {done && prize && <span className="lt-decimo__stamp">{PRIZES[prize].name}</span>}
      {done && !prize && <span className="lt-decimo__stamp lt-decimo__stamp--blank">Sin premio</span>}
    </div>
  )
}
