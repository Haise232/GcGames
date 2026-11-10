// Escenas de las tarjetas del selector de los juegos de la Season 5: la Lotería de Navidad (los bombos y un décimo) y
// el Trineo de Papá Noel (el trineo cruzando la luna sobre los tejados). Ya vienen con los colores de Navidad, así que
// no pasan por el tinte (scripts/season5-tinte.mjs).

export function LoteriaScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="lts-bg" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#7a1c2a" />
          <stop offset="1" stopColor="#1c0610" />
        </radialGradient>
      </defs>
      <rect width="240" height="160" fill="url(#lts-bg)" />
      <rect x="0" y="0" width="18" height="160" fill="#8a0f1c" />
      <rect x="222" y="0" width="18" height="160" fill="#8a0f1c" />
      {/* Bombo */}
      <g transform="translate(78 66)" className="lts-bombo">
        <rect x="-5" y="38" width="10" height="22" fill="#c99a3a" />
        <rect x="-26" y="58" width="52" height="6" rx="2" fill="#a87a22" />
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i * 137.5 * Math.PI) / 180
          const d = 34 * Math.sqrt((i + 0.5) / 16)
          return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r="5" fill={i % 5 ? '#fff8ec' : '#f8c54e'} />
        })}
        <circle r="42" fill="#ffffff" fillOpacity="0.08" stroke="#e8c26a" strokeWidth="4" />
        <circle r="4" fill="#e8c26a" />
      </g>
      {/* Décimo */}
      <g transform="translate(150 78) rotate(-8)">
        <rect x="-4" y="-4" width="84" height="50" rx="4" fill="#000" opacity="0.3" />
        <rect x="-6" y="-8" width="84" height="50" rx="4" fill="#fbf1dc" stroke="#c8202c" strokeWidth="2.5" />
        <text x="36" y="6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#c8202c">
          SORTEO DE NAVIDAD
        </text>
        <text x="36" y="28" textAnchor="middle" fontSize="20" fontWeight="900" fill="#2a0c06" letterSpacing="1.5">
          22122
        </text>
        <path d="M8 33 l2 4 4 0 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 0 Z" fill="#c8202c" />
      </g>
      {/* La bola del Gordo */}
      <g transform="translate(196 34)">
        <circle r="15" fill="#d42a35" stroke="#fff" strokeWidth="2" />
        <text y="4" textAnchor="middle" fontSize="9" fontWeight="900" fill="#fff">
          ×400
        </text>
      </g>
    </svg>
  )
}

export function TrineoScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="trs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060b1f" />
          <stop offset="1" stopColor="#1b3566" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" fill="url(#trs-sky)" />
      {[
        [20, 20],
        [60, 12],
        [104, 30],
        [210, 18],
        [36, 52],
        [226, 60],
        [130, 10],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="#fff" />
      ))}
      <circle cx="166" cy="50" r="40" fill="#eef3ff" />
      <circle cx="166" cy="50" r="54" fill="#eef3ff" opacity="0.12" />
      {/* El trineo y los renos, en silueta delante de la luna */}
      <g className="trs-sleigh" transform="translate(120 34) scale(0.42)" fill="#0b1532">
        <path d="M8 46 Q4 30 18 28 L40 30 Q50 30 50 40 L48 52 L44 52 L42 44 L22 44 L18 54 L14 54 Z" />
        <path d="M44 32 L52 18 L60 20 L56 32 Z M54 18 L50 6 M54 18 L58 6" stroke="#0b1532" strokeWidth="2.5" />
        <path d="M60 46 Q56 30 70 28 L92 30 Q102 30 102 40 L100 52 L96 52 L94 44 L74 44 L70 54 L66 54 Z" />
        <path d="M96 32 L104 18 L112 20 L108 32 Z M106 18 L102 6 M106 18 L110 6" stroke="#0b1532" strokeWidth="2.5" />
        <circle cx="113" cy="22" r="3.5" fill="#ff3b48" />
        <path d="M118 40 L196 40 Q204 40 202 50 L198 66 L126 66 Q116 66 118 56 Z" />
        <path d="M112 76 L204 76 Q212 76 212 68" stroke="#0b1532" strokeWidth="4" fill="none" />
        <circle cx="152" cy="30" r="9" />
        <path d="M162 40 Q158 16 178 18 Q198 20 194 40 Z" />
      </g>
      {/* Tejados nevados con sus chimeneas */}
      <path d="M0 120 L30 96 L60 120 Z" fill="#3a1a1a" />
      <path d="M-2 120 L30 94 L62 120 L56 120 L30 100 L4 120 Z" fill="#f4f9ff" />
      <rect x="42" y="96" width="8" height="14" fill="#5a2a22" />
      <rect x="76" y="92" width="44" height="68" fill="#4a4258" />
      <rect x="74" y="89" width="48" height="5" rx="2" fill="#f4f9ff" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={82 + c * 13} y={100 + r * 15} width="8" height="8" fill={(r + c) % 2 ? '#ffcf6b' : '#1a2238'} />),
      )}
      <path d="M130 124 L170 100 L210 124 Z" fill="#1f4a38" />
      <path d="M128 124 L170 98 L212 124 L206 124 L170 104 L134 124 Z" fill="#f4f9ff" />
      <rect x="186" y="100" width="8" height="14" fill="#2a3450" />
      <rect x="0" y="120" width="76" height="40" fill="#7a3a30" />
      <rect x="130" y="124" width="80" height="36" fill="#33262d" />
      <rect x="20" y="132" width="12" height="10" fill="#ffcf6b" />
      <rect x="160" y="134" width="12" height="10" fill="#ffcf6b" />
      <rect x="210" y="110" width="30" height="50" fill="#26304a" />
      <path d="M0 150 C 60 140, 140 152, 240 144 L240 160 L0 160 Z" fill="#eef6ff" />
      {/* Un regalo cayendo */}
      <g transform="translate(46 70) rotate(-12)">
        <rect x="-6" y="-6" width="12" height="12" fill="#d42a35" />
        <rect x="-1.5" y="-6" width="3" height="12" fill="#f8c54e" />
      </g>
    </svg>
  )
}
