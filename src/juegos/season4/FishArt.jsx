// Escena de Pez Gordo para su tarjeta del selector y la portada de entrada: el pez payaso a punto de comerse a uno
// pequeño, plancton que brilla y un tiburón que acecha al fondo. Las animaciones (clases pzs-*) están en season4.css.
export function FishScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="pzs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b8fa8" />
          <stop offset="1" stopColor="#06223d" />
        </linearGradient>
        <linearGradient id="pzs-me" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb547" />
          <stop offset="1" stopColor="#e2562f" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" fill="url(#pzs-sea)" />
      <g fill="#c8f6ff" opacity="0.08">
        <path d="M30 0 L60 0 L110 160 L70 160 Z" />
        <path d="M150 0 L170 0 L215 160 L190 160 Z" />
      </g>
      {/* Tiburón al fondo, con la boca abierta. */}
      <g className="pzs-shark" opacity="0.6">
        <path d="M0 0 C 20 -13, 62 -13, 86 -2 L 74 3 L 86 6 C 62 12, 20 11, 0 0 Z" fill="#6f8aa6" />
        <path d="M6 3 C 26 10, 60 11, 84 5 L 74 3 Z" fill="#eef4f8" />
        <path d="M30 -9 Q 30 -24 22 -30 Q 42 -20 48 -10 Z" fill="#56708c" />
        <path d="M0 0 L -18 -16 Q -12 -2 -14 2 L -16 12 Z" fill="#56708c" />
        <path d="M76 3 l2 3 l2 -3 M80 4 l2 2.5 l2 -2.5" stroke="#fff" strokeWidth="1.2" fill="none" />
        <path d="M58 -4 q -2 4 0 7 M54 -4 q -2 4 0 7 M50 -4 q -2 4 0 7" stroke="#1d2b3c" strokeWidth="1" fill="none" opacity="0.6" />
        <circle cx="70" cy="-4" r="1.8" fill="#0a0f1a" />
        <path d="M65 -9 L 73 -6" stroke="#1d2b3c" strokeWidth="1.6" />
      </g>
      {/* Fondo: arena, algas y coral. */}
      <path d="M0 150 Q 60 138 120 148 T 240 146 V160 H0 Z" fill="#e8c98a" opacity="0.35" />
      <g className="pzs-weed" stroke="#3fbf7a" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M18 160 Q 10 140 20 124 T 16 96" />
        <path d="M26 160 Q 34 142 24 128 T 30 106" />
        <path d="M222 160 Q 214 138 224 120" />
      </g>
      <g stroke="#ff6b8a" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.8">
        <path d="M196 160 V 140 M196 146 L 186 134 M196 142 L 206 130 M186 134 L 182 126 M206 130 L 212 124" />
      </g>
      {/* Plancton. */}
      <g className="pzs-plankton">
        {[
          [30, 120, '#2ee6d0'],
          [58, 40, '#ffe36e'],
          [200, 120, '#ff5fa2'],
          [180, 30, '#8fe3ff'],
          [120, 140, '#b6ff7a'],
          [215, 70, '#ffe36e'],
          [20, 70, '#ff8a4c'],
        ].map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 4 : 3} fill={c} style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      </g>
      {/* Pez pequeño que huye. */}
      <g className="pzs-small" transform="translate(178 92)">
        <path d="M-9 0 L -19 -8 Q -16 0 -19 8 Z" fill="#1fb8c4" stroke="#0b3d4f" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M-6 -6 Q 0 -13 6 -6 Z" fill="#1fb8c4" stroke="#0b3d4f" strokeWidth="1" />
        <ellipse rx="11" ry="7" fill="#5ff2dc" stroke="#0b3d4f" strokeWidth="1.2" />
        <path d="M-4 -6.5 V 6.5 M1 -7 V 7" stroke="#0b3d4f" strokeWidth="1.6" opacity="0.25" />
        <circle cx="6" cy="-2" r="2.4" fill="#fff" stroke="#0b3d4f" strokeWidth="0.8" />
        <circle cx="6.6" cy="-2" r="1.2" fill="#10142a" />
        <path d="M10 2 q -2 2 -4 1" stroke="#0b3d4f" strokeWidth="1" fill="none" />
      </g>
      {/* El pez payaso con la boca abierta. */}
      <g className="pzs-me" transform="translate(110 92)">
        <path d="M-34 0 Q -48 -10 -58 -26 Q -50 0 -58 26 Q -48 10 -34 0 Z" fill="#ff7a2a" stroke="#2a0f2e" strokeWidth="3" strokeLinejoin="round" />
        <path d="M-22 -24 Q -10 -46 14 -26 Z" fill="#ff7a2a" stroke="#2a0f2e" strokeWidth="3" strokeLinejoin="round" />
        <path d="M-14 24 Q -4 38 8 26 Z" fill="#ff7a2a" stroke="#2a0f2e" strokeWidth="2.5" strokeLinejoin="round" />
        <clipPath id="pzs-body">
          <path d="M42 -2 L 30 8 L 42 14 C 36 26, 10 32, -10 28 C -30 24, -42 12, -42 0 C -42 -12, -30 -26, -10 -28 C 12 -32, 38 -24, 42 -2 Z" />
        </clipPath>
        <path d="M42 -2 L 30 8 L 42 14 C 36 26, 10 32, -10 28 C -30 24, -42 12, -42 0 C -42 -12, -30 -26, -10 -28 C 12 -32, 38 -24, 42 -2 Z" fill="url(#pzs-me)" />
        <g clipPath="url(#pzs-body)">
          {[
            [20, 6],
            [-8, 8],
            [-35, 4],
          ].map(([x, wd]) => (
            <g key={x}>
              <rect x={x - wd / 2 - 2.2} y="-40" width={wd + 4.4} height="80" fill="#2a0f2e" />
              <rect x={x - wd / 2} y="-40" width={wd} height="80" fill="#fff8ee" />
            </g>
          ))}
          <ellipse cx="0" cy="-16" rx="34" ry="10" fill="#fff" opacity="0.22" />
        </g>
        <path d="M42 -2 L 30 8 L 42 14 C 36 26, 10 32, -10 28 C -30 24, -42 12, -42 0 C -42 -12, -30 -26, -10 -28 C 12 -32, 38 -24, 42 -2 Z" fill="none" stroke="#2a0f2e" strokeWidth="3" strokeLinejoin="round" />
        <ellipse className="pzs-fin" cx="2" cy="8" rx="9" ry="4.5" fill="#ff7a2a" stroke="#2a0f2e" strokeWidth="2" transform="rotate(30 2 8)" />
        <circle cx="25" cy="-10" r="7.5" fill="#fff" stroke="#2a0f2e" strokeWidth="2" />
        <circle cx="27" cy="-9.5" r="4.2" fill="#3a1a08" />
        <circle cx="28.8" cy="-11.6" r="1.6" fill="#fff" />
      </g>
      {/* Burbujas. */}
      <g className="pzs-bubbles" fill="none" stroke="#c8f6ff" strokeWidth="1.4" opacity="0.6">
        <circle cx="156" cy="70" r="3" />
        <circle cx="162" cy="58" r="2" />
        <circle cx="152" cy="48" r="2.5" />
      </g>
    </svg>
  )
}
