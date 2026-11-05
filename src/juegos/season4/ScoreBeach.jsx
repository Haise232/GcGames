// El Score en la Season 4: el podio de la semana en una playa al atardecer. Detrás, el cielo con el sol enorme y sus
// rayos girando justo detrás del primero, el mar con su reflejo, la isla con el Teide, palmeras, sombrillas y la silla
// del socorrista; los escalones del podio son castillos de arena con su bandera, y cae confeti encima. El aspecto, en
// score-beach.css. Fuera de la temporada (o con Halloween), el escenario no se ve y el podio queda como siempre.
import './score-beach.css'

// Los rayos: cuñas finas desde el centro del sol (500, 262).
const RAYS = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * Math.PI * 2
  const p = (b) => `${Math.round(500 + Math.cos(b) * 900)} ${Math.round(262 + Math.sin(b) * 900)}`
  return `M500 262 L${p(a - 0.07)} L${p(a + 0.07)} Z`
})
const CONFETTI = ['#ff5a4a', '#ffd25e', '#2ec4c0', '#ff7ab8', '#8fe3ff', '#7dd957', '#fff']

function Backdrop() {
  return (
    <svg className="sb-beach__svg" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sbb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1650" />
          <stop offset="0.38" stopColor="#7a3a8a" />
          <stop offset="0.72" stopColor="#ff6a5a" />
          <stop offset="1" stopColor="#ffbe6a" />
        </linearGradient>
        <radialGradient id="sbb-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.5" stopColor="#ffd25e" />
          <stop offset="0.8" stopColor="#ff9a4a" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ff7a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sbb-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a6a" />
          <stop offset="0.15" stopColor="#3a8ab0" />
          <stop offset="1" stopColor="#0f5a78" />
        </linearGradient>
        <linearGradient id="sbb-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d79a" />
          <stop offset="1" stopColor="#d9a860" />
        </linearGradient>
      </defs>
      <rect width="1000" height="270" fill="url(#sbb-sky)" />
      {/* Los rayos del sol, girando despacio justo detrás del primero. */}
      <g className="sb-beach__rays">
        {RAYS.map((d, k) => (
          <path key={k} d={d} />
        ))}
      </g>
      {Array.from({ length: 30 }, (_, k) => (
        <circle key={k} className="sb-beach__star" cx={(k * 137) % 1000} cy={10 + ((k * 61) % 110)} r={k % 4 ? 1.2 : 2} style={{ animationDelay: `${(k % 6) * 0.4}s` }} />
      ))}
      <g className="sb-beach__clouds" fill="#ffd0c0" opacity="0.5">
        <ellipse cx="180" cy="120" rx="80" ry="10" />
        <ellipse cx="230" cy="110" rx="50" ry="8" />
        <ellipse cx="800" cy="96" rx="90" ry="11" />
        <ellipse cx="850" cy="86" rx="46" ry="8" />
      </g>
      <circle className="sb-beach__sun" cx="500" cy="262" r="150" fill="url(#sbb-sun)" />
      {/* La isla de enfrente con el Teide nevado. */}
      <path d="M640 270 Q700 252 740 222 L770 196 L782 192 L796 198 Q830 232 900 262 L960 270 Z" fill="#3a1f4e" opacity="0.85" />
      <path d="M770 196 L782 192 L796 198 L788 202 L782 198 L776 203 Z" fill="#fff" opacity="0.85" />
      <path d="M40 270 Q90 256 140 262 Q200 248 260 270 Z" fill="#3a1f4e" opacity="0.6" />
      {/* El mar con el reflejo. */}
      <rect y="268" width="1000" height="80" fill="url(#sbb-sea)" />
      <g className="sb-beach__glint">
        {Array.from({ length: 8 }, (_, k) => (
          <rect key={k} x={500 - (30 + k * 26)} y={274 + k * 8} width={60 + k * 52} height="2.6" rx="1.3" fill="#ffe6a8" opacity={0.8 - k * 0.08} />
        ))}
      </g>
      <g className="sb-beach__boat">
        <path d="M150 300 h34 l-6 7 h-22 z" fill="#f4f4f4" />
        <path d="M167 300 V272 L186 298 Z" fill="#fff" />
        <path d="M167 276 V298 L152 298 Z" fill="#ff7a5a" />
      </g>
      {/* La arena con la espuma de la orilla. */}
      <path d="M0 420 V344 Q120 330 250 338 T500 334 T750 338 T1000 332 V420 Z" fill="url(#sbb-sand)" />
      <path className="sb-beach__foam" d="M0 344 Q60 334 120 340 T250 338 T380 336 T500 334 T620 337 T750 338 T880 334 T1020 332" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* Sombrillas, toallas, la silla del socorrista y conchas. */}
      {[
        [130, 392, '#ff5a4a'],
        [880, 396, '#2ec4c0'],
      ].map(([x, y, c]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path d="M0 0 V-46" stroke="#6a4a2a" strokeWidth="3" />
          <path d="M-36 -42 Q0 -72 36 -42 Z" fill={c} />
          <path d="M-36 -42 Q-18 -62 0 -66 Q-8 -52 -10 -42 Z M10 -42 Q8 -52 0 -66 Q18 -62 36 -42 Z" fill="#fff" />
          <rect x="-26" y="6" width="44" height="14" rx="3" fill={c} opacity="0.85" transform="rotate(-6)" />
        </g>
      ))}
      <g transform="translate(770 380)" stroke="#f2efe6" strokeWidth="3" fill="none">
        <path d="M-14 0 L-7 -52 M14 0 L7 -52 M-10 -28 H10 M-7 -52 H7" />
        <rect x="-12" y="-66" width="24" height="14" fill="#ff5a4a" stroke="none" />
      </g>
      <g fill="#ffb59a">
        <path d="M300 396 l8 -10 l8 10 z" />
        <circle cx="680" cy="402" r="4" />
        <path d="M420 404 l5 -7 l5 7 z" />
      </g>
      {/* Palmeras en los dos lados. */}
      {[
        [40, 1],
        [960, -1],
      ].map(([x, dir]) => (
        <g key={x} transform={`translate(${x} 410) scale(${dir} 1)`}>
          <path d="M0 0 Q14 -90 40 -170" stroke="#5a3a1e" strokeWidth="12" fill="none" strokeLinecap="round" />
          <path d="M0 0 Q14 -90 40 -170" stroke="#7a5230" strokeWidth="5" fill="none" strokeDasharray="5 9" />
          <g className="sb-beach__fronds">
            <path d="M40 -170 Q100 -192 132 -150 Q90 -170 40 -164 Z" />
            <path d="M40 -170 Q60 -226 22 -246 Q46 -206 38 -168 Z" />
            <path d="M40 -170 Q-12 -208 -48 -176 Q-6 -190 38 -166 Z" />
            <path d="M40 -170 Q104 -140 110 -92 Q80 -142 40 -164 Z" />
            <path d="M40 -170 Q0 -150 -14 -110 Q10 -150 40 -164 Z" />
          </g>
          <circle cx="36" cy="-164" r="7" fill="#6a3a12" />
          <circle cx="46" cy="-160" r="6" fill="#7a4a1a" />
        </g>
      ))}
      <g className="sb-beach__gulls" stroke="#2a1a3a" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M300 70 q8 -8 16 0 q8 -8 16 0" />
        <path d="M340 92 q6 -6 12 0 q6 -6 12 0" />
        <path d="M660 60 q8 -8 16 0 q8 -8 16 0" />
      </g>
    </svg>
  )
}

export function ScoreBeachStage({ children }) {
  return (
    <section className="sb-beach" aria-label="El podio en la playa">
      <div className="sb-beach__bg" aria-hidden="true">
        <Backdrop />
      </div>
      <div className="sb-beach__confetti" aria-hidden="true">
        {Array.from({ length: 28 }, (_, k) => (
          <i key={k} style={{ '--x': `${(k * 37) % 100}%`, '--d': `${(k % 9) * 0.55}s`, '--t': `${4.5 + (k % 5) * 0.8}s`, '--c': CONFETTI[k % CONFETTI.length], '--r': `${(k * 47) % 360}deg` }} />
        ))}
      </div>
      {children}
    </section>
  )
}
