import './blackjack-beach.css'
// Blackjack en el chiringuito: el arte de la mesa de playa. Cuatro piezas, todas decorativas (aria-hidden) y con sus
// animaciones (bjb-*) en blackjack-beach.css:
//  - BeachScene: el fondo de la pantalla, la puesta de sol sobre el mar con el Teide, un velero, la arena y las luces.
//  - BeachProps: lo que hay en las esquinas de la mesa, una palmera, una sombrilla con tabla de surf y el cartel.
//  - Awning: el toldo a rayas del chiringuito sobre el borde de la mesa, con sus bombillas.
//  - Chiringuitero: el crupier, con sombrero de paja y camisa de flores.

const BULBS = ['#ff5a4f', '#ffd24a', '#2ee6d0', '#ff7ab8', '#7dd957']

// Una guirnalda de verbena: un cable que cuelga entre dos postes y las bombillas de colores. Las bombillas van en dos
// tandas (par e impar); cada tanda es una capa que parpadea entera, así el brillo no obliga a repintar el dibujo.
function Garland({ y, sag, from, to, hue = 0, wire = false, parity = 0 }) {
  const n = 14
  const mid = (from + to) / 2
  const at = (t) => [from + (to - from) * t, y + sag * 4 * t * (1 - t)]
  return (
    <g>
      {wire && <path d={`M${from} ${y} Q${mid} ${y + sag * 2} ${to} ${y}`} fill="none" stroke="#2a1a30" strokeOpacity="0.7" strokeWidth="2" />}
      {Array.from({ length: n }, (_, i) => {
        if (i % 2 !== parity) return null
        const [x, by] = at((i + 0.5) / n)
        const color = BULBS[(i + hue) % BULBS.length]
        return (
          <g key={i}>
            <circle cx={x} cy={by + 6} r="11" fill={color} opacity="0.28" />
            <circle cx={x} cy={by + 6} r="5" fill={color} />
            <circle cx={x - 1.5} cy={by + 4.2} r="1.6" fill="#fff" opacity="0.8" />
          </g>
        )
      })}
    </g>
  )
}

function Garlands({ parity, wire }) {
  return (
    <>
      <Garland y={34} sag={34} from={-20} to={560} parity={parity} wire={wire} />
      <Garland y={34} sag={34} from={540} to={1100} hue={2} parity={parity} wire={wire} />
      <Garland y={34} sag={34} from={1080} to={1620} hue={4} parity={parity} wire={wire} />
    </>
  )
}

// Ondas del mar: un trazo largo que se repite.
const WAVE = Array.from({ length: 24 }, (_, i) => (i === 0 ? 'M0 0 q40 -7 80 0' : 't80 0')).join(' ')

// Todas las capas comparten encuadre (la misma vista y el mismo recorte), así encajan unas con otras. Solo la base se
// dibuja una vez; las demás se mueven o parpadean como capas propias, sin repintar la escena.
const LAYER = { viewBox: '0 0 1600 900', preserveAspectRatio: 'xMidYMax slice' }

