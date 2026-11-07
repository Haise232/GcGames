// Escena del Campeonato de Pesca para su tarjeta del selector: el muelle de La Restinga al atardecer con un pescador peleando
// con un pez grande (sombra bajo el agua y salpicón), un bote con otra caña, banderines de la Cofradía, una copa y, al fondo,
// la sombra del marlín azul. Las animaciones (clases pcs-*) están en season4.css.
export function PescaScene() {
  const flags = ['#ff6b8a', '#ffe36e', '#3c8cff', '#3fbf7a', '#ff9a3c', '#ff6b8a', '#ffe36e', '#3c8cff', '#3fbf7a', '#ff9a3c']
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="pcs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a7a" />
          <stop offset="0.6" stopColor="#ff7a5a" />
          <stop offset="1" stopColor="#ffc35a" />
        </linearGradient>
        <linearGradient id="pcs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f08a6a" />
          <stop offset="0.18" stopColor="#1fa2b4" />
          <stop offset="1" stopColor="#06304e" />
        </linearGradient>
        <linearGradient id="pcs-glint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe36e" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffe36e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="240" height="62" fill="url(#pcs-sky)" />
      <circle cx="168" cy="62" r="20" fill="#ffe36e" opacity="0.9" />
      {/* Costa lejana de El Hierro. */}
      <path d="M96 62 Q120 50 140 54 Q150 50 166 56 Q190 52 240 60 V62 Z" fill="#3a1f55" />
      <rect y="62" width="240" height="98" fill="url(#pcs-sea)" />
      <path d="M150 62 H186 L196 110 H140 Z" fill="url(#pcs-glint)" opacity="0.5" />
      <g className="pcs-shimmer" stroke="#ffe9a8" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M156 68 h24" />
        <path d="M150 74 h34" />
        <path d="M158 81 h20" />
        <path d="M100 70 h12" />
        <path d="M214 72 h14" />
      </g>
      {/* Sombras de peces: una escuela de caballas, el marlín azul al fondo y el pez enganchado. */}
      <g fill="#031a30" opacity="0.5">
        <g className="pcs-school">
          <path d="M40 126 q8 -5 16 0 q-8 5 -16 0 Z M56 126 l5 -4 v8 Z" />
          <path d="M62 136 q8 -5 16 0 q-8 5 -16 0 Z M78 136 l5 -4 v8 Z" />
          <path d="M30 140 q8 -5 16 0 q-8 5 -16 0 Z M46 140 l5 -4 v8 Z" />
        </g>
        <g className="pcs-marlin" transform="translate(206 140)">
          <path d="M-34 0 L-56 -2 L-34 -1.2 Z" />
          <path d="M-30 -3 Q-18 -11 -2 -5 L-4 -14 Q-20 -18 -30 -3 Z" />
          <path d="M-32 0 C-22 -7 -6 -7 6 -2 C-6 5 -22 6 -32 0 Z" />
          <path d="M6 -2 L26 -2.6 L6 -0.6 Z" />
          <path d="M-30 0 L-40 -9 Q-37 0 -40 9 Z" />
        </g>
      </g>
      {/* El pez enganchado, luchando bajo el anzuelo. */}
      <g className="pcs-hooked" transform="translate(128 112)">
        <path d="M-22 0 L-34 -9 Q-30 0 -34 9 Z" fill="#031a30" opacity="0.7" />
        <path d="M-6 -8 Q0 -16 8 -7 Z" fill="#031a30" opacity="0.7" />
        <ellipse rx="22" ry="9" fill="#031a30" opacity="0.72" />
        <circle cx="14" cy="-2" r="1.6" fill="#8fe3ff" opacity="0.9" />
      </g>
      <path d="M128 100 q-3 4 0 8" stroke="#c8f6ff" strokeWidth="1" fill="none" opacity="0.6" />
      {/* Muelle de madera con sus pilotes. */}
      <g stroke="#1a0f2e" strokeWidth="1.4" strokeLinejoin="round">
        <rect x="14" y="68" width="5" height="34" fill="#4a2c18" />
        <rect x="46" y="68" width="5" height="34" fill="#4a2c18" />
        <rect x="76" y="68" width="5" height="34" fill="#4a2c18" />
        <path d="M0 70 H88 V77 H0 Z" fill="#a8703a" />
        <path d="M0 66 H88 V70 H0 Z" fill="#d49a58" />
      </g>
      <g stroke="#1a0f2e" strokeWidth="1" opacity="0.65" fill="none">
        <path d="M22 66 V70 M38 66 V70 M54 66 V70 M70 66 V70" />
      </g>
      <path d="M2 102 q6 -3 12 0 M50 103 q6 -3 12 0 M80 102 q6 -3 12 0" stroke="#c8f6ff" strokeWidth="1.2" fill="none" opacity="0.55" strokeLinecap="round" />
      {/* Copa del campeonato en el muelle. */}
      <g stroke="#1a0f2e" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M10 66 h12 v-3 h-12 Z" fill="#8a5a2a" />
        <path d="M14 63 h4 v-4 h-4 Z" fill="#ffd24a" />
        <path d="M10 49 h12 q0 10 -6 10 q-6 0 -6 -10 Z" fill="#ffd24a" />
        <path d="M10 51 q-5 0 -3 5 q1 2 4 2 M22 51 q5 0 3 5 q-1 2 -4 2" fill="none" />
        <path d="M13 51 q0 5 2 7" stroke="#fff6c8" fill="none" />
      </g>
      {/* Pescador con gorra, caña doblada y sedal tenso hasta el pez. */}
      <g className="pcs-rod">
        <g stroke="#1a0f2e" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
          <path d="M52 66 L54 52 L63 52 L64 66 Z" fill="#3c8cff" />
          <path d="M55 66 V60 M62 66 V60" fill="none" />
          <circle cx="58" cy="45" r="5.5" fill="#f2b98a" />
          <path d="M52 44 Q58 36 64 44 Z" fill="#ff6b5a" />
          <path d="M63 44 h6" fill="none" />
          <path d="M60 54 L70 56" fill="none" strokeWidth="2.4" stroke="#f2b98a" />
        </g>
        <path d="M66 58 Q100 18 124 42" stroke="#1a0f2e" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M66 58 Q100 18 124 42" stroke="#e9d9b0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="70" cy="57" r="3" fill="#ffd24a" stroke="#1a0f2e" strokeWidth="1.1" />
        <path className="pcs-line" d="M124 42 L129 101" stroke="#fff" strokeWidth="0.9" fill="none" opacity="0.95" />
      </g>
      {/* Salpicón donde el sedal toca el agua. */}
      <g className="pcs-splash" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
        <ellipse cx="129" cy="102" rx="9" ry="2.4" opacity="0.8" />
        <circle className="pcs-drop pcs-drop--a" cx="124" cy="96" r="1.6" fill="#fff" stroke="none" />
        <circle className="pcs-drop pcs-drop--b" cx="130" cy="92" r="1.9" fill="#fff" stroke="none" />
        <circle className="pcs-drop pcs-drop--c" cx="136" cy="96" r="1.5" fill="#fff" stroke="none" />
      </g>
      {/* Bote con otra caña. */}
      <g className="pcs-boat" transform="translate(196 96)">
        <path d="M-22 2 L22 2 L15 12 L-15 12 Z" fill="#ffffff" stroke="#1a0f2e" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M-20 4.5 H20" stroke="#ff6b5a" strokeWidth="2.2" />
        <path d="M6 2 V-8 H14 V2" fill="#ffb547" stroke="#1a0f2e" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M-6 2 Q-8 -6 -4 -10 Q0 -6 -2 2 Z" fill="#f2b98a" stroke="#1a0f2e" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M-14 0 L-34 -22" stroke="#1a0f2e" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M-14 0 L-34 -22" stroke="#e9d9b0" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M-34 -22 Q-37 -4 -36 8" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.9" />
        <path d="M-22 14 Q-10 17 4 14 T28 14" stroke="#c8f6ff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
      </g>
      {/* Banderines de la Cofradía de Pescadores. */}
      <g className="pcs-bunting">
        <path d="M-2 6 Q60 20 120 10 T242 8" stroke="#1a0f2e" strokeWidth="1.2" fill="none" />
        {flags.map((c, i) => {
          const x = 8 + i * 24
          const y = 11 + Math.sin((i / 9) * Math.PI) * 5 - (i > 4 ? (i - 4) * 0.4 : 0)
          return <path key={i} d={`M${x} ${y} h10 l-5 10 Z`} fill={c} stroke="#1a0f2e" strokeWidth="1" strokeLinejoin="round" />
        })}
      </g>
    </svg>
  )
}
