// Ilustraciones del selector de juegos: una mini escena en SVG por juego. Los colores y las animaciones (clases hs-*)
// están en scenes.css. Las cuatro de la Season 3 son más grandes (240×160) y las demás, de 160×90, para sus tarjetas.

import './scenes.css'

const rad = (deg) => (deg * Math.PI) / 180

// Cuña de una ruleta o un reloj: del ángulo a al b (en grados, 0 = arriba), radio r, centrada en (cx, cy).
function wedge(cx, cy, r, a, b) {
  const p = (deg) => `${(cx + r * Math.sin(rad(deg))).toFixed(2)} ${(cy - r * Math.cos(rad(deg))).toFixed(2)}`
  return `M${cx} ${cy} L${p(a)} A${r} ${r} 0 0 1 ${p(b)} Z`
}

// Destello de cuatro puntas centrado en (x, y).
const spark = (x, y, s) => `M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`

// ---------- Season 3 ----------

export function TowerScene() {
  const rows = [0, 1, 2, 3, 4]
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-tw-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4f0ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#5aa6e8" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="hs-tw-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1b2150" />
          <stop offset="0.5" stopColor="#2b3478" />
          <stop offset="1" stopColor="#171c45" />
        </linearGradient>
        <radialGradient id="hs-tw-gold" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="hs-stars">
        {[
          [20, 24, 1.6],
          [44, 60, 1.1],
          [30, 108, 1.3],
          [206, 30, 1.5],
          [220, 76, 1.1],
          [196, 118, 1.4],
          [58, 14, 1],
          [180, 12, 1.1],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} style={{ '--d': `${i * 0.37}s` }} />
        ))}
      </g>
      <circle cx="198" cy="40" r="13" fill="#fff4d0" opacity="0.92" />
      <circle cx="203" cy="36" r="11" fill="#1a1f52" opacity="0.55" />
      {/* El cuerpo de la torre, con almenas arriba. */}
      <path d="M76 160 L83 30 H157 L164 160 Z" fill="url(#hs-tw-stone)" stroke="#6e7bd0" strokeOpacity="0.45" />
      {[83, 99, 115, 131, 147].map((x) => (
        <rect key={x} x={x - 1} y="22" width="12" height="9" rx="1.5" fill="#2b3478" stroke="#6e7bd0" strokeOpacity="0.45" />
      ))}
      <circle cx="120" cy="20" r="26" fill="url(#hs-tw-gold)" className="hs-halo" />
      {rows.map((r) =>
        [0, 1, 2].map((c) => {
          const x = 91 + c * 21
          const y = 132 - r * 22
          const bad = r === 1 && c === 0
          const gold = r === 4 && c === 1
          return (
            <g key={`${r}-${c}`} className={bad ? 'hs-tw-bad' : gold ? 'hs-tw-prize' : undefined}>
              <rect x={x} y={y} width="17" height="14" rx="3" fill={bad ? '#c2332c' : gold ? '#ffd25e' : 'url(#hs-tw-glass)'} stroke="#fff" strokeOpacity={bad ? 0.2 : 0.55} />
              {bad && <path d={`M${x + 4} ${y} L${x + 8} ${y + 6} L${x + 5} ${y + 9} L${x + 11} ${y + 14}`} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.2" />}
              {!bad && !gold && <path d={`M${x + 3} ${y + 3} H${x + 9}`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />}
            </g>
          )
        }),
      )}
      {[
        ['×2', 110],
        ['×5', 66],
        ['×20', 22],
      ].map(([t, y]) => (
        <text key={t} x="172" y={y} className="hs-tw-mult">
          {t}
        </text>
      ))}
      {/* El jugador, que sube un piso al pasar el ratón. */}
      <g className="hs-tw-hero">
        <ellipse cx="120" cy="105" rx="6" ry="2" fill="#000" opacity="0.3" />
        <circle cx="120" cy="96" r="6.5" fill="#ffd25e" stroke="#fff4c0" strokeWidth="1.5" />
        <circle cx="118" cy="94.5" r="1.3" fill="#2a1a00" />
        <circle cx="122.5" cy="94.5" r="1.3" fill="#2a1a00" />
      </g>
    </svg>
  )
}