export function BeachScene() {
  return (
    <div className="bjb-scene" aria-hidden="true">
      <svg {...LAYER}>
        <defs>
          <linearGradient id="bjb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141652" />
            <stop offset="0.3" stopColor="#4a2a80" />
            <stop offset="0.58" stopColor="#c8457c" />
            <stop offset="0.82" stopColor="#ff8654" />
            <stop offset="1" stopColor="#ffc872" />
          </linearGradient>
          <radialGradient id="bjb-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff6c4" />
            <stop offset="0.55" stopColor="#ffd45e" />
            <stop offset="1" stopColor="#ff9a48" />
          </radialGradient>
          <radialGradient id="bjb-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffb55a" stopOpacity="0.75" />
            <stop offset="0.5" stopColor="#ff7a5a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ff4f8b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bjb-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f08a68" />
            <stop offset="0.12" stopColor="#b2527e" />
            <stop offset="0.35" stopColor="#2a5c92" />
            <stop offset="0.7" stopColor="#0f6c88" />
            <stop offset="1" stopColor="#0a4a64" />
          </linearGradient>
          <linearGradient id="bjb-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1d393" />
            <stop offset="0.5" stopColor="#d6a766" />
            <stop offset="1" stopColor="#8f6238" />
          </linearGradient>
        </defs>

        <rect width="1600" height="480" fill="url(#bjb-sky)" />
        <g fill="#fff" opacity="0.8">
          {[[120, 70, 1.6], [260, 150, 1.2], [420, 60, 1.4], [610, 120, 1.1], [980, 50, 1.5], [1180, 130, 1.2], [1370, 70, 1.6], [1500, 160, 1.1], [760, 40, 1.2]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>
        <circle cx="270" cy="470" r="330" fill="url(#bjb-glow)" />
        <circle cx="270" cy="452" r="76" fill="url(#bjb-sun)" />
        {/* El Teide al fondo y otra isla pequeña. */}
        <path d="M1180 480 L1270 420 L1308 372 Q1326 362 1344 372 L1390 424 L1560 480 Z" fill="#3a1f5c" />
        <path d="M1308 372 Q1326 362 1344 372 L1352 384 L1300 384 Z" fill="#ff9a6a" opacity="0.5" />
        <path d="M640 480 Q720 440 810 452 Q890 446 950 480 Z" fill="#32205a" />

        <rect y="480" width="1600" height="420" fill="url(#bjb-sea)" />
        {/* Velero en el horizonte. */}
        <g transform="translate(560 500)">
          <path d="M-40 0 L40 0 L28 12 L-28 12 Z" fill="#241048" />
          <path d="M-2 -5 L-2 -64 L34 -8 Z" fill="#ffe7c2" />
          <path d="M-6 -5 L-6 -50 L-34 -8 Z" fill="#ff8a6a" />
          <path d="M-2 -64 L-2 0" stroke="#241048" strokeWidth="2" />
        </g>
        {/* La arena, con la espuma de la orilla. */}
        <path d="M0 760 Q200 742 400 758 T800 756 T1200 758 T1600 752 L1600 900 L0 900 Z" fill="#fdf3dc" opacity="0.8" />
        <path d="M0 780 Q200 764 400 778 T800 776 T1200 778 T1600 772 L1600 900 L0 900 Z" fill="url(#bjb-sand)" />
        <g fill="#8f6238" opacity="0.35">
          {[[120, 840], [310, 870], [520, 830], [700, 880], [940, 845], [1130, 872], [1330, 836], [1490, 868]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="26" ry="3" />
          ))}
        </g>
        {/* Cable de las luces de verbena. */}
        <Garlands parity={-1} wire />
      </svg>
      {/* Nubes alargadas con el borde encendido, a la deriva. */}
      <svg className="bjb-layer bjb-layer--clouds" {...LAYER}>
        <g fill="#7a3a8c" opacity="0.55">
          <rect x="120" y="250" width="320" height="16" rx="8" />
          <rect x="200" y="272" width="220" height="11" rx="6" />
          <rect x="1060" y="210" width="360" height="18" rx="9" />
          <rect x="1150" y="234" width="230" height="11" rx="6" />
        </g>
        <g fill="#ffb07a" opacity="0.55">
          <rect x="540" y="340" width="260" height="10" rx="5" />
          <rect x="900" y="372" width="300" height="9" rx="5" />
        </g>
      </svg>
      {/* El camino del sol sobre el agua, que reluce. */}
      <svg className="bjb-layer bjb-layer--glitter" {...LAYER}>
        {Array.from({ length: 26 }, (_, i) => {
          const w = 22 + ((i * 29) % 7) * 11 + i * 3
          const x = 270 + (((i * 53) % 61) - 30) * (0.4 + i * 0.05) - w / 2
          return <rect key={i} x={x} y={490 + i * 13} width={w} height={2 + (i % 3) * 0.5} rx="1.2" fill="#ffe6a8" fillOpacity={Math.max(0.1, 0.9 - i * 0.034)} />
        })}
      </svg>
      {/* Olas: varias filas de trazos que se mecen todas a una. */}
      <svg className="bjb-layer bjb-layer--waves" {...LAYER}>
        {[[505, 0.16], [545, 0.14], [600, 0.12], [665, 0.11], [740, 0.1]].map(([y, o], i) => (
          <g key={y}>
            <path d={WAVE} transform={`translate(${-240 + i * 37} ${y})`} fill="none" stroke="#fff" strokeOpacity={o} strokeWidth="3" />
            <path d={WAVE} transform={`translate(${-160 + i * 23} ${y + 22})`} fill="none" stroke="#fff" strokeOpacity={o * 0.8} strokeWidth="2.4" />
          </g>
        ))}
      </svg>
      {/* Bombillas de verbena, en dos tandas que se alternan. */}
      <svg className="bjb-layer bjb-layer--lights-a" {...LAYER}>
        <Garlands parity={0} />
      </svg>
      <svg className="bjb-layer bjb-layer--lights-b" {...LAYER}>
        <Garlands parity={1} />
      </svg>
      <span className="bjb-scene__shade" />
    </div>
  )
}

// Una fronda: el nervio central es una curva que sube y se dobla hacia abajo, y de él salen los foliolos a los dos lados.
function Frond({ angle, length, droop, delay }) {
  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad) * length
  const dy = -Math.sin(rad) * length
  const c = [dx * 0.5, dy * 0.5 - length * 0.22]
  const end = [dx, dy + droop]
  const point = (t) => [
    2 * (1 - t) * t * c[0] + t * t * end[0],
    2 * (1 - t) * t * c[1] + t * t * end[1],
  ]
  const tangent = (t) => {
    const x = 2 * (1 - t) * c[0] + 2 * t * (end[0] - c[0])
    const y = 2 * (1 - t) * c[1] + 2 * t * (end[1] - c[1])
    const n = Math.hypot(x, y) || 1
    return [x / n, y / n]
  }
  const leaflets = []
  for (let t = 0.14; t < 0.99; t += 0.055) {
    const [x, y] = point(t)
    const [tx, ty] = tangent(t)
    const size = length * 0.3 * (1 - t * 0.55)
    for (const side of [-1, 1]) {
      // La normal de cada lado, inclinada hacia delante y con peso hacia abajo.
      const nx = -ty * side
      const ny = tx * side
      const fx = nx * 0.72 + tx * 0.5
      const fy = ny * 0.72 + ty * 0.5 + 0.38
      leaflets.push(<path key={`${t}${side}`} d={`M${x.toFixed(1)} ${y.toFixed(1)} L${(x + fx * size).toFixed(1)} ${(y + fy * size).toFixed(1)}`} />)
    }
  }
  return (
    <g className="bjb-frond" style={{ animationDelay: `${delay}s` }}>
      <g fill="none" stroke="#2c9a52" strokeWidth="6.5" strokeLinecap="round">
        {leaflets}
      </g>
      <path d={`M0 0 Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${end[0].toFixed(1)} ${end[1].toFixed(1)}`} fill="none" stroke="#1b6b3c" strokeWidth="3.4" strokeLinecap="round" />
    </g>
  )
}

