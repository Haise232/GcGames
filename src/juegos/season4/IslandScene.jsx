// Escena de la portada de la Season 4: atardecer sobre el mar con el Teide, las otras islas al fondo, palmeras que se
// mecen, olas, gaviotas y el reflejo del sol. Todo SVG; las animaciones (clases is4-*) están en season4.css y se paran
// con prefers-reduced-motion.

const PALM_LEAVES = [-62, -30, -4, 22, 50, 80, 112]

// Palmera: tronco curvo y una corona de hojas. x, y: la base; s: escala; flip: inclinada hacia el otro lado.
function Palm({ x, y, s = 1, flip = false, delay = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <g className="is4-palm" style={{ animationDelay: `${delay}s` }}>
        <path d="M0 0 C 6 -60, 18 -120, 46 -176" fill="none" stroke="#1a0f2e" strokeWidth="13" strokeLinecap="round" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path key={i} d={`M${2 + i * 5.2} ${-18 - i * 20} l 10 -3`} stroke="#2b1b45" strokeWidth="3" strokeLinecap="round" />
        ))}
        <g transform="translate(46 -176)">
          {PALM_LEAVES.map((deg, i) => (
            <path
              key={deg}
              className="is4-leaf"
              style={{ animationDelay: `${delay + i * 0.12}s` }}
              transform={`rotate(${deg})`}
              d="M0 0 C 30 -26, 72 -24, 104 6 C 76 -6, 60 -4, 46 4 C 58 -2, 34 -4, 0 0 Z M 18 -8 l 6 12 M 34 -12 l 8 14 M 52 -12 l 8 14 M 70 -8 l 7 12"
              fill="#1a0f2e"
              stroke="#1a0f2e"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          ))}
          <circle cx="-4" cy="6" r="7" fill="#2b1b45" />
          <circle cx="8" cy="9" r="6" fill="#2b1b45" />
        </g>
      </g>
    </g>
  )
}

