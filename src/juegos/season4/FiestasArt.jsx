import './fiestas.css'
// Escenas de los juegos de las Fiestas para sus tarjetas del selector: el cartón del Rasca medio rascado, las cartas
// de Mayor o Menor sobre el mantel de cuadros y la cancha de la Bola Canaria con el mingue. Animaciones en fiestas.css.
export function RascaScene() {
  const cells = ['🌳', '🥔', '🌳', '🍌', '🌳', '🌶️', null, null, null]
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rss-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1446" />
          <stop offset="1" stopColor="#6a2a6a" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" fill="url(#rss-night)" />
      <path d="M-5 10 Q120 40 245 10" stroke="#ffe7a8" strokeOpacity="0.5" fill="none" />
      {Array.from({ length: 12 }, (_, k) => {
        const x = 5 + k * 20
        const t = (x + 5) / 250
        const y = 10 + 60 * t * (1 - t)
        return <path key={k} d={`M${x - 6} ${y} L${x + 6} ${y} L${x} ${y + 11} Z`} fill={['#e8443a', '#f2b632', '#2f8fd8', '#3fae5a'][k % 4]} />
      })}
      <g transform="translate(120 96) rotate(-6)">
        <rect x="-58" y="-56" width="116" height="112" rx="10" fill="#fff6e2" stroke="#e8443a" strokeWidth="4" />
        <text y="-40" textAnchor="middle" fontSize="11" fontWeight="800" fill="#e8443a">
          RASCA
        </text>
        {cells.map((c, i) => {
          const x = -42 + (i % 3) * 30
          const y = -32 + Math.floor(i / 3) * 28
          return (
            <g key={i}>
              <rect x={x - 2} y={y} width="26" height="24" rx="5" fill={c ? '#fff3c8' : '#c4cbd2'} className={c === '🌳' ? 'fis-win' : undefined} />
              {c ? (
                <text x={x + 11} y={y + 17} textAnchor="middle" fontSize="15">
                  {c}
                </text>
              ) : (
                <text x={x + 11} y={y + 17} textAnchor="middle" fontSize="13" fill="#7a8490" fontWeight="800">
                  ?
                </text>
              )}
            </g>
          )
        })}
      </g>
      <text x="196" y="150" fontSize="22" className="fis-coin">
        🪙
      </text>
    </svg>
  )
}

export function HiloScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="his-check" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#f6efe2" />
          <rect width="12" height="12" fill="#d8453a" />
          <rect x="12" y="12" width="12" height="12" fill="#d8453a" />
        </pattern>
      </defs>
      <rect width="240" height="160" fill="#4a2810" />
      <rect x="10" y="12" width="220" height="140" fill="url(#his-check)" opacity="0.9" transform="rotate(-3 120 80)" />
      <g transform="translate(78 82) rotate(-10)">
        <rect x="-26" y="-38" width="52" height="76" rx="6" fill="#fffaf0" stroke="#a26a06" strokeWidth="3" />
        <text x="-18" y="-20" fontSize="14" fontWeight="800" fill="#a26a06">
          7
        </text>
        <circle r="13" fill="#f2b632" stroke="#8a5a06" strokeWidth="2" />
        <circle r="5" fill="#e8443a" />
      </g>
      <g transform="translate(150 78) rotate(8)" className="fis-flip">
        <rect x="-26" y="-38" width="52" height="76" rx="6" fill="#fffaf0" stroke="#b5261c" strokeWidth="3" />
        <text x="-18" y="-20" fontSize="14" fontWeight="800" fill="#b5261c">
          12
        </text>
        <text y="12" textAnchor="middle" fontSize="26">
          👑
        </text>
      </g>
      <g fontSize="22" fontWeight="900">
        <text x="196" y="52" fill="#3fae5a" className="fis-up">
          ▲
        </text>
        <text x="196" y="126" fill="#e8443a">
          ▼
        </text>
      </g>
    </svg>
  )
}

export function BolaScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="bls-dirt" cx="0.5" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#d9a86a" />
          <stop offset="1" stopColor="#a8723a" />
        </radialGradient>
      </defs>
      <rect width="240" height="160" fill="#2a5a3a" />
      <rect x="40" y="6" width="160" height="148" rx="6" fill="url(#bls-dirt)" stroke="#e8dcc0" strokeWidth="4" />
      {[42, 28, 16].map((r) => (
        <circle key={r} cx="120" cy="56" r={r} fill="none" stroke="#fffae6" strokeOpacity="0.55" strokeDasharray="4 3" />
      ))}
      <circle cx="120" cy="56" r="5" fill="#fffaf0" stroke="#9a8a6a" />
      <circle cx="104" cy="70" r="9" fill="#2f6ab0" stroke="#163a6a" strokeWidth="1.5" />
      <g className="fis-roll">
        <circle cx="132" cy="62" r="9" fill="#d8352a" stroke="#6a120c" strokeWidth="1.5" />
        <path d="M126 59 Q132 54 138 59" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
      </g>
      <path d="M120 140 Q124 110 130 70" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="3 4" fill="none" />
    </svg>
  )
}
