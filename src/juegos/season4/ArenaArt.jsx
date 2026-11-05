// Escena de Tesoro en la Arena para su tarjeta del selector: la playa con el mar, un hoyo con un cofre que brilla, un
// cangrejo que asoma de otro montón y una pala clavada. Las animaciones (clases ars-*) están en season4.css.
export function ArenaScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="ars-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dca0" />
          <stop offset="1" stopColor="#dcae62" />
        </linearGradient>
        <linearGradient id="ars-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b8fa8" />
          <stop offset="1" stopColor="#2ee6d0" />
        </linearGradient>
        <radialGradient id="ars-shine" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="160" fill="url(#ars-sand)" />
      <rect width="240" height="42" fill="url(#ars-sea)" />
      <path className="ars-wave" d="M-30 40 Q -15 34 0 40 T 30 40 T 60 40 T 90 40 T 120 40 T 150 40 T 180 40 T 210 40 T 240 40 T 270 40 V50 H-30 Z" fill="#c8f6ff" opacity="0.9" />
      {/* Montones de arena. */}
      <g fill="#f0cf8a">
        {[
          [36, 78],
          [204, 74],
          [62, 132],
          [186, 136],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <ellipse cx={x} cy={y + 8} rx="20" ry="5" fill="#c99a52" opacity="0.5" />
            <path d={`M${x - 18} ${y + 8} Q ${x - 10} ${y - 8} ${x} ${y - 9} Q ${x + 10} ${y - 8} ${x + 18} ${y + 8} Z`} />
          </g>
        ))}
      </g>
      {/* El hoyo con el cofre y su brillo. */}
      <circle className="ars-shine" cx="120" cy="92" r="46" fill="url(#ars-shine)" />
      <ellipse cx="120" cy="112" rx="40" ry="14" fill="#8a5a26" />
      <ellipse cx="120" cy="110" rx="34" ry="10" fill="#6a3e14" />
      <g className="ars-chest" transform="translate(120 100)">
        <rect x="-20" y="-6" width="40" height="22" rx="3" fill="#a8652a" stroke="#4a2408" strokeWidth="2.5" />
        <path d="M-20 -4 Q -20 -24 0 -24 Q 20 -24 20 -4 Z" fill="#c07a34" stroke="#4a2408" strokeWidth="2.5" />
        <path d="M-20 -1 H20 M-8 -23 V16 M8 -23 V16" stroke="#ffd25e" strokeWidth="3" />
        <rect x="-4" y="-5" width="8" height="9" rx="1.5" fill="#ffd25e" stroke="#4a2408" strokeWidth="1.5" />
        <g fill="#ffd25e" stroke="#8a5a06" strokeWidth="1.2">
          <circle cx="-12" cy="-26" r="4" />
          <circle cx="2" cy="-28" r="4" />
          <circle cx="13" cy="-25" r="4" />
        </g>
      </g>
      <path className="ars-spark" d="M150 66 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 Z" fill="#fff" />
      <path className="ars-spark ars-spark--2" d="M92 70 l2 4.5 l4.5 2 l-4.5 2 l-2 4.5 l-2 -4.5 l-4.5 -2 l4.5 -2 Z" fill="#fff" />
      {/* Pala clavada. */}
      <g transform="rotate(18 168 108)">
        <path d="M168 66 V104" stroke="#8a5a2a" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M160 66 H176" stroke="#8a5a2a" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M159 102 H177 V112 Q168 124 159 112 Z" fill="#cfd8e0" stroke="#4a5868" strokeWidth="2" />
      </g>
      {/* Cangrejo que asoma. */}
      <g className="ars-crab" transform="translate(204 70)">
        <path d="M-12 -6 C -20 -9, -20 -17, -14 -17 L -11 -12 L -8 -16 C -5 -13, -7 -7, -12 -6 Z" fill="#ff5a3c" stroke="#6a120c" strokeWidth="1.6" className="ars-claw" />
        <path d="M12 -6 C 20 -9, 20 -17, 14 -17 L 11 -12 L 8 -16 C 5 -13, 7 -7, 12 -6 Z" fill="#ff5a3c" stroke="#6a120c" strokeWidth="1.6" className="ars-claw ars-claw--r" />
        <ellipse cx="0" cy="0" rx="12" ry="7" fill="#ff5a3c" stroke="#6a120c" strokeWidth="1.6" />
        <path d="M-4 -5 V-11 M4 -5 V-11" stroke="#6a120c" strokeWidth="1.6" />
        <circle cx="-4" cy="-12" r="2.6" fill="#fff" stroke="#6a120c" strokeWidth="1.2" />
        <circle cx="4" cy="-12" r="2.6" fill="#fff" stroke="#6a120c" strokeWidth="1.2" />
        <circle cx="-3.6" cy="-11.6" r="1.2" fill="#1a0a08" />
        <circle cx="3.6" cy="-11.6" r="1.2" fill="#1a0a08" />
      </g>
      {/* Estrella de mar y concha. */}
      <path d="M30 120 l3 7 l7.5 0.5 l-6 5 l2 7.5 l-6.5 -4 l-6.5 4 l2 -7.5 l-6 -5 l7.5 -0.5 Z" fill="#ff8a4c" stroke="#8a2f10" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M214 120 L204 108 A10 10 0 0 1 224 108 Z" fill="#ffd9c2" stroke="#9a4a2a" strokeWidth="1.5" />
    </svg>
  )
}
