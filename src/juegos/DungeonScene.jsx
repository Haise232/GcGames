// Decorado de cada sala del Laberinto (SVG a mano, viewBox 160 × 90): muro de sillares, suelo en perspectiva, atrezo
// propio de cada sala y motas flotando. Las puertas quedan por delante; los huecos entre ellas están en x ≈ 59 y 101.
const rad = (deg) => (deg * Math.PI) / 180

const MOTES = Array.from({ length: 12 }, (_, i) => ({
  x: 8 + ((i * 53) % 146),
  y: 22 + ((i * 29) % 56),
  r: 0.35 + (i % 3) * 0.2,
}))

// Telaraña desde una esquina (0, 0): hilos radiales y anillos combados.
function webPath(size) {
  const angles = [0, 22, 45, 68, 90]
  const pt = (r, a) => [Math.cos(rad(a)) * r, Math.sin(rad(a)) * r]
  let d = angles
    .map(
      (a) =>
        `M0 0 L${pt(size, a)
          .map((n) => n.toFixed(1))
          .join(' ')}`,
    )
    .join(' ')
  for (const k of [0.28, 0.5, 0.74, 1]) {
    const r = size * k
    angles.forEach((a, i) => {
      const [x, y] = pt(r, a)
      if (i === 0) d += ` M${x.toFixed(1)} ${y.toFixed(1)}`
      else {
        const [cx, cy] = pt(r * 0.86, (a + angles[i - 1]) / 2)
        d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
      }
    })
  }
  return d
}
const WEB = webPath(34)

function Banner({ x, h = 32, w = 5.4, gold }) {
  return (
    <g className="dg__banner-cloth" transform={`translate(${x} 4)`}>
      <rect x={-w / 2 - 1} y="-1" width={w + 2} height="2.2" rx="1" fill="#2a1a0c" />
      <path d={`M${-w / 2} 1 H${w / 2} V${h} L0 ${h - 5} L${-w / 2} ${h} Z`} fill={gold ? '#c8962a' : '#8a1e2a'} />
      <path
        d={`M${-w / 2} 1 H${w / 2} V${h} L0 ${h - 5} L${-w / 2} ${h} Z`}
        fill="none"
        stroke="#d9ae48"
        strokeWidth="0.5"
      />
      <path d={`M0 ${h * 0.3} l1.8 2.6 l-1.8 2.6 l-1.8 -2.6 Z`} fill="#e8c46a" />
      <path d={`M-1.4 ${h * 0.62} H1.4`} stroke="#e8c46a" strokeWidth="0.6" />
    </g>
  )
}

function Tomb({ x, y, s = 1, cross }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="1" rx="8" ry="1.8" fill="rgba(0,0,0,0.5)" />
      {cross ? (
        <path
          d="M-2 0 V-14 H-6 V-18 H-2 V-24 H2 V-18 H6 V-14 H2 V0 Z"
          fill="#6b6870"
          stroke="#1b1a1f"
          strokeWidth="0.6"
        />
      ) : (
        <>
          <path d="M-7 0 V-14 Q-7 -22 0 -22 Q7 -22 7 -14 V0 Z" fill="#6b6870" stroke="#1b1a1f" strokeWidth="0.6" />
          <path d="M-3.4 -14 H3.4 M-3.4 -10.6 H3.4 M0 -17.6 V-8" stroke="#2c2a30" strokeWidth="0.8" />
        </>
      )}
      <path d="M-5 -2 q3 -4 6 -1" fill="none" stroke="#3f6b36" strokeWidth="0.7" />
    </g>
  )
}

function Candle({ x, y, i = 0 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="-1" rx="6" ry="6" className="dg__candle-glow" />
      <rect x="-1" y="0" width="2" height="5" fill="#efe6c6" />
      <path d="M0 -4 Q2 -1.4 0 0 Q-2 -1.4 0 -4 Z" className="dg__flame" style={{ '--i': i }} />
    </g>
  )
}

function Mound({ x, w, h, flip }) {
  const dir = flip ? -1 : 1
  const coins = [
    [0.3, 0.62],
    [0.52, 0.42],
    [0.7, 0.72],
    [0.18, 0.86],
    [0.44, 0.84],
    [0.84, 0.9],
  ]
  return (
    <g transform={`translate(${x} 90) scale(${dir} 1)`}>
      <path
        d={`M0 0 Q${w * 0.16} ${-h * 0.9} ${w * 0.55} ${-h} Q${w * 0.9} ${-h * 0.7} ${w} 0 Z`}
        fill="url(#dg-s-gold)"
        stroke="#6b4a10"
        strokeWidth="0.5"
      />
      {coins.map(([a, b], i) => (
        <ellipse key={i} cx={w * a} cy={-h * b} rx="2.2" ry="0.9" fill="#ffe27a" stroke="#9a6d12" strokeWidth="0.3" />
      ))}
    </g>
  )
}