export function HeistScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-hs-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c3ccd8" />
          <stop offset="0.5" stopColor="#7d8899" />
          <stop offset="1" stopColor="#3b4352" />
        </linearGradient>
        <radialGradient id="hs-hs-face" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#aab4c2" />
          <stop offset="1" stopColor="#4a5362" />
        </radialGradient>
        <linearGradient id="hs-hs-leak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd25e" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Rayos láser que cruzan la sala. */}
      <g className="hs-lasers">
        {[
          [0, 30, 240, 12],
          [0, 128, 240, 150],
          [0, 78, 240, 96],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} style={{ '--d': `${i * 0.6}s` }} />
        ))}
      </g>
      <path d="M170 24 L238 6 V154 L170 140 Z" fill="url(#hs-hs-leak)" opacity="0.5" className="hs-hs-leak" />
      <g transform="translate(120 82)">
        <circle r="66" fill="#10131c" opacity="0.5" />
        <circle r="62" fill="url(#hs-hs-steel)" stroke="#1d2230" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={52 * Math.sin(rad(i * 30))} cy={-52 * Math.cos(rad(i * 30))} r="2.8" fill="#dbe2ec" stroke="#2b3342" strokeWidth="0.8" />
        ))}
        <circle r="44" fill="#262c3a" />
        <circle r="40" fill="url(#hs-hs-face)" />
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1={36 * Math.sin(rad(i * 15))} y1={-36 * Math.cos(rad(i * 15))} x2={(i % 2 ? 33 : 31) * Math.sin(rad(i * 15))} y2={(i % 2 ? -33 : -31) * Math.cos(rad(i * 15))} stroke="#1d2230" strokeOpacity="0.6" />
        ))}
        <g className="hs-hs-wheel">
          <circle r="22" fill="#2b3342" stroke="#ffd25e" strokeWidth="4" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <line y1="-8" y2="-31" stroke="#ffd25e" strokeWidth="4.5" strokeLinecap="round" />
              <circle cy="-33" r="3.6" fill="#ffe9a0" stroke="#8a5d0a" strokeWidth="0.8" />
            </g>
          ))}
          <circle r="8" fill="#ffd25e" stroke="#8a5d0a" strokeWidth="1.2" />
          <circle r="2.6" fill="#8a5d0a" />
        </g>
      </g>
      {/* Lingotes en el suelo. */}
      {[
        [10, 136],
        [28, 140],
        [200, 140],
        [214, 134],
      ].map(([x, y], i) => (
        <g key={i} className="hs-hs-bar">
          <path d={`M${x} ${y + 12} L${x + 3} ${y} H${x + 19} L${x + 22} ${y + 12} Z`} fill="#ffd25e" stroke="#8a5d0a" strokeWidth="0.9" />
          <path d={`M${x + 5} ${y + 3} H${x + 17}`} stroke="#fff4c0" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}

export function AuctionScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-au-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4d0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff4d0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hs-au-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a5bff" />
          <stop offset="1" stopColor="#4a1d96" />
        </linearGradient>
        <radialGradient id="hs-au-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M120 0 L58 150 H182 Z" fill="url(#hs-au-beam)" className="hs-au-beam" />
      <ellipse cx="120" cy="142" rx="76" ry="11" fill="#1a0f33" />
      <ellipse cx="120" cy="140" rx="76" ry="11" fill="none" stroke="#ffd25e" strokeOpacity="0.7" strokeWidth="2" />
      <ellipse cx="120" cy="104" rx="52" ry="40" fill="url(#hs-au-glow)" className="hs-au-glow" />
      <g className="hs-au-box">
        <rect x="82" y="88" width="76" height="50" rx="5" fill="url(#hs-au-box)" stroke="#d2b3ff" strokeOpacity="0.5" />
        <rect x="114" y="88" width="12" height="50" fill="#ffd25e" />
        <text x="120" y="124" textAnchor="middle" className="hs-au-q">
          ?
        </text>
        <g className="hs-au-lid">
          <rect x="77" y="70" width="86" height="19" rx="5" fill="#b184ff" stroke="#e6d4ff" strokeOpacity="0.6" />
          <rect x="114" y="70" width="12" height="19" fill="#ffd25e" />
          <ellipse cx="108" cy="66" rx="11" ry="6.5" fill="#ffd25e" stroke="#8a5d0a" strokeWidth="0.9" transform="rotate(-18 108 66)" />
          <ellipse cx="132" cy="66" rx="11" ry="6.5" fill="#ffd25e" stroke="#8a5d0a" strokeWidth="0.9" transform="rotate(18 132 66)" />
          <circle cx="120" cy="68" r="4.2" fill="#ffe9a0" stroke="#8a5d0a" strokeWidth="0.9" />
        </g>
      </g>
      {[
        [58, 52, 6],
        [188, 60, 7],
        [44, 108, 4.5],
        [200, 112, 5],
        [150, 30, 4],
        [84, 34, 4],
      ].map(([x, y, s], i) => (
        <path key={i} d={spark(x, y, s)} className="hs-au-spark" style={{ '--d': `${i * 0.45}s` }} />
      ))}
      {[
        [96, 'A'],
        [144, 'B'],
      ].map(([x, k]) => (
        <g key={k} className={`hs-au-coin hs-au-coin--${k}`}>
          <circle cx={x} cy="84" r="7" fill="#ffd25e" stroke="#8a5d0a" strokeWidth="1" />
          <text x={x} y="88" textAnchor="middle" className="hs-au-eur">
            €
          </text>
        </g>
      ))}
    </svg>
  )
}

