// Plinko en Navidad (Season 5): el triángulo de clavos es un abeto y los clavos son sus luces de colores; la bola es una
// bola de Navidad que sale de la estrella de la punta y cae a los regalos que hay debajo (las casillas). Detrás, la noche
// de Canarias: aurora, luna, el Teide nevado, casitas con la luz encendida, un muñeco de nieve y nieve que cae.
// Aquí el dibujo; los colores y las animaciones, en plinko-navidad.css. Solo se ve con .juegos-root.s5 sin Halloween.
//
// El SVG del tablero tiene overflow visible y el marco lo recorta: el cielo, el suelo y el pueblo se pintan más allá
// del viewBox para que, en pantallas anchas o altas, el hueco que sobra a los lados del tablero siga siendo paisaje.
import './plinko-navidad.css'

// Colores de las bolas: cada bola sale de uno (por turnos).
export const ORNAMENTS = [
  { id: 'red', hi: '#ffd0d4', mid: '#ff2e45', lo: '#8a0717' },
  { id: 'gold', hi: '#fff6cc', mid: '#ffc627', lo: '#9a6a05' },
  { id: 'blue', hi: '#d8f0ff', mid: '#2f9dff', lo: '#0b3c8a' },
  { id: 'green', hi: '#d6ffe6', mid: '#22c96c', lo: '#06603a' },
  { id: 'purple', hi: '#f1dcff', mid: '#b05cff', lo: '#4e1590' },
  { id: 'pink', hi: '#ffe0f2', mid: '#ff4fae', lo: '#8f0f58' },
]
export const ornamentOf = (id) => ORNAMENTS[id % ORNAMENTS.length]

// Pseudoaleatorio fijo (la nieve y las estrellas salen siempre en el mismo sitio).
const rnd = (k) => {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Estrella de cinco puntas centrada en (cx, cy).
function starPath(cx, cy, outer, inner) {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const r = k % 2 ? inner : outer
    return `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`
  })
  return `M${pts.join(' L')} Z`
}

function House({ x, y, w, h, wall, roof }) {
  const rh = h * 0.55
  return (
    <g className="pn-house" transform={`translate(${x} ${y})`}>
      <rect className="pn-house__chimney" x={w * 0.62} y={-h - rh * 0.75} width={w * 0.13} height={rh * 0.6} />
      <rect x={0} y={-h} width={w} height={h} fill={wall} />
      <path d={`M${-w * 0.08} ${-h} L${w / 2} ${-h - rh} L${w * 1.08} ${-h} Z`} fill={roof} />
      <path className="pn-snowcap" d={`M${-w * 0.1} ${-h + 1} L${w / 2} ${-h - rh - 2} L${w * 1.1} ${-h + 1} L${w * 0.9} ${-h + 4} Q${w * 0.7} ${-h - 1} ${w / 2} ${-h + 3} Q${w * 0.3} ${-h - 1} ${w * 0.1} ${-h + 4} Z`} />
      <rect className="pn-window" x={w * 0.14} y={-h * 0.72} width={w * 0.24} height={h * 0.3} rx={1.5} />
      <rect className="pn-window pn-window--b" x={w * 0.62} y={-h * 0.72} width={w * 0.24} height={h * 0.3} rx={1.5} />
      <rect className="pn-door" x={w * 0.42} y={-h * 0.42} width={w * 0.16} height={h * 0.42} rx={2} />
      <circle className="pn-wreath" cx={w / 2} cy={-h * 0.52} r={w * 0.06} />
    </g>
  )
}

function Fir({ x, y, s = 1 }) {
  return (
    <g className="pn-fir" transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-2.5} y={-8} width={5} height={8} fill="#3a2414" />
      <path d="M0 -62 L16 -34 L8 -34 L22 -10 L-22 -10 L-8 -34 L-16 -34 Z" />
      <path className="pn-snowcap" d="M0 -62 L9 -46 Q4 -44 0 -47 Q-4 -44 -9 -46 Z" />
    </g>
  )
}