// Palmera inclinada hacia la mesa: tronco con anillos, frondas con foliolos y cocos.
const FRONDS = [
  [172, 120, 70],
  [150, 134, 54],
  [124, 112, 30],
  [98, 96, 14],
  [70, 112, 28],
  [42, 134, 52],
  [14, 122, 68],
  [-14, 84, 56],
  [194, 84, 54],
]

function Palm() {
  return (
    <svg className="bjb-palm" viewBox="-170 -150 340 470" aria-hidden="true">
      <defs>
        <linearGradient id="bjb-trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6a4426" />
          <stop offset="0.5" stopColor="#b88250" />
          <stop offset="1" stopColor="#6a4426" />
        </linearGradient>
      </defs>
      <path d="M-34 318 Q-6 206 6 98 Q14 44 4 0 L28 0 Q40 50 34 104 Q20 214 24 318 Z" fill="url(#bjb-trunk)" />
      {Array.from({ length: 13 }, (_, i) => {
        const y = 308 - i * 23
        const x0 = -30 + i * 2.2
        const x1 = 22 + i * 0.9
        return <path key={i} d={`M${x0} ${y} Q${(x0 + x1) / 2} ${y - 5} ${x1} ${y}`} fill="none" stroke="#3e2713" strokeOpacity="0.5" strokeWidth="3" />
      })}
      <g transform="translate(16 0)">
        <g className="bjb-palm__crown">
          {FRONDS.map(([angle, length, droop], i) => (
            <Frond key={i} angle={angle} length={length} droop={droop} delay={i * 0.4} />
          ))}
          <circle cx="-8" cy="12" r="10" fill="#6a4a2a" />
          <circle cx="10" cy="16" r="10" fill="#7a5632" />
          <circle cx="1" cy="26" r="9" fill="#5c3e22" />
          <circle cx="-10" cy="9" r="3" fill="#fff" opacity="0.22" />
        </g>
      </g>
    </svg>
  )
}