export function BridgeScene() {
  const rows = [0, 1, 2, 3, 4]
  // Perspectiva: las filas lejanas son más pequeñas y suben. Cada fila tiene un cristal que aguanta y otro que no.
  const bad = { 1: 1, 2: 0, 3: 1 }
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-br-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4f6ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#6fb4f0" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="hs-br-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8d6cff" stopOpacity="0" />
          <stop offset="1" stopColor="#b79bff" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="hs-br-goal" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="108" width="240" height="52" fill="url(#hs-br-mist)" />
      <ellipse cx="60" cy="150" rx="70" ry="12" fill="#b79bff" opacity="0.25" className="hs-br-mist" />
      <ellipse cx="190" cy="154" rx="60" ry="10" fill="#b79bff" opacity="0.2" className="hs-br-mist" />
      {/* Meta al fondo. */}
      <circle cx="120" cy="22" r="26" fill="url(#hs-br-goal)" className="hs-halo" />
      <path d="M96 40 V24 A24 24 0 0 1 144 24 V40 Z" fill="#241a5c" stroke="#ffd25e" strokeOpacity="0.8" strokeWidth="1.6" />
      <path d="M106 40 V26 A14 14 0 0 1 134 26 V40 Z" fill="#ffe9a0" opacity="0.9" />
      {/* Cables a los lados. */}
      <path d="M30 150 L98 40 M210 150 L142 40" stroke="#c9b8ff" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
      {rows
        .slice()
        .reverse()
        .map((i) => {
          const w = 46 - i * 6
          const h = 20 - i * 2.4
          const gap = 7 - i * 0.9
          const y = 134 - i * 21
          return [0, 1].map((side) => {
            const x = side === 0 ? 120 - gap / 2 - w : 120 + gap / 2
            const isBad = bad[i] === side
            return (
              <g key={`${i}-${side}`} className={isBad ? `hs-br-bad hs-br-bad--${i}` : undefined}>
                <rect x={x} y={y} width={w} height={h} rx="3" fill={isBad ? '#d4504a' : 'url(#hs-br-glass)'} fillOpacity={isBad ? 0.75 : 1} stroke="#fff" strokeOpacity={isBad ? 0.25 : 0.6} />
                {isBad ? (
                  <path d={`M${x + w * 0.2} ${y} L${x + w * 0.45} ${y + h * 0.45} L${x + w * 0.3} ${y + h * 0.65} L${x + w * 0.6} ${y + h}`} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.2" />
                ) : (
                  <path d={`M${x + w * 0.14} ${y + h * 0.25} H${x + w * 0.5}`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
                )}
              </g>
            )
          })
        })}
      <g className="hs-br-hero">
        <ellipse cx="86" cy="135" rx="7" ry="2.2" fill="#000" opacity="0.3" />
        <circle cx="86" cy="124" r="7" fill="#ffd25e" stroke="#fff4c0" strokeWidth="1.5" />
        <circle cx="84" cy="122.5" r="1.4" fill="#2a1a00" />
        <circle cx="88.5" cy="122.5" r="1.4" fill="#2a1a00" />
      </g>
    </svg>
  )
}

// ---------- Para jugar solo ----------

