// Arte de la mesa de póker de la Season 4 · Islas: una partida en la playa de Canarias al atardecer. El fondo (cielo,
// sol, mar con olas, orilla, arena y palmeras), los farolillos de verbena, la estrella de mar del repartidor y el cubo de
// playa del bote. Todo es decorativo (aria-hidden) y solo se ve con el tema de las islas: los estilos, en poker-beach.css.
import './poker-beach.css'

// --- Palmeras: la silueta se genera con curvas, así cada una lleva sus hojas sin pintarlas a mano ---

const f1 = (n) => Math.round(n * 10) / 10

// Una hoja: nervio central curvo y foliolos a los dos lados, más cortos hacia la punta y la base.
function frond(x, y, angle, length, droop) {
  const a = (angle * Math.PI) / 180
  const rot = (px, py) => [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)]
  const [cx, cy] = rot(length * 0.55, -length * 0.3)
  const [ex, ey] = rot(length, droop)
  const [sx, sy] = [x, y]
  let d = `M${f1(sx)} ${f1(sy)}Q${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}`
  const leaflets = 15
  for (let i = 1; i <= leaflets; i++) {
    const t = i / (leaflets + 1)
    const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex
    const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey
    const tx = 2 * (1 - t) * (cx - sx) + 2 * t * (ex - cx)
    const ty = 2 * (1 - t) * (cy - sy) + 2 * t * (ey - cy)
    const norm = Math.hypot(tx, ty) || 1
    const [ux, uy] = [tx / norm, ty / norm]
    const size = length * 0.3 * Math.pow(Math.sin(Math.PI * Math.min(0.96, t + 0.06)), 0.8)
    for (const side of [-1, 1]) {
      // El foliolo sale en diagonal hacia delante y cae por su peso.
      const ang = side * 1.05
      const dx = ux * Math.cos(ang) - uy * Math.sin(ang)
      const dy = ux * Math.sin(ang) + uy * Math.cos(ang) + 0.55
      const m = Math.hypot(dx, dy)
      d += `M${f1(px)} ${f1(py)}l${f1((dx / m) * size)} ${f1((dy / m) * size)}`
    }
  }
  return d
}

// Cada palmera: [ángulo, largo, caída] de sus hojas. La segunda es otra especie de ángulos para que no sean gemelas.
const CROWNS = [
  [
    [-175, 150, 40],
    [-150, 175, 20],
    [-122, 165, -6],
    [-92, 150, -10],
    [-62, 168, -4],
    [-32, 178, 24],
    [-6, 150, 48],
    [150, 120, 40],
    [28, 118, 44],
  ],
  [
    [-168, 160, 30],
    [-140, 172, 8],
    [-108, 158, -12],
    [-78, 156, -12],
    [-48, 172, 6],
    [-18, 170, 30],
    [8, 140, 50],
    [160, 118, 46],
    [34, 112, 44],
  ],
]

const CROWN_AT = [
  [300, 214],
  [190, 214],
]

function Palm({ kind, className }) {
  const [cx, cy] = CROWN_AT[kind]
  const base = kind === 0 ? 120 : 330
  const trunk = `M${base - 15} 760C${base - 5} 600 ${cx - 60} 440 ${cx - 7} ${cy}L${cx + 7} ${cy}C${cx - 38} 450 ${base + 25} 600 ${base + 15} 760Z`
  // Anillos del tronco: de un borde al otro, siguiendo las dos curvas del contorno.
  const bez = (p0, c1, c2, p3, t) => {
    const u = 1 - t
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p3[k])
  }
  const marks = []
  for (let i = 1; i < 18; i++) {
    const t = i / 18
    const [lx, ly] = bez([base - 15, 760], [base - 5, 600], [cx - 60, 440], [cx - 7, cy], t)
    const [rx, ry] = bez([base + 15, 760], [base + 25, 600], [cx - 38, 450], [cx + 7, cy], t)
    marks.push(`M${f1(lx)} ${f1(ly)}Q${f1((lx + rx) / 2)} ${f1((ly + ry) / 2 + 6)} ${f1(rx)} ${f1(ry)}`)
  }
  return (
    <svg className={`pkb__palm ${className}`} viewBox="0 0 520 780" preserveAspectRatio="xMidYMax meet">
      <g>
        <path className="pkb__trunk" d={trunk} />
        <path className="pkb__rings" d={marks.join('')} />
        <g>
          <g className="pkb__fronds pkb__fronds--back">
            {CROWNS[kind].slice(0, 4).map(([a, l, d], i) => (
              <path key={i} d={frond(cx, cy, a, l, d)} />
            ))}
          </g>
          <g className="pkb__fronds">
            {CROWNS[kind].slice(4).map(([a, l, d], i) => (
              <path key={i} d={frond(cx, cy, a, l, d)} />
            ))}
          </g>
          <circle className="pkb__nut" cx={cx - 8} cy={cy + 10} r="9" />
          <circle className="pkb__nut" cx={cx + 8} cy={cy + 12} r="9" />
          <circle className="pkb__nut" cx={cx} cy={cy + 21} r="8" />
        </g>
      </g>
    </svg>
  )
}