// Sombrilla de rayas con tabla de surf, toalla y chanclas.
function Umbrella() {
  return (
    <svg className="bjb-umbrella" viewBox="0 0 300 330" aria-hidden="true">
      <defs>
        <linearGradient id="bjb-board" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#18b6b0" />
          <stop offset="1" stopColor="#0d8a8c" />
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="316" rx="136" ry="12" fill="#8f6238" opacity="0.5" />
      <g transform="rotate(8 52 310)">
        <path d="M52 300 Q22 190 52 90 Q82 190 52 300 Z" fill="url(#bjb-board)" stroke="#075a60" strokeWidth="3" />
        <path d="M52 112 L52 292" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" />
        <path d="M36 200 Q52 194 68 200" fill="none" stroke="#ffd24a" strokeWidth="6" />
      </g>
      <g className="bjb-umbrella__sway">
        <path d="M168 318 L160 60" stroke="#e9d8b0" strokeWidth="6" strokeLinecap="round" />
        <g transform="rotate(-6 160 60)">
          <path d="M40 92 Q50 8 160 4 Q270 8 280 92 Q248 74 220 92 Q190 74 160 92 Q130 74 100 92 Q72 74 40 92 Z" fill="#fff6e8" stroke="#8a2a24" strokeWidth="3" strokeLinejoin="round" />
          <path d="M160 4 Q130 40 100 92 Q72 74 40 92 Q50 8 160 4 Z" fill="#ff5a4f" />
          <path d="M160 4 Q196 40 220 92 Q190 74 160 92 Q130 74 100 92 Q130 40 160 4 Z" fill="#fff6e8" />
          <path d="M160 4 Q222 12 280 92 Q248 74 220 92 Q196 40 160 4 Z" fill="#ff5a4f" />
          <path d="M40 92 Q50 8 160 4 Q270 8 280 92 Q248 74 220 92 Q190 74 160 92 Q130 74 100 92 Q72 74 40 92 Z" fill="none" stroke="#8a2a24" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="160" cy="2" r="6" fill="#ffd24a" stroke="#8a2a24" strokeWidth="2" />
        </g>
      </g>
      <g transform="translate(176 296) rotate(-4)">
        <rect x="0" y="0" width="108" height="14" rx="3" fill="#fff6e8" />
        <rect x="14" y="0" width="14" height="14" fill="#2ee6d0" />
        <rect x="42" y="0" width="14" height="14" fill="#2ee6d0" />
        <rect x="70" y="0" width="14" height="14" fill="#2ee6d0" />
        <rect x="0" y="0" width="108" height="14" rx="3" fill="none" stroke="#0a4a64" strokeOpacity="0.5" />
      </g>
    </svg>
  )
}