// Ascensor: el hueco con los cables, la cabina subiendo con luz dentro y el indicador de planta encima.
export function ElevatorScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-el-car" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#d89a2e" />
        </linearGradient>
      </defs>
      {/* plantas que pasan detrás */}
      <g className="hs-el-floors">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} transform={`translate(0 ${i * 22 - 22})`}>
            <rect x="52" y="0" width="56" height="2" fill="#2c4766" />
            <text x="114" y="12" fontSize="8" fill="#5f86ad" fontFamily="var(--display)">{6 - i}</text>
          </g>
        ))}
      </g>
      <rect x="54" y="0" width="52" height="90" fill="none" stroke="#3b5f86" strokeWidth="1.5" />
      <g className="hs-el-car">
        <line x1="74" y1="-60" x2="74" y2="30" stroke="#9fb3c8" strokeWidth="1.2" />
        <line x1="86" y1="-60" x2="86" y2="30" stroke="#9fb3c8" strokeWidth="1.2" />
        <rect x="62" y="30" width="36" height="42" rx="3" fill="#1b2b40" stroke="url(#hs-el-car)" strokeWidth="2.5" />
        <rect x="66" y="35" width="13" height="33" fill="#ffd25e" opacity="0.25" />
        <rect x="81" y="35" width="13" height="33" fill="#ffd25e" opacity="0.25" />
        <circle cx="73" cy="52" r="4" fill="#f1e9d6" />
        <circle cx="87" cy="50" r="4" fill="#f1e9d6" />
      </g>
      <rect x="64" y="4" width="32" height="13" rx="3" fill="#120a04" stroke="#ffd25e" strokeWidth="1" />
      <text x="80" y="14" textAnchor="middle" fontSize="9" fill="#ffd25e" fontFamily="var(--display)" className="hs-el-mult">×3,4</text>
      <path d={spark(28, 24, 6)} fill="#ffe9a8" className="hs-twinkle" />
      <path d={spark(136, 64, 5)} fill="#ffe9a8" className="hs-twinkle" style={{ '--d': '1.2s' }} />
    </svg>
  )
}

export function RouletteScene() {
  const cx = 80
  const cy = 46
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="hs-ro-hub" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe9a0" />
          <stop offset="1" stopColor="#a8761a" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="41" fill="#2a1608" stroke="#ffd25e" strokeWidth="2.5" />
      <g className="hs-wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={wedge(cx, cy, 35, i * 30, (i + 1) * 30)} fill={i === 0 ? '#1e8a5a' : i % 2 ? '#16161b' : '#c2332c'} stroke="#ffd25e" strokeOpacity="0.5" strokeWidth="0.6" />
        ))}
        <circle cx={cx} cy={cy} r="19" fill="#3a2410" stroke="#ffd25e" strokeWidth="1.6" />
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1={cx} y1={cy} x2={cx + 17 * Math.sin(rad(a))} y2={cy - 17 * Math.cos(rad(a))} stroke="#ffd25e" strokeWidth="2" strokeLinecap="round" />
        ))}
        <circle cx={cx} cy={cy} r="6" fill="url(#hs-ro-hub)" />
      </g>
      <g className="hs-ball" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy - 28} r="2.8" fill="#fff" />
      </g>
      {/* Fichas a los lados. */}
      {[
        [20, 70, '#c2332c'],
        [140, 72, '#2f6fd0'],
      ].map(([x, y, c], i) => (
        <g key={i} className="hs-chip">
          <ellipse cx={x} cy={y + 4} rx="11" ry="4.5" fill={c} stroke="#fff" strokeOpacity="0.7" strokeDasharray="3 3" />
          <ellipse cx={x} cy={y} rx="11" ry="4.5" fill={c} stroke="#fff" strokeOpacity="0.85" strokeDasharray="3 3" />
        </g>
      ))}
    </svg>
  )
}