// --- Farolillos de verbena: una guirnalda que cuelga sobre la mesa ---

const LANTERNS = Array.from({ length: 15 }, (_, i) => {
  const x = (i + 0.5) / 15
  // Catenaria suave: más baja en el centro.
  const sag = 1 - Math.pow(2 * x - 1, 2)
  return { left: f1(x * 100), top: f1(10 + sag * 46), tilt: f1(((x - 0.5) * 2) * -4), tone: i % 5 }
})

export function Farolillos() {
  return (
    <div className="pkb__lights" aria-hidden="true">
      <svg className="pkb__wire" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0 6Q50 106 100 6" vectorEffect="non-scaling-stroke" />
      </svg>
      {LANTERNS.map((l, i) => (
        <i key={i} className={`pkb__lantern pkb__lantern--${l.tone}`} style={{ left: `${l.left}%`, top: `${l.top}%`, '--tilt': `${l.tilt}deg`, '--d': `${(i * 0.37) % 2.4}s` }} />
      ))}
    </div>
  )
}

// --- El fondo: cielo, sol, islas, mar, orilla y arena ---

function Gull({ className }) {
  return (
    <svg className={`pkb__gull ${className}`} viewBox="0 0 40 16">
      <path d="M2 10Q10 0 20 9Q30 0 38 10Q30 5 20 12Q10 5 2 10Z" />
    </svg>
  )
}