// Cartel de madera clavado en la arena, bajo el centro de la mesa.
function Sign() {
  return (
    <span className="bjb-sign">
      <i />
      <b>Chiringuito</b>
      <small>Blackjack</small>
      <i />
    </span>
  )
}

export function BeachProps() {
  return (
    <div className="bjb-props" aria-hidden="true">
      <Palm />
      <Umbrella />
      <Sign />
    </div>
  )
}

// Toldo de rayas con volante festoneado y una hilera de bombillas, sobre el borde recto de la mesa.
export function Awning() {
  return (
    <div className="bjb-awning" aria-hidden="true">
      <span className="bjb-awning__lights" />
    </div>
  )
}

// El crupier vestido de chiringuitero: sombrero de paja, gafas de sol, bigote y camisa de flores.
export function Chiringuitero() {
  return (
    <svg className="bjb-chef" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bjb-chef-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb86a" />
          <stop offset="1" stopColor="#ff6b5a" />
        </linearGradient>
        <clipPath id="bjb-chef-clip">
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bjb-chef-bg)" />
      <g clipPath="url(#bjb-chef-clip)">
        <path d="M2 64 Q6 46 32 44 Q58 46 62 64 Z" fill="#1fb3ad" />
        <path d="M26 44 L32 54 L38 44 Z" fill="#e8b384" />
        <g fill="#fff6e8">
          <circle cx="14" cy="56" r="3" />
          <circle cx="50" cy="55" r="3" />
          <circle cx="22" cy="62" r="2.4" />
          <circle cx="44" cy="62" r="2.4" />
        </g>
        <g fill="#ff5a4f">
          <circle cx="14" cy="56" r="1.2" />
          <circle cx="50" cy="55" r="1.2" />
        </g>
        <rect x="27" y="38" width="10" height="9" rx="3" fill="#d79d6c" />
        <ellipse cx="32" cy="29" rx="13" ry="14" fill="#e8b384" />
        <path d="M19 31 Q19 41 32 43 Q45 41 45 31 Q40 38 32 38 Q24 38 19 31 Z" fill="#3a2a22" opacity="0.18" />
        <path d="M21 31 Q32 36 43 31" fill="none" stroke="#3a2a22" strokeOpacity="0.0" />
        <rect x="19" y="26" width="26" height="7" rx="3.4" fill="#1a1230" />
        <path d="M22 28 L28 28 M36 28 L42 28" stroke="#6ee3ff" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M24 38 Q32 34 40 38 Q36 41 32 39.6 Q28 41 24 38 Z" fill="#3a2a22" />
        <path d="M28 41.6 Q32 44.4 36 41.6" fill="none" stroke="#8a3a2a" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="32" cy="16" rx="26" ry="6.4" fill="#f1d27a" stroke="#b58a2a" strokeWidth="1.2" />
        <path d="M18 15 Q18 3 32 3 Q46 3 46 15 Q32 19 18 15 Z" fill="#f6dc8c" stroke="#b58a2a" strokeWidth="1.2" />
        <path d="M18.4 13 Q32 17.6 45.6 13 L45.8 16 Q32 20.6 18.2 16 Z" fill="#ff5a4f" />
        <path d="M9 17 Q32 22 55 17" fill="none" stroke="#b58a2a" strokeOpacity="0.5" strokeWidth="0.9" strokeDasharray="2 2.4" />
      </g>
      <circle cx="32" cy="32" r="30" fill="none" stroke="#fff6e8" strokeWidth="2" />
    </svg>
  )
}