export function CrashScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-cr-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5faaff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#bfe0ff" />
        </linearGradient>
        <linearGradient id="hs-cr-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5faaff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#5faaff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hs-cr-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c0" />
          <stop offset="1" stopColor="#ff7a3c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="hs-stars">
        {[
          [16, 14, 1.2],
          [44, 36, 1],
          [100, 10, 1.1],
          [150, 50, 1.2],
          [60, 8, 0.9],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} style={{ '--d': `${i * 0.4}s` }} />
        ))}
      </g>
      <path d="M8 84 C48 82 92 66 128 22 V90 H8 Z" fill="url(#hs-cr-area)" />
      <path d="M8 84 C48 82 92 66 128 22" fill="none" stroke="url(#hs-cr-line)" strokeWidth="2.6" strokeLinecap="round" />
      <text x="14" y="52" className="hs-cr-mult">
        ×3,42
      </text>
      <g className="hs-rocket" transform="translate(128 22) rotate(38)">
        <path className="hs-flame" d="M-4 11 Q0 30 4 11 Z" fill="url(#hs-cr-flame)" />
        <path d="M-9 8 L-15 17 L-4 12 Z M9 8 L15 17 L4 12 Z" fill="#c2332c" />
        <path d="M0 -20 C9 -11 9 4 6 12 H-6 C-9 4 -9 -11 0 -20 Z" fill="#f1e9d6" stroke="#9db6c4" strokeWidth="0.8" />
        <path d="M0 -20 C5 -15 7 -11 7.5 -8 H-7.5 C-7 -11 -5 -15 0 -20 Z" fill="#e2463c" />
        <circle cy="-2" r="4" fill="#5faaff" stroke="#3a4e66" strokeWidth="1.2" />
      </g>
    </svg>
  )
}

function Car({ x, y, body, className }) {
  return (
    <g transform={`translate(${x} ${y})`} className={className}>
      <g transform="scale(1.05)">
        <path d="M5 26 L7 20 Q8 18.5 10 18.5 H15 L19 13.5 Q20 12.5 22 12.5 H27 Q28.5 12.5 29.5 14 L31.5 18.5 Q35 19 35.5 22 V26 Z" fill={body} stroke="#000" strokeOpacity="0.25" />
        <path d="M17 18 L20.5 14.5 H26 L28.5 18 Z" fill="#d4e6ff" />
        <circle cx="12" cy="26.5" r="4.2" fill="#16161b" />
        <circle cx="29" cy="26.5" r="4.2" fill="#16161b" />
        <circle cx="12" cy="26.5" r="1.5" fill="#c8a24b" />
        <circle cx="29" cy="26.5" r="1.5" fill="#c8a24b" />
      </g>
    </g>
  )
}

export function RaceScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="40" width="160" height="50" fill="#3a444c" />
      <g className="hs-kerb">
        {Array.from({ length: 18 }, (_, i) => (
          <rect key={i} x={i * 10} y="38" width="10" height="4" fill={i % 2 ? '#f1e9d6' : '#c2332c'} />
        ))}
      </g>
      <path d="M0 65 H160" stroke="#f1e9d6" strokeWidth="1.4" strokeDasharray="8 6" className="hs-dash" />
      <g className="hs-speed">
        {[
          [6, 50, 26],
          [30, 58, 20],
          [10, 77, 24],
          [46, 84, 18],
        ].map(([x, y, w], i) => (
          <line key={i} x1={x} y1={y} x2={x + w} y2={y} />
        ))}
      </g>
      <Car x="60" y="26" body="#2f6fd0" className="hs-car hs-car--b" />
      <Car x="36" y="46" body="#e2463c" className="hs-car hs-car--a" />
      {/* Bandera a cuadros. */}
      <g transform="translate(138 8)">
        <line y1="0" y2="28" stroke="#f1e9d6" strokeWidth="1.6" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={(i % 4) * 4 + 1} y={Math.floor(i / 4) * 4} width="4" height="4" fill={(i + Math.floor(i / 4)) % 2 ? '#f1e9d6' : '#16161b'} />
        ))}
      </g>
    </svg>
  )
}

