// Dibujos del Laberinto de las Puertas (SVG a mano). Las puertas, lo que hay detrás y la hoja de madera comparten un
// viewBox de 100 × 150 con la parte de arriba en arco, para que encajen igual. Los estilos están en Dungeon.css.
const ARCH = 'M8 150 V50 A42 42 0 0 1 92 50 V150 Z'
const RING = 'M3.5 152 V50 A46.5 46.5 0 0 1 96.5 50 V152'
const rad = (deg) => (deg * Math.PI) / 180

// Dibuja los hijos y su reflejo (el eje es x = 50).
const Mirror = ({ children }) => (
  <>
    <g>{children}</g>
    <g transform="translate(100 0) scale(-1 1)">{children}</g>
  </>
)

// Hoja de la puerta: tablones, herrajes, cerradura y medallón con el número. n: 1, 2 o 3 (para los degradados);
// label: lo que pone el medallón (vacío mientras las puertas se barajan, para no delatar cuál es cuál).
export function DoorLeaf({ n, label = String(n) }) {
  return (
    <svg className="dg__leaf-svg" viewBox="0 0 100 150" aria-hidden="true">
      <defs>
        <linearGradient id={`dg-wood-${n}`} x1="0" x2="1">
          <stop offset="0" stopColor="#4a2a12" />
          <stop offset="0.3" stopColor="#7a4a24" />
          <stop offset="0.55" stopColor="#8b5a2c" />
          <stop offset="0.8" stopColor="#6a3e1e" />
          <stop offset="1" stopColor="#3b1f0d" />
        </linearGradient>
        <linearGradient id={`dg-lit-${n}`} x1="0" x2="1">
          <stop offset="0" className="dg__lit" stopOpacity="0.5" />
          <stop offset="0.38" className="dg__lit" stopOpacity="0" />
          <stop offset="0.62" className="dg__lit" stopOpacity="0" />
          <stop offset="1" className="dg__lit" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id={`dg-brass-${n}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff0b0" />
          <stop offset="0.5" stopColor="#d9ae48" />
          <stop offset="1" stopColor="#7c5a14" />
        </radialGradient>
      </defs>
      <path d={ARCH} fill={`url(#dg-wood-${n})`} />
      {/* Veta de la madera */}
      <path
        d="M17 70 q2 8 0 18 M18 100 q-2 7 1 14 M38 22 q2 9 -1 20 M40 74 q-2 8 0 16 M60 28 q2 8 0 16 M62 96 q2 10 -1 20 M82 78 q-2 8 1 14 M83 124 q2 8 0 16 M22 128 q2 8 0 14"
        className="dg__grain"
      />
      {[29, 50, 71].map((x) => (
        <g key={x}>
          <line x1={x} y1={x === 50 ? 8 : 12} x2={x} y2="150" className="dg__plank" />
          <line x1={x + 1.3} y1={x === 50 ? 8 : 12} x2={x + 1.3} y2="150" className="dg__plank-hi" />
        </g>
      ))}
      {/* Cinchas de hierro con clavos y remates en la bisagra */}
      {[58, 118].map((y) => (
        <g key={y}>
          <path d={`M8 ${y} H92 V${y + 8} H8 Z`} className="dg__iron" />
          <path d={`M8 ${y} H92`} className="dg__iron-hi" />
          <path d={`M8 ${y - 2} Q-2 ${y + 4} 8 ${y + 10}`} className="dg__iron" />
          {[16, 30, 44, 58, 72, 85].map((x) => (
            <circle key={x} cx={x} cy={y + 4} r="1.7" className="dg__rivet" />
          ))}
        </g>
      ))}
      <path d="M11 52 A39 39 0 0 1 89 52" className="dg__iron-arch" />
      {/* Cerradura y aldaba */}
      <rect x="66" y="80" width="20" height="28" rx="4" className="dg__plate" />
      <circle cx="76" cy="90" r="2.4" className="dg__keyhole" />
      <path d="M75 90 h2 l1 6 h-4 Z" className="dg__keyhole" />
      <circle cx="76" cy="101" r="5" fill="none" className="dg__ring" />
      {/* Medallón con el número */}
      <circle cx="50" cy="37" r="12.5" fill={`url(#dg-brass-${n})`} className="dg__medal" />
      <circle cx="50" cy="37" r="9.6" fill="none" className="dg__medal-in" />
      <text x="50" y="43.2" className="dg__num">
        {label}
      </text>
      <path d={ARCH} fill={`url(#dg-lit-${n})`} />
      <path d={ARCH} fill="none" className="dg__frame-line" />
    </svg>
  )
}

// Marco de piedra de la puerta (sillares en el arco, clave, zócalo) y el charco de luz que sale al abrirla.
export function Frame() {
  return (
    <svg className="dg__frame" viewBox="0 0 100 150" aria-hidden="true">
      <path d="M10 150 L-8 166 H108 L90 150 Z" className="dg__spill" />
      <path d={RING} className="dg__stone-base" />
      <path d={RING} className="dg__stones" />
      <path d="M44.5 -2 H55.5 L58 10 H42 Z" className="dg__keystone" />
      <rect x="-4" y="146" width="108" height="6" rx="1.5" className="dg__plinth" />
    </svg>
  )
}

// Polvo que cae del dintel cuando la puerta se abre.
export function Fall() {
  return (
    <svg className="dg__fall" viewBox="0 0 100 150" aria-hidden="true">
      {[
        [20, 18, 1.3],
        [30, 11, 1],
        [41, 8, 1.6],
        [52, 6, 1.1],
        [63, 8, 1.5],
        [74, 11, 1],
        [84, 18, 1.4],
        [47, 14, 0.9],
      ].map(([x, y, r], i) => (
        <circle key={x} cx={x} cy={y} r={r} className="dg__fall-dot" style={{ '--i': i }} />
      ))}
    </svg>
  )
}

// Lo que hay detrás de la puerta. room: sala (decide qué monstruo sale).
export function Behind({ kind, room }) {
  return (
    <svg className={`dg__behind-svg is-${kind}`} viewBox="0 0 100 150" aria-hidden="true">
      <defs>
        <clipPath id="dg-arch">
          <path d={ARCH} />
        </clipPath>
      </defs>
      <path d={ARCH} className="dg__void" />
      <g clipPath="url(#dg-arch)">
        {(kind === 'chest' || kind === 'mimic') && <Chest room={room} mimic={kind === 'mimic'} />}
        {kind === 'empty' && <Corridor />}
        {kind === 'monster' && <Monster room={room} />}
        {kind === 'trap' && <Trap />}
      </g>
    </svg>
  )
}

// mimic: el cofre tiene dientes, ojos y lengua (se come el botín).
function Chest({ room, mimic }) {
  const rich = room >= 3
  return (
    <g className={`dg__chest ${mimic ? 'is-mimic' : ''}`}>
      <defs>
        <radialGradient id="dg-c-bg" cx="0.5" cy="0.62" r="0.7">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#f0a82c" stopOpacity="0.6" />
          <stop offset="1" stopColor="#3a1c05" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-c-ray" cx="50" cy="92" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff1b0" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff1b0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dg-c-wood" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a5e2a" />
          <stop offset="1" stopColor="#52290f" />
        </linearGradient>
        <radialGradient id="dg-c-gold" cx="0.4" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.5" stopColor="#f2b93a" />
          <stop offset="1" stopColor="#9a6410" />
        </radialGradient>
      </defs>
      <rect width="100" height="150" fill="url(#dg-c-bg)" />
      <g className="dg__rays">
        {Array.from({ length: 8 }, (_, k) => {
          const a = k * 45
          const p = (d) =>
            `${(50 + Math.cos(rad(a + d)) * 110).toFixed(1)} ${(92 + Math.sin(rad(a + d)) * 110).toFixed(1)}`
          return <path key={k} d={`M50 92 L${p(-7)} L${p(7)} Z`} fill="url(#dg-c-ray)" />
        })}
      </g>
      <path d="M0 130 Q50 118 100 130 V150 H0 Z" fill="#2b1708" />
      {/* Montón de monedas en el suelo */}
      <path d="M8 150 Q14 124 50 120 Q86 124 92 150 Z" fill="url(#dg-c-gold)" />
      {[
        [18, 142],
        [28, 134],
        [74, 136],
        [84, 144],
        [12, 148],
        [60, 144],
        [38, 146],
      ].map(([x, y], i) => (
        <ellipse key={x} cx={x} cy={y} rx="5.2" ry="2.4" className="dg__coin" style={{ '--i': i }} />
      ))}
      {/* Tapa abierta hacia atrás, con forro rojo */}
      <path d="M22 98 Q20 62 50 58 Q80 62 78 98 Z" fill="url(#dg-c-wood)" stroke="#2b1507" strokeWidth="1.4" />
      <path d="M28 96 Q27 68 50 64 Q73 68 72 96 Z" fill="#7a1f2b" />
      <path
        d="M28 96 Q27 68 50 64 Q73 68 72 96"
        fill="none"
        stroke="#e8c25a"
        strokeWidth="1.2"
        strokeDasharray="1.6 2.2"
      />
      <path d="M22 98 Q20 62 50 58 Q80 62 78 98" fill="none" stroke="#d9ae48" strokeWidth="2.6" />
      {/* Oro rebosando */}
      <path d="M24 100 Q34 82 50 80 Q66 82 76 100 Z" fill="url(#dg-c-gold)" />
      {[32, 40, 48, 56, 64, 70, 36, 60].map((x, i) => (
        <circle
          key={`${x}-${i}`}
          cx={x}
          cy={96 - (i % 3) * 5 - (i > 5 ? 2 : 0)}
          r="3.6"
          className="dg__coin"
          style={{ '--i': i }}
        />
      ))}
      {/* Gemas */}
      <path d="M42 84 l4 -5 l4 5 l-4 5 Z" fill="#e2463c" stroke="#7a1010" strokeWidth="0.8" />
      <path d="M58 86 l3.4 -4.4 l3.4 4.4 l-3.4 4.4 Z" fill="#4aa8ff" stroke="#16487a" strokeWidth="0.8" />
      <path d="M30 94 l3 -4 l3 4 l-3 4 Z" fill="#58d68d" stroke="#1d6b3a" strokeWidth="0.8" />
      {rich && (
        <>
          <path
            d="M38 78 L40 66 L45 73 L50 62 L55 73 L60 66 L62 78 Z"
            fill="url(#dg-c-gold)"
            stroke="#8a5a0a"
            strokeWidth="1"
          />
          <circle cx="50" cy="74" r="2" fill="#e2463c" />
        </>
      )}
      {/* Cuerpo del cofre */}
      <path d="M20 100 H80 V134 H20 Z" fill="url(#dg-c-wood)" stroke="#2b1507" strokeWidth="1.4" />
      <path d="M32 101 V133 M50 101 V133 M68 101 V133" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      <path d="M20 100 H80 V108 H20 Z M20 126 H80 V134 H20 Z" fill="#c8a24b" />
      <path d="M20 108 H80" stroke="#6b4a10" strokeWidth="0.8" />
      {[24, 36, 64, 76].map((x) => (
        <circle key={x} cx={x} cy="104" r="1.2" fill="#6b4a10" />
      ))}
      <rect x="43" y="108" width="14" height="16" rx="2" fill="url(#dg-c-gold)" stroke="#5e4510" strokeWidth="1" />
      <circle cx="50" cy="114" r="2.2" fill="#2a1607" />
      <path d="M49 114 h2 l0.8 6 h-3.6 Z" fill="#2a1607" />
      {[
        [30, 66],
        [72, 62],
        [50, 48],
        [16, 86],
        [86, 84],
        [62, 104],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 5} L${x + 1.4} ${y - 1.4} L${x + 5} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 5} L${x - 1.4} ${y + 1.4} L${x - 5} ${y} L${x - 1.4} ${y - 1.4} Z`}
          className="dg__sparkle"
          style={{ '--i': i }}
        />
      ))}
      {mimic && (
        <g className="dg__mimic">
          <rect width="100" height="150" fill="rgba(120, 0, 10, 0.45)" />
          {/* Dientes en el borde de la tapa y del cuerpo */}
          <path
            d="M24 100 l4 9 l4 -9 l4 9 l4 -9 l4 9 l4 -9 l4 9 l4 -9 l4 9 l4 -9 l4 9 l4 -9 Z"
            fill="#f4ecd8"
            stroke="#3a1a10"
            strokeWidth="0.6"
          />
          <path d="M26 98 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 Z" fill="#f4ecd8" stroke="#3a1a10" strokeWidth="0.6" />
          {/* Lengua */}
          <path d="M44 104 Q50 128 58 120 Q62 112 56 104 Z" fill="#c2304a" stroke="#5a0a18" strokeWidth="0.8" />
          {/* Ojos en la tapa */}
          {[38, 62].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="74" rx="6" ry="4.6" fill="#ffe14a" stroke="#3a1a10" strokeWidth="0.8" />
              <ellipse cx={x} cy="74" rx="1.6" ry="4" fill="#120408" />
            </g>
          ))}
        </g>
      )}
    </g>
  )
}

function Corridor() {
  return (
    <g className="dg__corridor">
      <defs>
        <linearGradient id="dg-k-bg" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c0b10" />
          <stop offset="1" stopColor="#1c1a22" />
        </linearGradient>
        <radialGradient id="dg-k-end" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c8d8ff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#c8d8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="150" fill="url(#dg-k-bg)" />
      {[0, 1, 2, 3, 4].map((i) => {
        const s = 1 - i * 0.19
        const w = 84 * s
        const top = 12 + i * 15
        return (
          <path
            key={i}
            d={`M${50 - w / 2} 150 V${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${50 + w / 2} ${top + w / 2} V150`}
            className="dg__corr-arch"
            style={{ opacity: 0.8 - i * 0.14, strokeWidth: 3.4 - i * 0.5 }}
          />
        )
      })}
      <ellipse cx="50" cy="86" rx="16" ry="22" fill="url(#dg-k-end)" className="dg__corr-light" />
      <path d="M8 150 L38 94 H62 L92 150 Z" className="dg__corr-floor" />
      <path
        d="M50 94 L50 150 M44 94 L26 150 M56 94 L74 150 M38 94 L8 150 M62 94 L92 150 M13 134 H87 M22 118 H78 M30 106 H70 M36 99 H64"
        className="dg__corr-tiles"
      />
      {[36, 64].map((x) => (
        <g key={x}>
          <circle cx={x} cy="86" r="5" className="dg__corr-glow" />
          <circle cx={x} cy="86" r="1.5" fill="#ffd27a" />
        </g>
      ))}
      <ellipse cx="66" cy="138" rx="13" ry="3.2" fill="rgba(120,150,200,0.28)" />
      <ellipse cx="66" cy="138" rx="4" ry="1.2" className="dg__ripple" />
      <circle cx="66" cy="104" r="1.5" className="dg__drip" />
      <path d="M12 118 q4 -3 8 0 M30 142 l10 -3 M34 140 l8 4" className="dg__bone" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={30 + i * 14} cy={120 - i * 5} r="1" className="dg__dust" style={{ '--i': i }} />
      ))}
    </g>
  )
}

// Un monstruo distinto por sala: trol (vestíbulo), esqueleto (cripta), espectro (galería), araña (pozo) y dragón.
function Monster({ room }) {
  const Beast = [Troll, Skeleton, Wraith, Troll, Spider, Dragon][room] ?? Troll
  return (
    <g className={`dg__monster ${room === 5 ? 'is-dragon' : ''}`}>
      <Beast />
    </g>
  )
}

function Troll() {
  return (
    <>
      <defs>
        <radialGradient id="dg-t-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff5a3a" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ff5a3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dg-t-skin" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f8d3e" />
          <stop offset="1" stopColor="#2f4719" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="90" rx="60" ry="64" fill="url(#dg-t-aura)" className="dg__heat" />
      {/* Garrote con pinchos */}
      <path d="M76 120 L88 58 Q98 50 92 38 Q80 34 78 48 L68 120 Z" fill="#5a3418" stroke="#24120a" strokeWidth="1.4" />
      {[
        [90, 44],
        [96, 56],
        [86, 68],
      ].map(([x, y]) => (
        <path
          key={y}
          d={`M${x} ${y - 3} L${x + 7} ${y} L${x} ${y + 3} Z`}
          fill="#c9c2b0"
          stroke="#24120a"
          strokeWidth="0.8"
        />
      ))}
      <path d="M4 150 Q2 112 28 100 H72 Q98 112 96 150 Z" fill="url(#dg-t-skin)" stroke="#142008" strokeWidth="2" />
      <path d="M26 104 L50 128 L74 104 L66 100 L50 112 L34 100 Z" fill="#5a3418" stroke="#24120a" strokeWidth="1.2" />
      <Mirror>
        <path d="M27 70 L6 54 L12 76 L26 90 Z" fill="#587a31" stroke="#142008" strokeWidth="1.6" />
      </Mirror>
      <ellipse cx="50" cy="74" rx="25" ry="25" fill="url(#dg-t-skin)" stroke="#142008" strokeWidth="2" />
      <Mirror>
        <path d="M26 66 Q38 56 50 68 L50 72 Q38 65 26 71 Z" fill="#1f2d0f" />
        <ellipse cx="38" cy="74" rx="5.4" ry="3.6" fill="#ffd23f" style={{ filter: 'drop-shadow(0 0 3px #ff9a2f)' }} />
        <circle cx="39" cy="74" r="1.7" fill="#160404" />
        <circle cx="32" cy="86" r="1.4" fill="#3d5a1f" />
      </Mirror>
      <path d="M45 78 Q50 90 55 78 Q50 84 45 78 Z" fill="#2f4719" />
      <path d="M32 90 Q50 102 68 90 Q50 108 32 90 Z" fill="#160404" />
      <path d="M37 91 L34 78 L42 92 Z M63 91 L66 78 L58 92 Z" fill="#f1ead8" stroke="#160404" strokeWidth="0.8" />
      <path d="M44 96 L46 102 L48 96 M52 96 L54 102 L56 96" fill="#f1ead8" stroke="#160404" strokeWidth="0.6" />
      <path d="M12 118 L2 106 M88 118 L98 106" className="dg__claw" />
    </>
  )
}

function Skeleton() {
  return (
    <>
      <defs>
        <radialGradient id="dg-s-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff3b2f" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ff3b2f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dg-s-bone" x1="0" x2="1">
          <stop offset="0" stopColor="#f4ecd6" />
          <stop offset="1" stopColor="#b7ab8c" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="80" rx="60" ry="64" fill="url(#dg-s-aura)" className="dg__heat" />
      {/* Hacha alzada */}
      <path d="M86 112 L86 30" stroke="#5a3418" strokeWidth="4" strokeLinecap="round" />
      <path d="M86 28 Q106 20 102 48 Q94 44 86 46 Z" fill="#aab4bf" stroke="#2a3038" strokeWidth="1.4" />
      <path d="M86 112 Q80 106 78 100" fill="none" stroke="url(#dg-s-bone)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M16 104 Q50 92 84 104" fill="none" stroke="url(#dg-s-bone)" strokeWidth="5" strokeLinecap="round" />
      <path d="M84 104 Q92 100 86 80" fill="none" stroke="url(#dg-s-bone)" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M16 104 Q8 120 14 140" fill="none" stroke="url(#dg-s-bone)" strokeWidth="3.6" strokeLinecap="round" />
      <rect x="47" y="96" width="6" height="54" rx="2" fill="url(#dg-s-bone)" />
      {[106, 116, 126, 136].map((y, i) => (
        <path
          key={y}
          d={`M50 ${y} Q${24 + i * 2} ${y + 2} ${26 + i * 3} ${y + 12} M50 ${y} Q${76 - i * 2} ${y + 2} ${74 - i * 3} ${y + 12}`}
          fill="none"
          stroke="url(#dg-s-bone)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      ))}
      <ellipse cx="50" cy="68" rx="21" ry="22" fill="url(#dg-s-bone)" stroke="#3a3322" strokeWidth="1.6" />
      <path d="M36 82 H64 V91 Q50 97 36 91 Z" fill="url(#dg-s-bone)" stroke="#3a3322" strokeWidth="1.4" />
      <path d="M41 83 V90 M46 84 V92 M50 84 V93 M54 84 V92 M59 83 V90" stroke="#3a3322" strokeWidth="1" />
      <Mirror>
        <ellipse cx="41" cy="66" rx="6.4" ry="7.4" fill="#0b0708" />
        <circle cx="41" cy="67" r="2.5" fill="#ff3b2f" style={{ filter: 'drop-shadow(0 0 4px #ff3b2f)' }} />
      </Mirror>
      <path d="M50 73 L46 82 H54 Z" fill="#0b0708" />
      <path d="M58 50 L62 60 L56 58" fill="none" stroke="#3a3322" strokeWidth="1" />
      {/* Yelmo abollado */}
      <path d="M28 62 Q50 28 72 62 Q50 50 28 62 Z" fill="#8a7448" stroke="#2f2814" strokeWidth="1.6" />
      <path d="M48 36 H52 V62 H48 Z" fill="#6b5a36" />
    </>
  )
}

function Wraith() {
  return (
    <>
      <defs>
        <linearGradient id="dg-w-cloak" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dff1ff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#8fb7e0" stopOpacity="0.6" />
          <stop offset="1" stopColor="#4a6fa0" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="dg-w-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7fd0ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7fd0ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="70" rx="64" ry="70" fill="url(#dg-w-aura)" className="dg__heat" />
      {[16, 28, 40].map((r, i) => (
        <circle key={r} cx="50" cy="70" r={r + 10} className="dg__echo" style={{ '--i': i }} />
      ))}
      <path
        d="M50 18 Q20 26 18 68 Q14 112 6 150 H94 Q86 112 82 68 Q80 26 50 18 Z"
        fill="url(#dg-w-cloak)"
        className="dg__cloak"
      />
      <path d="M6 150 Q18 130 30 146 T52 142 T74 146 T94 130 V150 Z" fill="#8fb7e0" opacity="0.45" />
      <ellipse cx="50" cy="52" rx="17" ry="21" fill="#04060c" />
      <Mirror>
        <path
          d="M37 50 Q44 44 48 52 Q42 56 37 50 Z"
          fill="#aef0ff"
          style={{ filter: 'drop-shadow(0 0 5px #7fd0ff)' }}
        />
      </Mirror>
      <ellipse cx="50" cy="68" rx="4.4" ry="6.4" fill="#02030a" />
      <Mirror>
        <path
          d="M20 96 L2 84 M20 98 L0 96 M20 100 L2 110 M20 102 L8 118"
          fill="none"
          stroke="#e4f4ff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </Mirror>
    </>
  )
}

function Spider() {
  const legs = [
    [38, 78, 14, 60, 3, 84, 6, 118],
    [39, 84, 12, 82, 4, 108, 10, 138],
    [40, 90, 14, 106, 8, 130, 14, 150],
    [38, 70, 20, 44, 8, 52, 2, 74],
  ]
  return (
    <>
      <defs>
        <radialGradient id="dg-p-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c04cff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#c04cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-p-body" cx="0.4" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#4a3a5e" />
          <stop offset="1" stopColor="#0f0a16" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="90" rx="60" ry="64" fill="url(#dg-p-aura)" className="dg__heat" />
      <path d="M50 0 V46" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
      <Mirror>
        {legs.map(([x0, y0, x1, y1, x2, y2, x3, y3]) => (
          <path
            key={y0}
            d={`M${x0} ${y0} L${x1} ${y1} L${x2} ${y2} L${x3} ${y3}`}
            fill="none"
            stroke="#150e1d"
            strokeWidth="3.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </Mirror>
      <ellipse cx="50" cy="104" rx="24" ry="30" fill="url(#dg-p-body)" stroke="#05030a" strokeWidth="1.6" />
      <path d="M50 88 L42 106 L50 124 L58 106 Z" fill="#e2463c" />
      <path d="M40 92 Q50 96 60 92 M36 104 Q50 108 64 104" fill="none" stroke="#6b4a8a" strokeWidth="1.2" />
      <ellipse cx="50" cy="66" rx="16" ry="14" fill="url(#dg-p-body)" stroke="#05030a" strokeWidth="1.6" />
      {[
        [44, 62, 3.2],
        [56, 62, 3.2],
        [38, 66, 2.1],
        [62, 66, 2.1],
        [44, 56, 1.7],
        [56, 56, 1.7],
        [49, 55, 1.2],
        [51, 55, 1.2],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#ff3b2f" style={{ filter: 'drop-shadow(0 0 3px #ff3b2f)' }} />
      ))}
      <Mirror>
        <path d="M44 72 Q38 84 45 94 L48 84 Z" fill="#e8dcc0" stroke="#05030a" strokeWidth="1" />
        <circle cx="45" cy="97" r="1.3" fill="#7fe05a" className="dg__venom" />
      </Mirror>
    </>
  )
}

function Dragon() {
  return (
    <>
      <defs>
        <radialGradient id="dg-d-fire" cx="0.5" cy="0.62" r="0.6">
          <stop offset="0" stopColor="#fff2a0" />
          <stop offset="0.3" stopColor="#ff9a2f" />
          <stop offset="0.7" stopColor="#c22a10" stopOpacity="0.7" />
          <stop offset="1" stopColor="#5a0a06" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dg-d-skin" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c5301f" />
          <stop offset="0.55" stopColor="#7a1710" />
          <stop offset="1" stopColor="#3a0a07" />
        </linearGradient>
        <linearGradient id="dg-d-snout" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8271a" />
          <stop offset="1" stopColor="#5a120c" />
        </linearGradient>
        <linearGradient id="dg-d-horn" x1="0" x2="1">
          <stop offset="0" stopColor="#f1e6c6" />
          <stop offset="1" stopColor="#8a7a56" />
        </linearGradient>
        <pattern id="dg-d-scales" width="8" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6 Q4 0 8 6" fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth="0.8" />
        </pattern>
      </defs>
      <ellipse cx="50" cy="86" rx="68" ry="70" fill="url(#dg-d-fire)" className="dg__heat" />
      <Mirror>
        {/* Cuernos y aletas */}
        <path d="M30 52 Q10 36 14 4 Q30 22 42 44 Z" fill="url(#dg-d-horn)" stroke="#2a1a08" strokeWidth="1.4" />
        <path d="M24 66 L0 50 L12 68 L-2 78 L14 84 L4 102 L28 94 Z" fill="#5a120c" stroke="#2a0805" strokeWidth="1.2" />
      </Mirror>
      <path
        d="M-4 150 Q0 112 22 100 L78 100 Q100 112 104 150 Z"
        fill="url(#dg-d-skin)"
        stroke="#2a0805"
        strokeWidth="1.6"
      />
      <path d="M-4 150 Q0 112 22 100 L78 100 Q100 112 104 150 Z" fill="url(#dg-d-scales)" />
      <path
        d="M22 62 Q28 34 50 30 Q72 34 78 62 Q84 90 70 108 Q50 122 30 108 Q16 90 22 62 Z"
        fill="url(#dg-d-skin)"
        stroke="#2a0805"
        strokeWidth="1.8"
      />
      <path d="M22 62 Q28 34 50 30 Q72 34 78 62 Q84 90 70 108 Q50 122 30 108 Q16 90 22 62 Z" fill="url(#dg-d-scales)" />
      <path d="M45 30 L50 12 L55 30 Z" fill="url(#dg-d-horn)" stroke="#2a1a08" strokeWidth="1" />
      {/* Hocico */}
      <path
        d="M32 90 Q50 82 68 90 Q74 112 50 119 Q26 112 32 90 Z"
        fill="url(#dg-d-snout)"
        stroke="#2a0805"
        strokeWidth="1.4"
      />
      <Mirror>
        <path d="M23 64 Q34 52 49 67 L48 73 Q36 63 24 71 Z" fill="#240604" />
        <path d="M27 76 Q38 65 48 78 Q38 83 27 76 Z" fill="#ffd23f" className="dg__dragon-eye" />
        <ellipse cx="38" cy="75" rx="1.7" ry="5.4" fill="#1a0403" />
        <ellipse cx="43" cy="97" rx="2.2" ry="1.4" fill="#12020a" transform="rotate(20 43 97)" />
      </Mirror>
      <path d="M43 92 q-4 -8 2 -14 q4 -4 0 -9" className="dg__smoke" />
      <path d="M57 92 q4 -8 -2 -14 q-4 -4 0 -9" className="dg__smoke" style={{ '--i': 1 }} />
      {/* Fauces abiertas con fuego dentro */}
      <path d="M33 108 Q50 148 67 108 Q50 118 33 108 Z" fill="url(#dg-d-fire)" stroke="#2a0805" strokeWidth="1.4" />
      <path d="M40 118 Q50 108 60 118 Q50 128 40 118 Z" fill="#ffe07a" className="dg__flame-mouth" />
      <path
        d="M35 110 L38 120 L41 112 L45 121 L48 113 L52 113 L55 121 L59 112 L62 120 L65 110 Z"
        fill="#f1ead8"
        stroke="#2a0805"
        strokeWidth="0.8"
      />
      <path d="M40 126 L43 119 L46 127 M54 127 L57 119 L60 126" fill="#f1ead8" stroke="#2a0805" strokeWidth="0.8" />
    </>
  )
}

function Trap() {
  return (
    <g className="dg__trap">
      <defs>
        <radialGradient id="dg-x-bg" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#7a1a14" stopOpacity="0.85" />
          <stop offset="1" stopColor="#12060a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dg-x-steel" x1="0" x2="1">
          <stop offset="0" stopColor="#6c7078" />
          <stop offset="0.45" stopColor="#d8dce2" />
          <stop offset="1" stopColor="#5a5e66" />
        </linearGradient>
      </defs>
      <rect width="100" height="150" fill="url(#dg-x-bg)" />
      {/* Fosa con huesos */}
      <path d="M0 126 H100 V150 H0 Z" fill="#06040a" />
      <path d="M8 140 l14 -5 M12 136 l10 6 M70 142 l16 -4 M76 138 l8 6" className="dg__bone" />
      {/* Pinchos del suelo */}
      <g className="dg__jaw-bot">
        {[9, 21, 33, 45, 57, 69, 81, 93].map((x, i) => (
          <path
            key={x}
            d={`M${x - 6} 150 L${x} ${96 - (i % 2) * 10} L${x + 6} 150 Z`}
            fill="url(#dg-x-steel)"
            stroke="#2a2c32"
            strokeWidth="0.9"
            className="dg__spike"
            style={{ '--i': i }}
          />
        ))}
        {[27, 63].map((x) => (
          <path key={x} d={`M${x - 1.2} ${104} L${x} 122 L${x + 1.2} 104 Z`} fill="#b3261e" />
        ))}
      </g>
      {/* Pinchos del techo que caen */}
      <g className="dg__jaw-top">
        <rect x="0" y="-12" width="100" height="14" fill="#3a3d44" stroke="#15161a" strokeWidth="1" />
        {[15, 29, 43, 57, 71, 85].map((x, i) => (
          <path
            key={x}
            d={`M${x - 7} 2 L${x} ${36 + (i % 2) * 10} L${x + 7} 2 Z`}
            fill="url(#dg-x-steel)"
            stroke="#2a2c32"
            strokeWidth="0.9"
          />
        ))}
      </g>
      <g className="dg__skull" transform="translate(50 74)">
        <path d="M-13 0 A13 13 0 1 1 13 0 V8 H-13 Z" fill="#e6dfcf" stroke="#3a3322" strokeWidth="1" />
        <circle cx="-5" cy="0" r="3.4" fill="#0b0a0d" />
        <circle cx="5" cy="0" r="3.4" fill="#0b0a0d" />
        <path d="M-6 8 V13 M-2 8 V13 M2 8 V13 M6 8 V13" stroke="#0b0a0d" strokeWidth="1.2" />
      </g>
      {/* Aviso: símbolo de peligro sobre la fosa */}
      <path d="M50 124 L60 142 H40 Z" className="dg__warn" />
      <path d="M50 130 V136 M50 139 V140" className="dg__warn-mark" />
    </g>
  )
}

// Antorcha de pared con soporte, llama y chispas.
export function Torch() {
  return (
    <svg className="dg__torch" viewBox="0 0 30 80" aria-hidden="true">
      <defs>
        <radialGradient id="dg-th">
          <stop offset="0" className="dg__th-stop" stopOpacity="0.55" />
          <stop offset="1" className="dg__th-stop" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="15" cy="20" r="30" className="dg__torch-halo" />
      <path d="M15 2 Q26 15 20 27 Q15 31 10 27 Q4 15 15 2 Z" className="dg__flame" />
      <path d="M15 9 Q22 18 19 26 Q15 29 11 26 Q8 18 15 9 Z" className="dg__flame-mid" />
      <path d="M15 15 Q19 21 17 26 Q15 28 13 26 Q11 21 15 15 Z" className="dg__flame-core" />
      {[
        [9, 12],
        [21, 8],
        [16, 4],
      ].map(([x, y], i) => (
        <circle key={x} cx={x} cy={y} r="0.9" className="dg__spark" style={{ '--i': i }} />
      ))}
      <path d="M8 28 H22 L19 42 H11 Z" className="dg__torch-cup" />
      <path d="M8 28 H22" className="dg__torch-rim" />
      <rect x="13" y="42" width="4" height="30" className="dg__torch-stick" />
      <rect x="8" y="57" width="14" height="4.5" rx="1.2" className="dg__torch-cup" />
    </svg>
  )
}

// Cofre grande de la sala del tesoro: montañas de monedas, corona, cáliz y gemas.
export function Hoard() {
  const coins = Array.from({ length: 26 }, (_, i) => ({
    x: 18 + ((i * 59) % 264),
    y: 140 + ((i * 17) % 28),
    r: 6 + (i % 3),
  }))
  return (
    <svg className="dg__hoard" viewBox="0 0 300 190" aria-hidden="true">
      <defs>
        <radialGradient id="dg-h-glow" cx="0.5" cy="0.6" r="0.55">
          <stop offset="0" stopColor="#fff2b0" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#f0a82c" stopOpacity="0.4" />
          <stop offset="1" stopColor="#f0a82c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-h-gold" cx="0.4" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.5" stopColor="#f2b93a" />
          <stop offset="1" stopColor="#8a5a0a" />
        </radialGradient>
        <linearGradient id="dg-h-wood" x1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a5e2a" />
          <stop offset="1" stopColor="#4a240c" />
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="110" rx="150" ry="90" fill="url(#dg-h-glow)" className="dg__hoard-glow" />
      {/* Montañas de monedas a los lados */}
      <path d="M0 190 Q20 128 74 118 Q118 124 132 190 Z" fill="url(#dg-h-gold)" stroke="#6b4a10" strokeWidth="1.4" />
      <path
        d="M300 190 Q280 128 226 118 Q182 124 168 190 Z"
        fill="url(#dg-h-gold)"
        stroke="#6b4a10"
        strokeWidth="1.4"
      />
      {coins.map((c, i) => (
        <ellipse key={i} cx={c.x} cy={c.y} rx={c.r} ry={c.r * 0.45} className="dg__coin" style={{ '--i': i }} />
      ))}
      {/* Cofre */}
      <path d="M80 112 Q80 62 150 56 Q220 62 220 112 Z" fill="url(#dg-h-wood)" stroke="#2b1507" strokeWidth="2" />
      <path d="M92 108 Q92 72 150 66 Q208 72 208 108 Z" fill="#7a1f2b" />
      <path d="M80 112 Q80 62 150 56 Q220 62 220 112" fill="none" stroke="#d9ae48" strokeWidth="4" />
      <path d="M86 116 Q110 84 150 82 Q190 84 214 116 Z" fill="url(#dg-h-gold)" />
      {Array.from({ length: 14 }, (_, i) => (
        <circle
          key={i}
          cx={96 + i * 8.6}
          cy={112 - Math.sin((i / 13) * Math.PI) * 22 - (i % 2) * 4}
          r="6.4"
          className="dg__coin"
          style={{ '--i': i }}
        />
      ))}
      <path d="M118 90 l7 -9 l7 9 l-7 9 Z" fill="#e2463c" stroke="#7a1010" strokeWidth="1.2" />
      <path d="M170 94 l6 -8 l6 8 l-6 8 Z" fill="#4aa8ff" stroke="#16487a" strokeWidth="1.2" />
      <path d="M96 100 l5 -7 l5 7 l-5 7 Z" fill="#58d68d" stroke="#1d6b3a" strokeWidth="1.2" />
      <path d="M194 104 l5 -7 l5 7 l-5 7 Z" fill="#c04cff" stroke="#5a1a8a" strokeWidth="1.2" />
      <path d="M78 114 H222 V170 H78 Z" fill="url(#dg-h-wood)" stroke="#2b1507" strokeWidth="2" />
      <path d="M78 114 H222 V128 H78 Z M78 158 H222 V170 H78 Z M96 128 V158 M204 128 V158" fill="#c8a24b" />
      <path d="M78 128 H222" stroke="#6b4a10" strokeWidth="1.2" />
      {[86, 108, 192, 214].map((x) => (
        <circle key={x} cx={x} cy="121" r="2.2" fill="#6b4a10" />
      ))}
      <rect x="136" y="126" width="28" height="30" rx="4" fill="url(#dg-h-gold)" stroke="#5e4510" strokeWidth="1.6" />
      <circle cx="150" cy="138" r="4" fill="#2a1607" />
      <path d="M148 138 h4 l1.4 12 h-6.8 Z" fill="#2a1607" />
      {/* Corona y cáliz */}
      <path
        d="M130 66 L134 40 L144 54 L150 32 L156 54 L166 40 L170 66 Z"
        fill="url(#dg-h-gold)"
        stroke="#8a5a0a"
        strokeWidth="1.6"
        className="dg__crown"
      />
      <circle cx="150" cy="56" r="3.4" fill="#e2463c" />
      <circle cx="138" cy="58" r="2.2" fill="#4aa8ff" />
      <circle cx="162" cy="58" r="2.2" fill="#58d68d" />
      <path
        d="M240 150 Q238 128 252 126 Q266 128 264 150 Z M246 150 H258 V160 H264 V164 H240 V160 H246 Z"
        fill="url(#dg-h-gold)"
        stroke="#6b4a10"
        strokeWidth="1.2"
      />
      {[
        [60, 70],
        [250, 80],
        [150, 20],
        [30, 120],
        [276, 130],
        [110, 40],
        [196, 40],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 8} L${x + 2.4} ${y - 2.4} L${x + 8} ${y} L${x + 2.4} ${y + 2.4} L${x} ${y + 8} L${x - 2.4} ${y + 2.4} L${x - 8} ${y} L${x - 2.4} ${y - 2.4} Z`}
          className="dg__sparkle"
          style={{ '--i': i }}
        />
      ))}
    </svg>
  )
}

// Icono del lobby: una puerta en arco entreabierta con luz dorada.
export function DoorIcon() {
  return (
    <svg className="game__door" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M8 38 V16 A12 12 0 0 1 32 16 V38 Z" className="game__door-gap" />
      <path d="M8 38 V16 A12 12 0 0 1 20 4 V38 Z" className="game__door-leaf" />
      <circle cx="16" cy="23" r="1.6" className="game__door-knob" />
      <circle cx="27" cy="31" r="2.6" className="game__door-gold" />
    </svg>
  )
}
