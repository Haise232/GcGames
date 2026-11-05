// Escena de la Regata para su tarjeta del selector: tres veleros de colores sobre el mar al atardecer, con la isla y su
// volcán al fondo, la boya de llegada, un rayo que cae de una nube de tormenta y un tentáculo del Kraken que asoma. Las animaciones (clases rgs-*) están en season4.css.
export function RegattaScene() {
  const boats = [
    ['#ff6b8a', '#ffe0ea', 64, 112, 0],
    ['#3c8cff', '#dce9ff', 118, 128, 1],
    ['#ffb547', '#fff4d6', 168, 108, 2],
  ]
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rgs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a7a" />
          <stop offset="0.65" stopColor="#ff7a5a" />
          <stop offset="1" stopColor="#ffc35a" />
        </linearGradient>
        <linearGradient id="rgs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1fa2b4" />
          <stop offset="1" stopColor="#0a4a6a" />
        </linearGradient>
      </defs>
      <rect width="240" height="80" fill="url(#rgs-sky)" />
      <circle cx="186" cy="76" r="22" fill="#ffe36e" opacity="0.9" />
      <path d="M20 80 Q50 72 72 56 L92 40 Q98 36 104 40 L128 58 Q150 74 176 80 Z" fill="#3a1f55" />
      <rect y="80" width="240" height="80" fill="url(#rgs-sea)" />
      <g className="rgs-waves" stroke="#c8f6ff" strokeWidth="1.6" fill="none" opacity="0.4" strokeLinecap="round">
        <path d="M14 96 q8 -4 16 0 t16 0" />
        <path d="M150 142 q8 -4 16 0 t16 0" />
        <path d="M200 100 q8 -4 16 0 t16 0" />
        <path d="M30 148 q8 -4 16 0 t16 0" />
      </g>
      <g className="rgs-buoy">
        <path d="M222 120 V96" stroke="#fff" strokeWidth="2" />
        <path d="M222 96 L236 101 L222 106 Z" fill="#ff6b5a" />
        <circle cx="222" cy="122" r="6" fill="#ff6b5a" stroke="#fff" strokeWidth="2" />
      </g>
      {/* Nube de tormenta con su rayo y el tentáculo del Kraken al fondo a la derecha. */}
      <g className="rgs-storm">
        <ellipse cx="46" cy="22" rx="34" ry="11" fill="#1c1a3c" opacity="0.85" />
        <ellipse cx="70" cy="16" rx="22" ry="9" fill="#1c1a3c" opacity="0.85" />
        <path className="rgs-bolt" d="M52 30 L44 46 L52 48 L42 68" fill="none" stroke="#fffbe0" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <g className="rgs-tentacle">
        <path d="M196 150 C 184 132 206 124 198 104" stroke="#4a1f78" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M196 150 C 184 132 206 124 198 104" stroke="#7a42b8" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M196 150 C 184 132 206 124 198 104" stroke="#e6c8ff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeDasharray="0 7" />
      </g>
      {boats.map(([hull, sail, x, y, i]) => (
        <g key={hull} className={`rgs-boat rgs-boat--${i}`} transform={`translate(${x} ${y})`}>
          <path d="M-18 4 L18 4 L12 12 L-12 12 Z" fill={hull} stroke="#0a1a30" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M-1 3 V-30" stroke="#5a3a1a" strokeWidth="2.4" />
          <path d="M0 -28 Q16 -12 14 1 L0 1 Z" fill={sail} stroke="#0a1a30" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M-3 -25 Q-13 -10 -11 1 L-3 1 Z" fill={sail} opacity="0.85" stroke="#0a1a30" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M-18 9 Q-28 8 -38 11" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        </g>
      ))}
    </svg>
  )
}