export default function IslandScene({ className = '' }) {
  return (
    <svg className={`is4-scene ${className}`} viewBox="0 0 1200 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="is4-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1150" />
          <stop offset="0.32" stopColor="#5a1f7a" />
          <stop offset="0.58" stopColor="#d9467a" />
          <stop offset="0.8" stopColor="#ff8a4c" />
          <stop offset="1" stopColor="#ffcf6b" />
        </linearGradient>
        <linearGradient id="is4-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6b8" />
          <stop offset="0.55" stopColor="#ffc24a" />
          <stop offset="1" stopColor="#ff5f6d" />
        </linearGradient>
        <radialGradient id="is4-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ff7a59" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="is4-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b6f9a" />
          <stop offset="0.35" stopColor="#16466e" />
          <stop offset="1" stopColor="#081a33" />
        </linearGradient>
        <linearGradient id="is4-teide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a2a6e" />
          <stop offset="1" stopColor="#2a1440" />
        </linearGradient>
        {/* Rayas del sol de póster: se recortan las franjas de abajo. */}
        <mask id="is4-sun-cut">
          <rect x="0" y="0" width="1200" height="440" fill="#fff" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x="700" y={236 + i * 14 + i * i * 0.6} width="400" height={2 + i * 1.6} fill="#000" />
          ))}
        </mask>
        <clipPath id="is4-above">
          <rect x="0" y="0" width="1200" height="300" />
        </clipPath>
      </defs>

      <rect width="1200" height="440" fill="url(#is4-sky)" />

      {/* Estrellas arriba, que aún se ven al caer la tarde. */}
      <g className="is4-stars">
        {[
          [80, 40, 1.6],
          [190, 22, 1.2],
          [320, 58, 1.4],
          [470, 26, 1.1],
          [560, 70, 1.5],
          [1010, 30, 1.3],
          [1120, 62, 1.6],
          [1060, 110, 1],
          [250, 110, 1],
          [660, 34, 1.2],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#fff" style={{ animationDelay: `${i * 0.37}s` }} />
        ))}
      </g>

      {/* Nubes alargadas que cruzan despacio. */}
      <g className="is4-clouds" fill="#ffb3a1" opacity="0.5">
        <rect x="120" y="150" width="260" height="10" rx="5" />
        <rect x="170" y="166" width="170" height="8" rx="4" />
        <rect x="760" y="120" width="300" height="11" rx="5.5" />
        <rect x="820" y="138" width="190" height="8" rx="4" />
      </g>

      {/* Sol a punto de tocar el mar, con su halo que late. */}
      <circle className="is4-halo" cx="900" cy="268" r="210" fill="url(#is4-glow)" />
      <g clipPath="url(#is4-above)">
        <circle className="is4-sun" cx="900" cy="268" r="118" fill="url(#is4-sun)" mask="url(#is4-sun-cut)" />
      </g>

      {/* Las islas del fondo y el Teide con su nieve. */}
      <path d="M0 300 L0 268 C 60 258, 110 262, 150 272 C 190 262, 240 268, 290 300 Z" fill="#7a3a7c" opacity="0.7" />
      <path d="M1040 300 C 1080 280, 1120 276, 1160 282 C 1180 284, 1200 288, 1200 300 Z" fill="#7a3a7c" opacity="0.6" />
      <path d="M180 300 C 260 290, 330 250, 400 196 C 430 172, 446 156, 468 150 C 486 156, 504 172, 532 194 C 600 246, 680 286, 790 300 Z" fill="url(#is4-teide)" />
      <path d="M432 176 C 446 162, 456 152, 468 150 C 482 154, 494 164, 508 176 C 498 182, 490 176, 482 184 C 474 176, 466 186, 456 178 C 448 186, 440 178, 432 176 Z" fill="#fbe6f0" opacity="0.92" />
      <path d="M440 300 C 470 288, 500 284, 540 284 C 580 284, 610 292, 640 300 Z" fill="#3d1b55" />

      {/* Mar: degradado, reflejo del sol en franjas que titilan y olas que avanzan. */}
      <rect y="300" width="1200" height="140" fill="url(#is4-sea)" />
      <g className="is4-shimmer" fill="#ffd27a">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={i} x={900 - (110 - i * 10)} y={306 + i * 15} width={(110 - i * 10) * 2} height="3.2" rx="1.6" opacity={0.85 - i * 0.08} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </g>
      {[0, 1, 2].map((row) => (
        <g key={row} className={`is4-wave is4-wave--${row}`}>
          <path
            d={`M-200 ${330 + row * 34} ${Array.from({ length: 16 }, (_, i) => `q 50 ${-10 + row * 2} 100 0`).join(' ')}`}
            fill="none"
            stroke="#8fe3ff"
            strokeOpacity={0.35 - row * 0.06}
            strokeWidth={2.2 + row}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* Velero que navega muy despacio. */}
      <g className="is4-boat">
        <path d="M0 0 L 34 0 L 28 8 L 6 8 Z" fill="#1a0f2e" />
        <path d="M16 -2 L16 -40 L 34 -4 Z" fill="#fff1dd" opacity="0.9" />
        <path d="M14 -4 L14 -32 L 2 -4 Z" fill="#ffcf9e" opacity="0.85" />
      </g>

      {/* Gaviotas. */}
      <g className="is4-birds" fill="none" stroke="#2a1440" strokeWidth="3" strokeLinecap="round">
        <path d="M0 0 q 9 -9 18 0 q 9 -9 18 0" />
        <path d="M44 -22 q 7 -7 14 0 q 7 -7 14 0" />
        <path d="M70 12 q 6 -6 12 0 q 6 -6 12 0" />
      </g>

      {/* Arena y palmeras en primer plano. */}
      <path d="M0 440 L0 392 C 90 372, 200 380, 300 406 C 360 422, 380 440, 380 440 Z" fill="#1a0f2e" />
      <path d="M1200 440 L1200 380 C 1120 370, 1030 384, 960 414 C 930 428, 920 440, 920 440 Z" fill="#1a0f2e" />
      <Palm x={70} y={410} s={1.25} delay={0} />
      <Palm x={190} y={420} s={0.85} flip delay={0.8} />
      <Palm x={1130} y={400} s={1.2} flip delay={0.4} />
      <Palm x={1030} y={424} s={0.75} delay={1.2} />
    </svg>
  )
}