function Snowman({ x, y }) {
  return (
    <g className="pn-snowman" transform={`translate(${x} ${y})`}>
      <circle cy={-14} r={15} />
      <circle cy={-38} r={11} />
      <circle cy={-57} r={8} />
      <rect className="pn-snowman__hat" x={-7} y={-74} width={14} height={11} rx={1} />
      <rect className="pn-snowman__hat" x={-10} y={-64} width={20} height={3} rx={1} />
      <path className="pn-snowman__scarf" d="M-9 -50 Q0 -45 9 -50 L9 -47 Q0 -42 -9 -47 Z M4 -48 L8 -36 L4 -36 L1 -47 Z" />
      <path d="M0 -57 L9 -55 L0 -54 Z" fill="#ff8a2a" />
      <circle cx={-3} cy={-60} r={1.2} fill="#1a1a24" />
      <circle cx={3} cy={-60} r={1.2} fill="#1a1a24" />
      {[-42, -36, -30].map((cy) => (
        <circle key={cy} cy={cy} r={1.3} fill="#1a1a24" />
      ))}
      <path d="M-10 -40 L-26 -50 M-20 -46 L-24 -54 M10 -40 L26 -48 M20 -45 L25 -52" stroke="#5a3a1e" strokeWidth={2} strokeLinecap="round" fill="none" />
    </g>
  )
}