export function PokerBeach() {
  return (
    <div className="pkb" aria-hidden="true">
      <div className="pkb__sky" />
      <div className="pkb__stars" />
      <div className="pkb__sun" />
      <div className="pkb__clouds">
        <i />
        <i />
        <i />
      </div>
      <svg className="pkb__isles" viewBox="0 0 1000 120" preserveAspectRatio="none">
        <path className="pkb__isle pkb__isle--far" d="M0 120V100Q60 90 110 92Q150 72 200 54Q230 38 252 32Q268 30 280 42Q320 72 380 90Q430 102 470 112Q490 118 500 120Z" />
        <path className="pkb__isle" d="M610 120Q640 112 700 104Q760 96 800 80Q840 66 880 72Q940 80 1000 98V120Z" />
      </svg>
      <svg className="pkb__boat" viewBox="0 0 60 56">
        <path d="M30 4V38L8 38Z" />
        <path d="M33 10V38H50Z" />
        <path d="M4 42H56L48 52H12Z" />
      </svg>
      <Gull className="pkb__gull--a" />
      <Gull className="pkb__gull--b" />
      <Gull className="pkb__gull--c" />
      <div className="pkb__sea">
        <div className="pkb__glint" />
        <div className="pkb__waves pkb__waves--a" />
        <div className="pkb__waves pkb__waves--b" />
      </div>
      <div className="pkb__shore">
        <div className="pkb__wet" />
        <div className="pkb__foam pkb__foam--a" />
        <div className="pkb__foam pkb__foam--b" />
      </div>
      <div className="pkb__sand" />
      <div className="pkb__props">
        <svg className="pkb__parasol" viewBox="0 0 120 120">
          <circle cx="62" cy="64" r="56" fill="rgba(40,20,10,.22)" />
          <circle cx="60" cy="60" r="54" fill="#fff6e8" />
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d={`M60 60L${f1(60 + 54 * Math.cos(((i * 45 - 22.5) * Math.PI) / 180))} ${f1(60 + 54 * Math.sin(((i * 45 - 22.5) * Math.PI) / 180))}A54 54 0 0 1 ${f1(60 + 54 * Math.cos(((i * 45 + 22.5) * Math.PI) / 180))} ${f1(60 + 54 * Math.sin(((i * 45 + 22.5) * Math.PI) / 180))}Z`} fill={i % 2 ? '#fff6e8' : '#ff6b5a'} />
          ))}
          <circle cx="60" cy="60" r="5" fill="#7a3b2e" />
        </svg>
        <svg className="pkb__towel" viewBox="0 0 160 90">
          <rect x="2" y="2" width="156" height="86" rx="6" fill="#fff6e8" />
          <rect x="2" y="14" width="156" height="14" fill="#2ee6d0" />
          <rect x="2" y="34" width="156" height="8" fill="#ffb547" />
          <rect x="2" y="62" width="156" height="14" fill="#ff4f8b" />
          <path d="M2 2V88M158 2V88" stroke="#e9d7b8" strokeWidth="6" strokeDasharray="2 3" />
        </svg>
        <svg className="pkb__shell pkb__shell--a" viewBox="0 0 40 36">
          <path d="M20 34L4 20Q2 6 20 2Q38 6 36 20Z" fill="#ffd9c0" />
          <path d="M20 34V4M20 34L9 8M20 34L31 8M20 34L5 18M20 34L35 18" stroke="#e58f6e" strokeWidth="2" fill="none" />
        </svg>
        <svg className="pkb__shell pkb__shell--b" viewBox="0 0 40 36">
          <path d="M20 34L4 20Q2 6 20 2Q38 6 36 20Z" fill="#fff0d9" />
          <path d="M20 34V4M20 34L9 8M20 34L31 8M20 34L5 18M20 34L35 18" stroke="#e0a57a" strokeWidth="2" fill="none" />
        </svg>
        <Starfish className="pkb__star-sand" />
      </div>
      <Palm kind={0} className="pkb__palm--l" />
      <Palm kind={1} className="pkb__palm--r" />
      <div className="pkb__vignette" />
    </div>
  )
}

// --- Estrella de mar: el botón del repartidor ---

const ARMS = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 11 : 22
  const a = ((i * 36 - 90) * Math.PI) / 180
  return `${f1(28 + r * Math.cos(a))},${f1(28 + r * Math.sin(a))}`
}).join(' ')

const DOTS = Array.from({ length: 5 }, (_, i) => {
  const a = ((i * 72 - 90) * Math.PI) / 180
  return [f1(28 + 18 * Math.cos(a)), f1(28 + 18 * Math.sin(a))]
})

export function Starfish({ className = '', letter = false }) {
  return (
    <svg className={`pkb__starfish ${className}`} viewBox="0 0 56 56" aria-hidden="true">
      <polygon points={ARMS} className="pkb__starfish-body" />
      {DOTS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.9" className="pkb__starfish-dot" />
      ))}
      {letter && <circle cx="28" cy="28" r="11" className="pkb__starfish-core" />}
      {letter && (
        <text x="28" y="33.5" textAnchor="middle" className="pkb__starfish-letter">
          D
        </text>
      )}
    </svg>
  )
}

// --- Cubo de playa: el bote ---

export function Bucket() {
  return (
    <svg className="pkb__bucket" viewBox="0 0 44 40" aria-hidden="true">
      <path className="pkb__bucket-handle" d="M9 14Q22 -6 35 14" />
      <path className="pkb__bucket-body" d="M5 12H39L35 37Q34.5 39 32 39H12Q9.5 39 9 37Z" />
      <path className="pkb__bucket-band" d="M6.6 21H37.4L36.2 28H7.8Z" />
      <ellipse className="pkb__bucket-rim" cx="22" cy="12" rx="17" ry="3.2" />
      <path className="pkb__bucket-shine" d="M12 15L14.5 35" />
    </svg>
  )
}
