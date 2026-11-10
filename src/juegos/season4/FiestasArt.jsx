import './fiestas.css'
// Escena de Mayor o Menor para su tarjeta del selector: las cartas sobre el mantel de
// cuadros. Animaciones en fiestas.css.
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