export function DungeonScene() {
  const door = (c, k) => <path key={k} d={`M${c - 14} 76 V38 a14 14 0 0 1 28 0 V76 Z`} />
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-dg-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c0" />
          <stop offset="1" stopColor="#f2b53c" />
        </linearGradient>
        <linearGradient id="hs-dg-rays" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffe9a0" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Ladrillos del muro. */}
      <g stroke="#000" strokeOpacity="0.18" fill="none">
        {[14, 28, 42, 56, 70].map((y) => (
          <path key={y} d={`M0 ${y} H160`} />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path key={i} d={`M${i * 22 + (i % 2) * 10} 0 V76`} />
        ))}
      </g>
      <rect x="0" y="76" width="160" height="14" fill="#15110f" />
      {/* Puerta abierta con el tesoro. */}
      <g>
        <path d="M66 76 V38 a14 14 0 0 1 28 0 V76 Z" fill="url(#hs-dg-gold)" />
        <path d="M66 76 L52 90 H108 L94 76 Z" fill="url(#hs-dg-rays)" />
        <rect x="73" y="62" width="14" height="10" rx="1.5" fill="#8a4f20" stroke="#3b2008" />
        <path d="M73 64 a7 5 0 0 1 14 0" fill="#a8652a" stroke="#3b2008" />
        <rect x="78.5" y="64" width="3" height="4" fill="#ffd25e" />
        <path d={spark(80, 50, 5)} fill="#fff" className="hs-twinkle" />
      </g>
      <g className="hs-door hs-door--l">
        <g fill="#7a4a24" stroke="#3b2008">
          {door(34, 'l')}
        </g>
        <circle cx="42" cy="58" r="1.8" fill="#c8a24b" />
      </g>
      <g className="hs-door hs-door--r">
        <g fill="#7a4a24" stroke="#3b2008">
          {door(126, 'r')}
        </g>
        <circle cx="118" cy="58" r="1.8" fill="#c8a24b" />
      </g>
      {[12, 148].map((x) => (
        <g key={x}>
          <rect x={x - 1.5} y="44" width="3" height="10" fill="#4b2517" />
          <ellipse cx={x} cy="40" rx="4" ry="6.5" fill="#ff9a2e" className="hs-flame2" />
          <ellipse cx={x} cy="41" rx="2" ry="3.6" fill="#fff4c0" className="hs-flame2" />
        </g>
      ))}
    </svg>
  )
}

export function PlinkoScene() {
  const pegs = []
  for (let r = 0; r < 5; r++) {
    const n = r + 3
    for (let c = 0; c < n; c++) pegs.push([80 + (c - (n - 1) / 2) * 16, 16 + r * 11.5])
  }
  const slots = ['#e2463c', '#b06cff', '#5f87a0', '#5f87a0', '#5f87a0', '#b06cff', '#e2463c']
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      {pegs.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.9" fill="#f1e9d6" />
      ))}
      {slots.map((c, i) => (
        <rect key={i} x={24 + i * 16.2} y="73" width="14" height="13" rx="2.5" fill={c} fillOpacity="0.9" />
      ))}
      <g className="hs-pball">
        <circle cx="80" cy="5" r="3.6" fill="#ffd25e" stroke="#8a5d0a" strokeWidth="0.8" />
        <circle cx="79" cy="4" r="1" fill="#fff4c0" />
      </g>
    </svg>
  )
}

function Pad({ cx, cy, rx }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.38} fill="#2f8a4a" stroke="#9be08a" strokeOpacity="0.5" />
      <path d={`M${cx} ${cy} L${cx + rx * 0.9} ${cy - rx * 0.12}`} stroke="#14586a" strokeWidth="1.6" />
    </g>
  )
}

export function FrogScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="#bff3ff" strokeOpacity="0.5">
        {[
          [32, 70, 24],
          [88, 54, 20],
          [132, 68, 22],
        ].map(([x, y, rx], i) => (
          <ellipse key={i} className="hs-ripple" cx={x} cy={y + 2} rx={rx} ry={rx * 0.4} style={{ '--d': `${i * 0.8}s` }} />
        ))}
      </g>
      <Pad cx="32" cy="70" rx="22" />
      <Pad cx="88" cy="54" rx="18" />
      <Pad cx="132" cy="68" rx="20" />
      <g className="hs-frog">
        <ellipse cx="32" cy="63" rx="11" ry="7.5" fill="#7ccf4a" stroke="#3f9a52" strokeWidth="1.2" />
        <ellipse cx="22" cy="68" rx="5" ry="2.6" fill="#7ccf4a" stroke="#3f9a52" />
        <ellipse cx="42" cy="68" rx="5" ry="2.6" fill="#7ccf4a" stroke="#3f9a52" />
        <circle cx="27" cy="55" r="4.4" fill="#fff" stroke="#3f9a52" />
        <circle cx="37" cy="55" r="4.4" fill="#fff" stroke="#3f9a52" />
        <circle cx="27.6" cy="55.4" r="1.9" fill="#16161b" />
        <circle cx="36.4" cy="55.4" r="1.9" fill="#16161b" />
        <path d="M28 63 Q32 66 36 63" fill="none" stroke="#2b6b36" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  )
}
