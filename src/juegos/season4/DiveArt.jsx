// Escena de Apnea para su tarjeta del selector: un apneísta bajando con los brazos por delante y las aletas largas entre
// rayos de luz, con burbujas que se le escapan, y abajo, en lo oscuro, la sombra de un tiburón con el ojo encendido.
// Las animaciones (clases dvs-*) están en season4.css.
export function DiveScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="dvs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2ec4c0" />
          <stop offset="0.5" stopColor="#137a9a" />
          <stop offset="1" stopColor="#071e3c" />
        </linearGradient>
        <linearGradient id="dvs-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="dvs-dark" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#020a1c" stopOpacity="0.85" />
          <stop offset="1" stopColor="#020a1c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="160" fill="url(#dvs-sea)" />
      <g className="dvs-rays">
        <path d="M40 0 L70 0 L30 130 L10 130 Z" fill="url(#dvs-ray)" />
        <path d="M150 0 L180 0 L200 140 L170 140 Z" fill="url(#dvs-ray)" />
      </g>
      <g fill="none" strokeLinecap="round" strokeWidth="5">
        <path className="dvs-weed" d="M14 160 Q4 130 16 110 T 10 76" stroke="#2fae5e" />
        <path className="dvs-weed" d="M226 160 Q236 132 222 112 T 230 84" stroke="#3cc46c" />
      </g>
      <rect y="70" width="240" height="90" fill="url(#dvs-dark)" />
      {/* El tiburón, en lo hondo. */}
      <g className="dvs-shark" transform="translate(172 128)">
        <path d="M-40 0 Q-22 -11 6 -8 L14 -20 L17 -8 Q32 -6 42 0 Q32 6 17 7 Q0 14 -20 10 L-32 18 L-28 7 Q-36 4 -40 0 Z" fill="#2a4e72" stroke="#0a1a30" strokeWidth="1.5" strokeLinejoin="round" />
        <circle className="dvs-shine" cx="30" cy="-2" r="2.2" fill="#ff4f6a" />
      </g>
      {/* El apneísta: cabeza abajo, brazos por delante y monoaleta. */}
      <g className="dvs-diver" transform="translate(108 94) rotate(64) scale(0.66)">
        <path d="M-26 6 Q-40 -6 -48 4 Q-40 8 -30 12 Z" fill="#2ee6d0" stroke="#0a1a30" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M-26 9 L-4 9" stroke="#1f4a7a" strokeWidth="7" strokeLinecap="round" />
        <path d="M-6 4 Q14 0 30 8 L28 16 Q12 14 -6 14 Z" fill="#1f4a7a" stroke="#0a1a30" strokeWidth="2" strokeLinejoin="round" />
        <path d="M26 9 L46 9" stroke="#1f4a7a" strokeWidth="5" strokeLinecap="round" />
        <circle cx="26" cy="12" r="7.5" fill="#ffd9b8" stroke="#6a3a20" strokeWidth="2" />
        <rect x="26" y="8" width="10" height="6" rx="3" fill="#8fe3ff" stroke="#0a1a30" strokeWidth="1.8" />
      </g>
      <g className="dvs-bubbles" fill="none" stroke="#c8f6ff" strokeWidth="1.5">
        <circle cx="116" cy="104" r="3" />
        <circle cx="120" cy="92" r="2" />
        <circle cx="115" cy="82" r="1.4" />
      </g>
    </svg>
  )
}
