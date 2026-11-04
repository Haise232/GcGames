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
      {/* Tiburón al fondo. */}
      <g className="pzs-shark" opacity="0.55">
        <path d="M0 0 C 20 -12, 60 -12, 80 0 C 60 10, 20 10, 0 0 Z" fill="#4a5e78" />
        <path d="M30 -8 L 22 -26 L 46 -9 Z" fill="#4a5e78" />
        <path d="M0 0 L -16 -12 L -12 0 L -16 12 Z" fill="#4a5e78" />
        <circle cx="66" cy="-2" r="2" fill="#fff" />
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
        <path d="M-10 0 L -18 -6 L -17 0 L -18 6 Z" fill="#1b8fa8" />
        <ellipse rx="11" ry="7" fill="#2ee6d0" />
        <circle cx="6" cy="-2" r="2" fill="#fff" />
        <circle cx="6.5" cy="-2" r="1" fill="#10142a" />
      </g>
      {/* El pez payaso con la boca abierta. */}
      <g className="pzs-me" transform="translate(110 92)">
        <path d="M-34 0 L -56 -22 L -50 0 L -56 22 Z" fill="#e2562f" />
        <path d="M-16 -24 Q 0 -44 16 -24 Z" fill="#e2562f" />
        <ellipse rx="40" ry="28" fill="url(#pzs-me)" stroke="#2a0f2e" strokeWidth="2.5" />
        <rect x="-18" y="-28" width="9" height="56" fill="#fff6e8" opacity="0.95" />
        <rect x="8" y="-27" width="9" height="54" fill="#fff6e8" opacity="0.95" />
        <circle cx="24" cy="-8" r="7" fill="#fff" />
        <circle cx="26" cy="-8" r="3.6" fill="#10142a" />
        <path className="pzs-mouth" d="M40 4 L 26 10 L 40 16 Z" fill="#2a0f2e" />
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