// Un atrezo por sala. Todo estático salvo lo que lleva clase con animación.
function Props({ room, treasure }) {
  if (treasure)
    return (
      <>
        {[22, 138].map((x) => (
          <g key={x}>
            <rect x={x - 5} y="8" width="10" height="56" fill="url(#dg-s-col)" />
            <rect x={x - 7} y="6" width="14" height="4" fill="#c8a24b" />
            <rect x={x - 7} y="60" width="14" height="4" fill="#c8a24b" />
          </g>
        ))}
        <Mound x={0} w={36} h={22} />
        <Mound x={160} w={36} h={22} flip />
      </>
    )
  if (room === 0)
    return (
      <>
        <Banner x={20} h={36} />
        <Banner x={140} h={36} />
        <path d="M60 90 L100 90 L88 64 L72 64 Z" fill="#6b1a24" opacity="0.8" />
        <path d="M60 90 L100 90 L98.6 87 L61.4 87 Z" fill="#d9ae48" opacity="0.5" />
        <g transform="translate(146 82)">
          <path d="M-6 0 V-13 Q0 -16 6 -13 V0 Z" fill="#6a3e1e" stroke="#24120a" strokeWidth="0.6" />
          <path d="M-6 -9 H6 M-6 -4 H6" stroke="#2b2b30" strokeWidth="1.2" />
        </g>
        <g transform="translate(14 83)">
          <path d="M-7 0 V-9 H7 V0 Z" fill="#7a4a24" stroke="#24120a" strokeWidth="0.6" />
          <path d="M-7 -4.5 H7 M0 -9 V0" stroke="#24120a" strokeWidth="0.6" />
        </g>
      </>
    )
  if (room === 1)
    return (
      <>
        <Tomb x={14} y={86} s={1.15} />
        <Tomb x={27} y={82} s={0.8} cross />
        <Tomb x={134} y={82} s={0.8} />
        <Tomb x={148} y={86} s={1.15} cross />
        <Candle x={22} y={80} i={0} />
        <Candle x={141} y={79} i={1} />
        {[59, 101].map((x) => (
          <g key={x}>
            <path d={`M${x} 0 V30`} stroke="#8a857a" strokeWidth="1.1" strokeDasharray="1.6 0.9" />
            <circle cx={x} cy="32" r="2.4" fill="#e6dfcf" />
            <path d={`M${x - 1} 33 v2 M${x + 1} 33 v2`} stroke="#0b0708" strokeWidth="0.6" />
          </g>
        ))}
        <ellipse cx="50" cy="84" rx="40" ry="4" className="dg__mist" />
        <ellipse cx="116" cy="86" rx="40" ry="4" className="dg__mist" style={{ '--i': 1 }} />
      </>
    )
  if (room === 2)
    return (
      <>
        {[59, 101, 18, 142].map((x) => (
          <g key={x}>
            <rect x={x - 3.4} y="10" width="6.8" height="52" fill="url(#dg-s-col)" />
            <rect x={x - 5} y="8" width="10" height="3.4" rx="0.8" fill="#8a857a" />
            <rect x={x - 5} y="59" width="10" height="3.4" rx="0.8" fill="#8a857a" />
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <ellipse key={i} cx="80" cy="30" rx="30" ry="14" className="dg__echo-ring" style={{ '--i': i }} />
        ))}
      </>
    )
  if (room === 3)
    return (
      <>
        <g transform="translate(14 84)">
          {[
            [-6, 0, 12, '#7a2a2a'],
            [-5, -3.4, 10, '#2a4a7a'],
            [-6.5, -6.8, 12, '#3a6a3a'],
          ].map(([x, y, w, c]) => (
            <rect key={y} x={x} y={y - 3.4} width={w} height="3.4" fill={c} stroke="#14100a" strokeWidth="0.4" />
          ))}
        </g>
        <g transform="translate(148 84)">
          {[
            [-6, 0, 12, '#5a2a6a'],
            [-5, -3.4, 10, '#7a5a2a'],
          ].map(([x, y, w, c]) => (
            <rect key={y} x={x} y={y - 3.4} width={w} height="3.4" fill={c} stroke="#14100a" strokeWidth="0.4" />
          ))}
        </g>
        <Candle x={59} y={44} i={0} />
        <Candle x={101} y={40} i={1} />
        <Candle x={80} y={22} i={2} />
        <g className="dg__book" transform="translate(30 26)">
          <path
            d="M-7 0 Q-3.5 -2 0 0 Q3.5 -2 7 0 V6 Q3.5 4 0 6 Q-3.5 4 -7 6 Z"
            fill="#cdbf94"
            stroke="#3a2a10"
            strokeWidth="0.6"
          />
          <ellipse cx="0" cy="-3" rx="7" ry="4" className="dg__book-glow" />
        </g>
      </>
    )
  if (room === 4)
    return (
      <>
        <path d={WEB} className="dg__web" />
        <path d={WEB} className="dg__web" transform="translate(160 0) scale(-1 1)" />
        {[
          [59, 20],
          [101, 30],
        ].map(([x, y], i) => (
          <g key={x} className="dg__dangle" style={{ '--i': i }}>
            <path d={`M${x} 0 V${y}`} stroke="rgba(255,255,255,0.65)" strokeWidth="0.4" />
            <ellipse cx={x} cy={y + 2.4} rx="2.2" ry="2.6" fill="#1b1224" stroke="#6b4a8a" strokeWidth="0.4" />
            <circle cx={x} cy={y - 0.2} r="1.4" fill="#1b1224" />
            <path
              d={`M${x - 1.6} ${y + 1} l-3.4 -2 l-1 3 M${x + 1.6} ${y + 1} l3.4 -2 l1 3 M${x - 2} ${y + 3} l-3.6 1 l-1.4 3 M${x + 2} ${y + 3} l3.6 1 l1.4 3`}
              fill="none"
              stroke="#1b1224"
              strokeWidth="0.7"
            />
            <circle cx={x - 0.6} cy={y - 0.4} r="0.35" fill="#ff3b2f" />
            <circle cx={x + 0.6} cy={y - 0.4} r="0.35" fill="#ff3b2f" />
          </g>
        ))}
        {[
          [14, 82],
          [148, 84],
        ].map(([x, y]) => (
          <g key={x}>
            <ellipse cx={x} cy={y - 5} rx="3.6" ry="7" fill="#e8e2d0" stroke="#7a7466" strokeWidth="0.5" />
            <path
              d={`M${x - 3} ${y - 7} L${x + 3} ${y - 3} M${x - 3} ${y - 3} L${x + 3} ${y - 7}`}
              stroke="#b8b09a"
              strokeWidth="0.4"
            />
          </g>
        ))}
      </>
    )
  return (
    <>
      <path d="M0 0 L5 12 L10 0 M24 0 L28 9 L32 0 M130 0 L134 10 L139 0 M150 0 L155 13 L160 0" fill="#120a0c" />
      <Mound x={0} w={34} h={26} />
      <Mound x={160} w={34} h={26} flip />
      <path d="M80 64 L76 70 L82 77 L73 90 M80 70 L90 76 L88 90 M76 70 L66 74 L64 90" className="dg__lava-glow" />
      <path d="M80 64 L76 70 L82 77 L73 90 M80 70 L90 76 L88 90 M76 70 L66 74 L64 90" className="dg__lava" />
      <g transform="translate(26 86)">
        <ellipse cx="0" cy="-4" rx="6" ry="5.4" fill="#e6dfcf" stroke="#3a3322" strokeWidth="0.5" />
        <circle cx="-2.2" cy="-4.6" r="1.4" fill="#0b0708" />
        <circle cx="2.2" cy="-4.6" r="1.4" fill="#0b0708" />
        <path d="M-9 1 l8 -1 M3 1 l9 -2" stroke="#e6dfcf" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      <g transform="translate(136 87)">
        <path d="M-9 0 Q-7 -9 0 -10 Q7 -9 9 0" fill="none" stroke="#e6dfcf" strokeWidth="1.3" />
        <path d="M-5 0 Q-4 -7 0 -8 Q4 -7 5 0" fill="none" stroke="#e6dfcf" strokeWidth="1.3" />
      </g>
    </>
  )
}