// El fondo del tablero. w × h es el viewBox de los clavos y las casillas; top es la fila 0, rowGap la distancia entre
// filas, s la distancia entre clavos y slotY la fila de regalos.
export function NavidadFondo({ w, h, top, rowGap, s, rows, slotY }) {
  const cx = w / 2
  const ground = slotY - 4
  const pegY = (row) => top + row * rowGap
  // Pisos del abeto (en filas): cada uno tapa el arranque del siguiente.
  const tiers = [
    [-0.9, 3.2],
    [1.9, 6.4],
    [5, 9.5],
    [8.1, rows + 0.4],
  ].map(([a, b], i) => {
    const yTop = pegY(a)
    const yBot = pegY(b)
    const topHw = i === 0 ? 0 : (s / 2) * a + s - 26
    const hw = (s / 2) * b + s + 14
    return `M${cx - topHw} ${yTop} L${cx + topHw} ${yTop} L${cx + hw} ${yBot} Q${cx + hw * 0.5} ${yBot + 10} ${cx} ${yBot + 4} Q${cx - hw * 0.5} ${yBot + 10} ${cx - hw} ${yBot} Z`
  })
  // Espumillón: tres guirnaldas doradas que cruzan el árbol.
  const swags = [2.6, 5.9, 9].map((row) => {
    const y = pegY(row)
    const hw = (s / 2) * row + s + 2
    return `M${cx - hw} ${y - 6} Q${cx} ${y + 26} ${cx + hw} ${y - 14}`
  })
  const teide = ground - 4
  return (
    <g className="pn pn-fondo" aria-hidden="true">
      <defs>
        <linearGradient id="pn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060b24" />
          <stop offset="0.45" stopColor="#0d1d4a" />
          <stop offset="0.8" stopColor="#1d3a72" />
          <stop offset="1" stopColor="#3a5d94" />
        </linearGradient>
        <linearGradient id="pn-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3dffb0" stopOpacity="0" />
          <stop offset="0.25" stopColor="#3dffb0" />
          <stop offset="0.55" stopColor="#4fd2ff" />
          <stop offset="0.8" stopColor="#c15cff" />
          <stop offset="1" stopColor="#c15cff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pn-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f9ff" />
          <stop offset="0.3" stopColor="#cfe2f7" />
          <stop offset="1" stopColor="#8fb0d6" />
        </linearGradient>
        <linearGradient id="pn-tree" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b8a52" />
          <stop offset="1" stopColor="#0a4a2c" />
        </linearGradient>
        <linearGradient id="pn-mount" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3566" />
          <stop offset="1" stopColor="#14254b" />
        </linearGradient>
        <radialGradient id="pn-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3b0" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#ffd24a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd24a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pn-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fdfbea" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fdfbea" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pn-treeglow" cx="0.5" cy="0.62" r="0.55">
          <stop offset="0" stopColor="#ffcf5a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffcf5a" stopOpacity="0" />
        </radialGradient>
        {ORNAMENTS.map((o) => (
          <radialGradient key={o.id} id={`pn-orn-${o.id}`} cx="0.36" cy="0.32" r="0.75">
            <stop offset="0" stopColor={o.hi} />
            <stop offset="0.42" stopColor={o.mid} />
            <stop offset="1" stopColor={o.lo} />
          </radialGradient>
        ))}
        <linearGradient id="pn-cap" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a8761d" />
          <stop offset="0.5" stopColor="#fff0b0" />
          <stop offset="1" stopColor="#a8761d" />
        </linearGradient>
        <filter id="pn-blur" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Cielo (muy ancho y alto: rellena el marco aunque sobre sitio) y estrellas. */}
      <rect x={-3000} y={-3000} width={w + 6000} height={3000 + ground} fill="url(#pn-sky)" />
      <g className="pn-stars">
        {Array.from({ length: 46 }, (_, k) => (
          <circle
            key={k}
            className={k % 4 ? 'pn-star' : 'pn-star pn-star--tw'}
            cx={-360 + rnd(k) * (w + 720)}
            cy={-260 + rnd(k + 70) * (ground - 120)}
            r={k % 6 ? 0.8 : 1.5}
            style={{ animationDelay: `${(k % 7) * 0.45}s` }}
          />
        ))}
      </g>

      {/* Aurora boreal. */}
      <g className="pn-aurora" filter="url(#pn-blur)">
        <path d={`M${-420} 70 C${w * 0.1} -10 ${w * 0.35} 120 ${w * 0.6} 40 S${w + 260} 10 ${w + 420} 80 L${w + 420} 110 C${w * 0.8} 60 ${w * 0.45} 160 ${w * 0.15} 70 S-260 90 -420 110 Z`} fill="url(#pn-aurora)" />
        <path className="pn-aurora__b" d={`M${-420} 150 C${w * 0.2} 80 ${w * 0.5} 190 ${w * 0.8} 110 S${w + 300} 120 ${w + 420} 150 L${w + 420} 168 C${w * 0.7} 140 ${w * 0.4} 220 0 150 Z`} fill="url(#pn-aurora)" />
      </g>

      {/* Luna. */}
      <circle cx={34} cy={22} r={46} fill="url(#pn-moon)" />
      <circle className="pn-moon" cx={34} cy={22} r={17} />
      <circle cx={28} cy={18} r={3.5} fill="#e3dcc0" />
      <circle cx={40} cy={28} r={2.4} fill="#e3dcc0" />

      {/* El Teide nevado y las lomas de detrás, con lucecitas de pueblo al pie. */}
      <path d={`M${w * 0.62} ${teide} Q${w * 0.92} ${teide - 70} ${w * 1.06} ${teide - 168} L${w * 1.1} ${teide - 176} L${w * 1.14} ${teide - 168} Q${w * 1.3} ${teide - 70} ${w * 1.7} ${teide} Z`} fill="url(#pn-mount)" />
      <path className="pn-snowcap" d={`M${w * 1.06} ${teide - 168} L${w * 1.1} ${teide - 176} L${w * 1.14} ${teide - 168} Q${w * 1.17} ${teide - 140} ${w * 1.2} ${teide - 118} L${w * 1.17} ${teide - 124} L${w * 1.14} ${teide - 112} L${w * 1.11} ${teide - 126} L${w * 1.07} ${teide - 110} L${w * 1.04} ${teide - 126} L${w * 1.0} ${teide - 116} Q${w * 1.03} ${teide - 140} ${w * 1.06} ${teide - 168} Z`} />
      <path d={`M${-w * 0.7} ${teide} Q${-w * 0.45} ${teide - 120} ${-w * 0.3} ${teide - 110} Q${-w * 0.15} ${teide - 100} ${w * 0.2} ${teide} Z`} fill="url(#pn-mount)" opacity="0.8" />
      <path d={`M-3000 ${ground - 20} L${-300} ${ground - 30} Q${-80} ${ground - 110} ${w * 0.2} ${ground - 40} Q${w * 0.4} ${ground - 70} ${w * 0.55} ${ground - 26} L${w + 3000} ${ground - 24} V${ground + 10} H-3000 Z`} fill="#223a68" />
      <g className="pn-village">
        {Array.from({ length: 22 }, (_, k) => (
          <rect key={k} x={-300 + rnd(k + 9) * (w + 600)} y={ground - 22 - rnd(k + 33) * 16} width={2.4} height={2.4} rx={0.6} style={{ animationDelay: `${(k % 5) * 0.7}s` }} />
        ))}
      </g>

      {/* Suelo nevado. */}
      <path d={`M-3000 ${ground - 6} L${-200} ${ground - 8} Q${w * 0.2} ${ground - 22} ${cx} ${ground - 12} T${w + 200} ${ground - 10} L${w + 3000} ${ground - 8} V3000 H-3000 Z`} fill="url(#pn-snow)" />

      {/* El pueblo a los lados (se ve cuando sobra ancho). */}
      <Fir x={-250} y={ground + 26} s={1.1} />
      <House x={-196} y={ground + 30} w={88} h={52} wall="#b8323a" roof="#5a1820" />
      <Fir x={-74} y={ground + 32} s={0.9} />
      <Fir x={-34} y={ground + 36} s={0.7} />
      <Snowman x={w + 34} y={ground + 40} />
      <House x={w + 74} y={ground + 32} w={96} h={56} wall="#2a6fb0" roof="#18345e" />
      <Fir x={w + 214} y={ground + 26} s={1.15} />

      {/* El abeto: luz cálida detrás, los pisos, el espumillón y la estrella de la punta (de donde salen las bolas). */}
      <ellipse cx={cx} cy={pegY(rows * 0.55)} rx={w * 0.62} ry={pegY(rows) * 0.62} fill="url(#pn-treeglow)" />
      <g className="pn-tree">
        {tiers.map((d, i) => (
          <path key={i} d={d} fill="url(#pn-tree)" />
        ))}
      </g>
      <g className="pn-tinsel">
        {swags.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <circle className="pn-star-glow" cx={cx} cy={top - s * 1.15} r={42} fill="url(#pn-glow)" />
      <path className="pn-topstar" d={starPath(cx, top - s * 1.15, 19, 8)} />

      {/* Nieve que cae. */}
      <g className="pn-snowfall">
        {Array.from({ length: 54 }, (_, k) => (
          <circle
            key={k}
            cx={-360 + rnd(k + 200) * (w + 720)}
            cy={-260}
            r={0.9 + rnd(k + 300) * 1.9}
            style={{
              animationDuration: `${7 + rnd(k + 400) * 9}s`,
              animationDelay: `${-rnd(k + 500) * 16}s`,
              '--drift': `${(rnd(k + 600) - 0.5) * 80}px`,
            }}
          />
        ))}
      </g>
    </g>
  )
}

