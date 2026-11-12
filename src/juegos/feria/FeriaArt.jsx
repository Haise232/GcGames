// Escenas de las tarjetas del selector de la Feria de las Islas (la noria y el paseo de puestos) y del Tira y Afloja
// (la cuerda entre el rojo y el azul). Mismo formato que las de hub/HubArt.jsx: 240×160 y la clase hub-scene.
import '../estilos/scenes.css'

const STALLS = ['#4fc38a', '#35b6c9', '#5b8def', '#e2674a', '#e8b04a', '#d65aa0', '#9b6cf0']

export function FeriaScene() {
  const cabins = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return { x: 120 + 44 * Math.cos(a), y: 70 + 44 * Math.sin(a), color: STALLS[i % STALLS.length] }
  })
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-fe-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101a33" />
          <stop offset="1" stopColor="#1f3a5a" />
        </linearGradient>
        <radialGradient id="hs-fe-glow" cx="0.5" cy="0.45" r="0.5">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="160" fill="url(#hs-fe-sky)" />
      <circle cx="120" cy="72" r="86" fill="url(#hs-fe-glow)" />
      {[
        [22, 20],
        [58, 34],
        [196, 18],
        [220, 46],
        [170, 30],
        [34, 62],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#fff" opacity="0.7" />
      ))}
      {/* La noria */}
      <path d="M120 70 L98 136 M120 70 L142 136" stroke="#c9d6ea" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="120" cy="70" r="44" fill="none" stroke="#e9f1ff" strokeWidth="3" />
      <circle cx="120" cy="70" r="30" fill="none" stroke="#e9f1ff" strokeWidth="1.2" opacity="0.6" />
      {cabins.map((c) => (
        <line key={`l-${c.color}-${c.x}`} x1="120" y1="70" x2={c.x} y2={c.y} stroke="#e9f1ff" strokeWidth="1.2" opacity="0.7" />
      ))}
      {cabins.map((c) => (
        <rect key={`c-${c.x}`} x={c.x - 7} y={c.y - 3} width="14" height="12" rx="4" fill={c.color} />
      ))}
      <circle cx="120" cy="70" r="6" fill="#ffd25e" />
      {/* El paseo: los puestos de las siete islas */}
      <rect y="132" width="240" height="28" fill="#0b1424" />
      {STALLS.map((color, i) => (
        <g key={color} transform={`translate(${18 + i * 34} 140)`}>
          <circle r="13" fill="#141d2c" />
          <path d="M-13 0 A13 13 0 0 1 13 0 Z" fill={color} />
          <circle r="13" fill="none" stroke={color} strokeWidth="1.6" />
        </g>
      ))}
      {/* Banderines */}
      <path d="M0 14 Q60 34 120 16 T240 14" fill="none" stroke="#e9f1ff" strokeWidth="1" opacity="0.6" />
      {Array.from({ length: 11 }, (_, i) => {
        const x = 12 + i * 22
        const y = 16 + 9 * Math.sin((x / 240) * Math.PI * 2 + 0.2) * (x < 120 ? 1 : -0.4) + (x < 120 ? 4 : 2)
        return <path key={i} d={`M${x - 5} ${y} L${x + 5} ${y} L${x} ${y + 9} Z`} fill={STALLS[i % STALLS.length]} />
      })}
      {/* Dados */}
      <g transform="translate(196 104) rotate(-12)">
        <rect x="-13" y="-13" width="26" height="26" rx="6" fill="#f4efe2" />
        {[
          [-6, -6],
          [6, 6],
          [0, 0],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="#1a2233" />
        ))}
      </g>
      <g transform="translate(44 108) rotate(14)">
        <rect x="-11" y="-11" width="22" height="22" rx="5" fill="#f4efe2" />
        {[
          [-5, -5],
          [5, -5],
          [-5, 5],
          [5, 5],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#1a2233" />
        ))}
      </g>
    </svg>
  )
}

export function SogaScene() {
  return (
    <svg className="hub-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hs-sg-bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a1f2b" />
          <stop offset="0.5" stopColor="#141c2c" />
          <stop offset="1" stopColor="#1b3f8f" />
        </linearGradient>
        <pattern id="hs-sg-rope" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(25)">
          <rect width="10" height="10" fill="#d9b47a" />
          <rect width="5" height="10" fill="#b98d54" />
        </pattern>
      </defs>
      <rect width="240" height="160" fill="url(#hs-sg-bg)" />
      <rect y="118" width="240" height="42" fill="#0b1220" opacity="0.7" />
      <line x1="120" y1="40" x2="120" y2="124" stroke="#fff" strokeWidth="2" strokeDasharray="5 6" opacity="0.5" />
      {/* Uno de cada equipo, echado hacia atrás y agarrado a la cuerda */}
      {[
        [46, '#ff5a5f', 1],
        [194, '#3d8cff', -1],
      ].map(([x, color, dir]) => (
        <g key={x} transform={`translate(${x} 128) rotate(${-14 * dir})`}>
          <rect x="-9" y="-22" width="7" height="24" rx="3.5" fill="#1a2233" />
          <rect x="2" y="-22" width="7" height="24" rx="3.5" fill="#1a2233" />
          <rect x="-12" y="-58" width="24" height="40" rx="11" fill={color} />
          <circle cy="-72" r="12" fill="#f3d6b8" />
          <path d={`M0 -48 L${dir * 26} -40`} stroke={color} strokeWidth="8" strokeLinecap="round" />
          <circle cx={dir * 28} cy="-40" r="5.5" fill="#f3d6b8" />
        </g>
      ))}
      <rect x="66" y="84" width="108" height="7" rx="3.5" fill="url(#hs-sg-rope)" />
      <rect x="108" y="76" width="10" height="24" rx="3" fill="#ff4d5a" stroke="#fff" strokeWidth="1.5" />
      {[
        [96, 60],
        [146, 52],
        [124, 30],
      ].map(([x, y]) => (
        <path key={`${x}`} d={`M${x} ${y - 6} L${x + 2} ${y - 2} L${x + 6} ${y} L${x + 2} ${y + 2} L${x} ${y + 6} L${x - 2} ${y + 2} L${x - 6} ${y} L${x - 2} ${y - 2} Z`} fill="#ffd25e" opacity="0.85" />
      ))}
    </svg>
  )
}