export default function HallScene({ room, treasure }) {
  const motes = treasure ? 'gold' : room === 5 ? 'ember' : room === 3 ? 'spore' : 'dust'
  return (
    <svg
      className={`dg__scene is-${motes}`}
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="dg-s-bricks" width="32" height="16" patternUnits="userSpaceOnUse">
          <rect width="32" height="16" fill="#3a373e" />
          <rect x="0.4" y="0.4" width="15.2" height="7.2" fill="#444148" />
          <rect x="16.4" y="0.4" width="15.2" height="7.2" fill="#35323a" />
          <rect x="8.4" y="8.4" width="15.2" height="7.2" fill="#3c3941" />
          <rect x="24.4" y="8.4" width="7.2" height="7.2" fill="#46434b" />
          <rect x="0.4" y="8.4" width="7.2" height="7.2" fill="#35323a" />
          <path d="M0 0.2 H32 M0 8.2 H32 M0 0 V8 M16 0 V8 M8 8 V16 M24 8 V16" className="dg__mortar" />
        </pattern>
        <pattern id="dg-s-arches" width="32" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M4 40 V22 A12 12 0 0 1 28 22 V40 Z"
            fill="rgba(0,0,0,0.38)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.6"
          />
        </pattern>
        <pattern id="dg-s-shelf" width="24" height="18" patternUnits="userSpaceOnUse">
          <rect width="24" height="18" fill="#23160d" />
          {[
            [1, 3, '#7a2a2a'],
            [4.4, 4, '#2a4a7a'],
            [8.6, 2.6, '#d9ae48'],
            [11.6, 3.6, '#3a6a3a'],
            [15.6, 2.4, '#5a2a6a'],
            [18.4, 4, '#8a5a2a'],
            [22.6, 1.2, '#7a2a2a'],
          ].map(([x, w, c], i) => (
            <rect
              key={x}
              x={x}
              y={3 + (i % 3) * 0.9}
              width={w}
              height={12 - (i % 3) * 0.9}
              fill={c}
              stroke="#0e0804"
              strokeWidth="0.3"
            />
          ))}
          <rect y="15" width="24" height="3" fill="#5a3418" />
          <rect y="15" width="24" height="0.7" fill="#8a5a2c" />
        </pattern>
        <linearGradient id="dg-s-shade" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="dg-s-floor" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e2b33" />
          <stop offset="1" stopColor="#121014" />
        </linearGradient>
        <linearGradient id="dg-s-col" x1="0" x2="1">
          <stop offset="0" stopColor="#3a373e" />
          <stop offset="0.4" stopColor="#7a757f" />
          <stop offset="1" stopColor="#2a272d" />
        </linearGradient>
        <radialGradient id="dg-s-gold" cx="0.5" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.5" stopColor="#d9a52c" />
          <stop offset="1" stopColor="#7a4e0c" />
        </radialGradient>
        <radialGradient id="dg-s-cglow">
          <stop offset="0" stopColor="#ffc060" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffc060" stopOpacity="0" />
        </radialGradient>
        <clipPath id="dg-s-floorclip">
          <rect y="64" width="160" height="26" />
        </clipPath>
      </defs>
      <rect width="160" height="90" fill="url(#dg-s-bricks)" />
      {room === 2 && !treasure && <rect y="12" width="160" height="52" fill="url(#dg-s-arches)" />}
      {room === 3 && !treasure && <rect y="8" width="160" height="56" fill="url(#dg-s-shelf)" />}
      <rect width="160" height="90" className="dg__tint" />
      <rect width="160" height="64" fill="url(#dg-s-shade)" />
      <rect y="62" width="160" height="2.4" fill="#17151a" />
      <rect y="62" width="160" height="0.6" fill="rgba(255,255,255,0.18)" />
      {/* Suelo en perspectiva */}
      <rect y="64" width="160" height="26" fill="url(#dg-s-floor)" />
      <g clipPath="url(#dg-s-floorclip)" className="dg__floor-lines">
        {[-80, -40, 0, 40, 80, 120, 160, 200, 240].map((x) => (
          <path key={x} d={`M80 50 L${x} 90`} />
        ))}
        {[66.4, 70.4, 76, 84].map((y) => (
          <path key={y} d={`M0 ${y} H160`} />
        ))}
      </g>
      <Props room={room} treasure={treasure} />
      <rect width="160" height="90" fill="url(#dg-s-shade)" opacity="0.4" />
      {MOTES.map((m, i) => (
        <circle key={i} cx={m.x} cy={m.y} r={m.r} className="dg__mote" style={{ '--i': i }} />
      ))}
    </svg>
  )
}