// La bola de Navidad (dentro del grupo de la bola en vuelo).
export function Ornament({ r, color }) {
  return (
    <g className="pn pn-orn" aria-hidden="true">
      <circle r={r} fill={`url(#pn-orn-${color.id})`} />
      <ellipse rx={r * 0.98} ry={r * 0.26} fill="none" className="pn-orn__band" />
      <rect x={-r * 0.32} y={-r - 2.4} width={r * 0.64} height={3.4} rx={0.8} fill="url(#pn-cap)" />
      <circle cy={-r - 3.8} r={1.6} fill="none" stroke="#ffd36a" strokeWidth={1} />
    </g>
  )
}

// El lazo, la tapa y la cinta de un regalo (una casilla). cx es su centro, y la parte de arriba, s el ancho.
export function GiftWrap({ cx, y, s, h, tone }) {
  return (
    <g className="pn pn-gift" aria-hidden="true">
      <rect className="pn-gift__ribbon" x={cx - 2.6} y={y} width={5.2} height={h} />
      <rect className="pn-gift__lid" x={cx - s / 2 + 0.5} y={y - 2} width={s - 1} height={10} rx={3} fill={`url(#plinko-tone-${tone})`} />
      <rect className="pn-gift__ribbon" x={cx - 2.6} y={y - 2} width={5.2} height={10} />
      <g className="pn-gift__bow" transform={`translate(${cx} ${y - 2})`}>
        <path d="M0 0 C-9 -10 -14 -2 -10 2 C-7 4 -3 2 0 0 Z" />
        <path d="M0 0 C9 -10 14 -2 10 2 C7 4 3 2 0 0 Z" />
        <circle r={2.6} />
      </g>
    </g>
  )
}
