// Escena de la portada de la Season 5 · Navidad: noche de Navidad en Canarias. El Teide nevado bajo la estrella, un
// pueblo con las ventanas encendidas, pinos con nieve, el árbol del pueblo con sus luces, una palmera con bombillas y
// nieve cayendo. Todo SVG; las animaciones (clases ns5-*) están en season5.css y se paran con prefers-reduced-motion.

const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 263.7) % 1200,
  y: 8 + ((i * 97.3) % 190),
  r: 0.8 + ((i * 7) % 4) * 0.45,
  d: (i * 0.37) % 3,
}))

const FLAKES = Array.from({ length: 60 }, (_, i) => ({
  x: (i * 211.3) % 1200,
  r: 1.4 + ((i * 5) % 4) * 0.7,
  dur: 7 + ((i * 11) % 9),
  delay: -((i * 1.9) % 16),
  sway: ((i % 5) - 2) * 9,
}))

const BULBS = ['#ff4b55', '#ffd45c', '#5be08f', '#6cc3ff']

// Pino con nieve en las ramas. x, y: la base del tronco; s: escala.
function Pine({ x, y, s = 1, shade = '#0f3a2a' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-5" y="-14" width="10" height="16" fill="#2a1a12" />
      <path d="M0 -150 L-34 -92 L-20 -92 L-50 -48 L-32 -48 L-62 -10 L62 -10 L32 -48 L50 -48 L20 -92 L34 -92 Z" fill={shade} />
      <path
        d="M0 -150 L-20 -116 L-8 -120 L0 -112 L9 -121 L20 -116 Z M-22 -86 L-36 -66 L-20 -71 L-8 -64 L6 -72 L22 -66 L34 -70 L22 -86 Z M-40 -42 L-56 -18 L-36 -24 L-18 -16 L0 -25 L20 -17 L40 -24 L56 -18 L40 -42 Z"
        fill="#eef6ff"
        opacity="0.92"
      />
    </g>
  )
}

// Casita con el tejado nevado y la ventana encendida.
function House({ x, y, w = 70, h = 46, body = '#3a2730', roof = '#5b2230', door = true }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y={-h} width={w} height={h} fill={body} />
      <path d={`M-8 ${-h + 2} L${w / 2} ${-h - 32} L${w + 8} ${-h + 2} Z`} fill={roof} />
      <path d={`M-10 ${-h + 3} L${w / 2} ${-h - 34} L${w + 10} ${-h + 3} L${w + 2} ${-h + 4} L${w / 2} ${-h - 24} L-2 ${-h + 4} Z`} fill="#f4f9ff" />
      <rect className="ns5-window" x={w * 0.16} y={-h + 12} width="16" height="14" rx="2" fill="#ffcf6b" />
      <rect className="ns5-window ns5-window--late" x={w * 0.62} y={-h + 12} width="16" height="14" rx="2" fill="#ffb84a" />
      {door && <rect x={w / 2 - 8} y="-22" width="16" height="22" rx="7" fill="#1a0f14" />}
      <rect x={w * 0.68} y={-h - 26} width="9" height="16" fill={body} />
      <rect x={w * 0.68 - 2} y={-h - 30} width="13" height="5" fill="#f4f9ff" />
    </g>
  )
}

