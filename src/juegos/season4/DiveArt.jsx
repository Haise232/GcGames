// Escena de Buceo de Perlas para su tarjeta del selector: el buzo bajando entre rayos de luz hacia una ostra abierta con
// una perla que brilla, burbujas y algas. Las animaciones (clases dvs-*) están en season4.css.
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
        <radialGradient id="dvs-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6f0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd9f0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dvs-pearl" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e8c8e0" />
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
      <path d="M150 160 Q154 140 164 146 Q168 128 178 140 Q186 132 190 160 Z" fill="#ff6b8a" opacity="0.85" />
      {/* La ostra con la perla. */}
      <circle className="dvs-shine" cx="96" cy="128" r="34" fill="url(#dvs-glow)" />
      <path d="M66 136 Q96 156 126 136 Q96 142 66 136 Z" fill="#8a7a9a" stroke="#3a2a4a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M66 136 Q70 106 96 106 Q122 106 126 136 Q96 126 66 136 Z" fill="#a898b8" stroke="#3a2a4a" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="96" cy="134" r="9" fill="url(#dvs-pearl)" stroke="rgba(0,0,0,0.2)" />
      <circle cx="93" cy="131" r="2.5" fill="#fff" />
      {/* El buzo. */}
      <g className="dvs-diver" transform="translate(132 34) rotate(28)">
        <rect x="0" y="6" width="10" height="26" rx="5" fill="#ffb547" stroke="#6a3a10" strokeWidth="2" />
        <path d="M6 12 Q24 8 36 16 L34 24 Q22 20 8 24 Z" fill="#1f4a7a" stroke="#0a1a30" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="38" cy="16" r="8" fill="#ffd9b8" stroke="#6a3a20" strokeWidth="2" />
        <rect x="34" y="11" width="12" height="7" rx="3" fill="#8fe3ff" stroke="#0a1a30" strokeWidth="2" />
        <path d="M8 22 L-6 36 M12 24 L2 42" stroke="#1f4a7a" strokeWidth="5" strokeLinecap="round" />
        <path d="M-10 34 L-2 40 M-2 40 L2 48" stroke="#2ee6d0" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g className="dvs-bubbles" fill="none" stroke="#c8f6ff" strokeWidth="1.5">
        <circle cx="176" cy="40" r="3" />
        <circle cx="182" cy="28" r="2" />
        <circle cx="178" cy="18" r="1.4" />
      </g>
    </svg>
  )
}