// El árbol del pueblo: grande, con guirnalda de luces, bolas y la estrella.
function BigTree({ x, y }) {
  const lights = []
  const rows = [
    [-118, 26],
    [-90, 40],
    [-60, 56],
    [-30, 72],
  ]
  rows.forEach(([dy, half], r) => {
    const n = 4 + r * 2
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      lights.push({ cx: -half + t * half * 2, cy: dy + Math.sin(t * Math.PI) * 9, c: BULBS[(i + r) % 4], k: lights.length })
    }
  })
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-9" y="-12" width="18" height="18" fill="#3a2418" />
      <path d="M0 -178 L-46 -110 L-28 -110 L-66 -64 L-44 -64 L-88 -10 L88 -10 L44 -64 L66 -64 L28 -110 L46 -110 Z" fill="#14533a" />
      <path d="M0 -178 L-46 -110 L-28 -110 L-66 -64 L-44 -64 L-88 -10 L0 -10 Z" fill="#0f4430" />
      {/* Bolas */}
      {[
        [-22, -130, '#e0303c'],
        [18, -100, '#ffd45c'],
        [-36, -76, '#6cc3ff'],
        [30, -54, '#e0303c'],
        [-12, -40, '#ffd45c'],
        [54, -24, '#6cc3ff'],
        [-58, -22, '#e0303c'],
      ].map(([cx, cy, c]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="6" fill={c} stroke="#fff6" strokeWidth="1.5" />
      ))}
      {/* Guirnalda de luces */}
      <g className="ns5-lights">
        {lights.map((l) => (
          <circle key={l.k} cx={l.cx} cy={l.cy} r="3.4" fill={l.c} style={{ animationDelay: `${(l.k % 6) * -0.4}s`, color: l.c }} />
        ))}
      </g>
      {/* Estrella */}
      <g className="ns5-treestar" transform="translate(0 -186)">
        <circle r="22" fill="url(#ns5-starglow)" />
        <path d="M0 -15 L4.4 -4.8 L15 -4.6 L6.8 2.2 L9.6 13 L0 6.8 L-9.6 13 L-6.8 2.2 L-15 -4.6 L-4.4 -4.8 Z" fill="#ffe27a" stroke="#fff3b8" strokeWidth="1.5" />
      </g>
    </g>
  )
}

// Palmera canaria con una ristra de bombillas enroscada al tronco.
function LitPalm({ x, y, s = 1 }) {
  const leaves = [-64, -32, -6, 20, 48, 78, 108]
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C 4 -60, 12 -120, 30 -176" fill="none" stroke="#1d1622" strokeWidth="12" strokeLinecap="round" />
      <g className="ns5-lights">
        {Array.from({ length: 11 }, (_, i) => {
          const t = i / 10
          const px = 2 + t * 26 + (i % 2 ? 6 : -6)
          const py = -10 - t * 160
          return <circle key={i} cx={px} cy={py} r="3.2" fill={BULBS[i % 4]} style={{ animationDelay: `${-i * 0.3}s`, color: BULBS[i % 4] }} />
        })}
      </g>
      <g transform="translate(30 -176)">
        {leaves.map((deg) => (
          <path
            key={deg}
            transform={`rotate(${deg})`}
            d="M0 0 C 30 -26, 72 -24, 104 6 C 76 -6, 60 -4, 46 4 C 58 -2, 34 -4, 0 0 Z"
            fill="#173b2c"
            stroke="#173b2c"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        ))}
        {/* Un poco de nieve en las hojas de arriba */}
        <path d="M-40 -30 C -20 -40, 10 -40, 34 -28 C 16 -34, -14 -34, -40 -30 Z" fill="#eef6ff" opacity="0.85" />
      </g>
    </g>
  )
}

export default function NavidadScene({ className = '' }) {
  return (
    <svg className={`ns5-scene ${className}`} viewBox="0 0 1200 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ns5-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060b1f" />
          <stop offset="0.45" stopColor="#0f1d44" />
          <stop offset="0.78" stopColor="#1b3566" />
          <stop offset="1" stopColor="#2c4f7e" />
        </linearGradient>
        <radialGradient id="ns5-starglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3b8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd45c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ns5-moonglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#dfeaff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#dfeaff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ns5-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3ddc97" stopOpacity="0" />
          <stop offset="0.35" stopColor="#3ddc97" stopOpacity="0.32" />
          <stop offset="0.7" stopColor="#5ab8ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#5ab8ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ns5-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f9ff" />
          <stop offset="1" stopColor="#b9cce6" />
        </linearGradient>
        <linearGradient id="ns5-teide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3d66" />
          <stop offset="1" stopColor="#16244a" />
        </linearGradient>
      </defs>

      <rect width="1200" height="440" fill="url(#ns5-sky)" />

      {/* Aurora suave detrás del Teide */}
      <path className="ns5-aurora" d="M80 150 C 300 70, 520 170, 760 90 C 900 50, 1040 110, 1180 70 L1180 130 C 1040 170, 900 110, 760 150 C 520 230, 300 130, 80 210 Z" fill="url(#ns5-aurora)" />

      <g className="ns5-stars">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" style={{ animationDelay: `${s.d}s` }} />
        ))}
      </g>

      {/* Luna */}
      <circle cx="170" cy="78" r="70" fill="url(#ns5-moonglow)" />
      <circle cx="170" cy="78" r="30" fill="#f2f6ff" />
      <circle cx="184" cy="70" r="27" fill="#0b1532" />

      {/* La estrella de Navidad */}
      <g className="ns5-bigstar" transform="translate(700 64)">
        <circle r="46" fill="url(#ns5-starglow)" />
        <path d="M0 -26 L3 -3 L26 0 L3 3 L0 26 L-3 3 L-26 0 L-3 -3 Z" fill="#fff6cf" />
        <path d="M0 -12 L2 -2 L12 0 L2 2 L0 12 L-2 2 L-12 0 L-2 -2 Z" fill="#ffffff" transform="rotate(45)" />
      </g>

      {/* El Teide nevado y las montañas */}
      <path d="M-20 300 L120 230 L230 262 L330 214 L420 250 L470 300 Z" fill="#1a2a52" />
      <path d="M380 320 L560 190 L610 150 L650 150 L700 192 L880 320 Z" fill="url(#ns5-teide)" />
      <path d="M560 190 L610 150 L650 150 L700 192 L676 186 L660 202 L640 184 L620 204 L600 186 L584 198 Z" fill="url(#ns5-snow)" />
      <path d="M820 320 L960 240 L1050 268 L1140 226 L1230 280 L1230 320 Z" fill="#1a2a52" />
      <path d="M1100 240 L1140 226 L1176 244 L1158 248 L1140 240 L1122 250 Z" fill="#dce8f8" opacity="0.8" />

      {/* Colinas nevadas */}
      <path d="M-20 350 C 160 300, 360 330, 560 316 C 760 302, 960 330, 1220 300 L1220 440 L-20 440 Z" fill="#c7d7ee" />
      <path d="M-20 380 C 200 350, 420 372, 640 360 C 860 348, 1020 372, 1220 352 L1220 440 L-20 440 Z" fill="url(#ns5-snow)" />

      {/* Pinos del fondo */}
      <Pine x={70} y={350} s={0.55} shade="#123d2e" />
      <Pine x={120} y={346} s={0.7} />
      <Pine x={470} y={330} s={0.5} shade="#123d2e" />
      <Pine x={1140} y={340} s={0.75} />
      <Pine x={1185} y={350} s={0.55} shade="#123d2e" />

      {/* El pueblo */}
      <House x={300} y={372} />
      <House x={390} y={366} w={56} h={40} body="#2f2433" roof="#1f4a38" door={false} />
      <House x={1000} y={366} w={64} h={44} body="#33262d" roof="#1f4a38" />

      <LitPalm x={230} y={378} s={0.92} />
      <BigTree x={880} y={372} />

      {/* Nieve cayendo */}
      <g className="ns5-snowfall">
        {FLAKES.map((f, i) => (
          <circle key={i} cx={f.x} cy="-10" r={f.r} fill="#ffffff" style={{ '--d': `${f.dur}s`, '--delay': `${f.delay}s`, '--sway': `${f.sway}px` }} />
        ))}
      </g>
    </svg>
  )
}
