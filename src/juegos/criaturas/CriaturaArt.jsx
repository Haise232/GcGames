// Las ocho criaturas de Criaturas de las Islas, dibujadas en SVG (viewBox 0 0 100 100, mirando a la izquierda). Todas
// son de las islas o de la Navidad: una bolita de lava, un pulpito, un drago bebé, un muñeco de nieve, un perenquén,
// una pardela, el lagarto gigante de El Hierro y un reno. `className` permite animarlas (golpe, desmayo…).

const Eyes = ({ x = 40, y = 44, gap = 16, r = 5, look = -1.5 }) => (
  <g>
    {[0, gap].map((dx) => (
      <g key={dx}>
        <circle cx={x + dx} cy={y} r={r} fill="#fff" />
        <circle cx={x + dx + look} cy={y + 0.5} r={r * 0.55} fill="#1a1020" />
        <circle cx={x + dx + look - 1.2} cy={y - 1.4} r={r * 0.2} fill="#fff" />
      </g>
    ))}
  </g>
)
const Shadow = () => <ellipse cx="50" cy="92" rx="30" ry="5" fill="#000" opacity="0.25" />

const ART = {
  lavin: (
    <>
      <Shadow />
      <path d="M50 18 C 72 18, 86 36, 84 60 C 82 82, 66 90, 50 90 C 32 90, 16 80, 16 58 C 16 34, 30 18, 50 18 Z" fill="#3a1a14" />
      <path d="M30 40 L44 52 L36 66 M60 30 L56 48 L70 58 M48 70 L58 80" stroke="#ff7a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M38 18 Q42 4 50 12 Q56 2 60 16" fill="#ffb02e" />
      <Eyes x={36} y={46} r={5.5} />
      <path d="M40 60 Q46 65 52 60" stroke="#ffb02e" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  pulpin: (
    <>
      <Shadow />
      {[18, 30, 42, 56, 68, 80].map((x, i) => (
        <path key={x} d={`M${x} 66 Q ${x + (i % 2 ? 6 : -6)} 80 ${x + (i % 2 ? -2 : 2)} 90`} stroke="#e8558a" strokeWidth="9" fill="none" strokeLinecap="round" />
      ))}
      <path d="M50 14 C 76 14, 84 36, 82 56 C 80 70, 66 72, 50 72 C 34 72, 20 70, 18 56 C 16 36, 24 14, 50 14 Z" fill="#ff6fa0" />
      <circle cx="64" cy="28" r="4" fill="#ffb2cc" />
      <circle cx="72" cy="40" r="3" fill="#ffb2cc" />
      <Eyes x={34} y={44} r={6} />
      <ellipse cx="44" cy="60" rx="5" ry="3.5" fill="#b8205a" />
    </>
  ),
  draguito: (
    <>
      <Shadow />
      <path d="M44 90 L42 60 L58 60 L56 90 Z" fill="#a87a50" />
      {[-60, -30, 0, 30, 60].map((a) => (
        <path key={a} d="M50 46 L50 8" stroke="#3fae6a" strokeWidth="10" strokeLinecap="round" transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx="50" cy="52" r="22" fill="#2f8f55" />
      <circle cx="60" cy="40" r="5" fill="#5fd18b" />
      <Eyes x={38} y={52} r={5} />
      <path d="M42 62 Q47 66 52 62" stroke="#1a4a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="80" r="4" fill="#d42a35" />
    </>
  ),
  copito: (
    <>
      <Shadow />
      <circle cx="50" cy="70" r="22" fill="#f4f9ff" stroke="#c9d8ee" strokeWidth="2" />
      <circle cx="50" cy="38" r="18" fill="#f4f9ff" stroke="#c9d8ee" strokeWidth="2" />
      <path d="M34 52 Q50 60 66 52 L66 58 Q50 66 34 58 Z" fill="#d42a35" />
      <path d="M60 56 L66 74 L72 72 L64 54 Z" fill="#d42a35" />
      <path d="M32 26 L68 26 L64 14 L36 14 Z" fill="#1f2a44" />
      <rect x="30" y="24" width="40" height="5" rx="2" fill="#1f2a44" />
      <Eyes x={40} y={36} gap={13} r={3.5} />
      <path d="M44 42 L32 45 L44 46 Z" fill="#ff8a3a" />
      {[64, 74, 84].map((y) => (
        <circle key={y} cx="50" cy={y} r="2.5" fill="#1f2a44" />
      ))}
    </>
  ),
  perenquen: (
    <>
      <Shadow />
      <path d="M70 70 Q92 70 90 50 Q88 40 80 44" stroke="#c9a06a" strokeWidth="8" fill="none" strokeLinecap="round" />
      <ellipse cx="54" cy="66" rx="26" ry="16" fill="#d9b27a" />
      {[[34, 78], [44, 82], [64, 82], [74, 78]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="5" fill="#d9b27a" stroke="#a87a40" strokeWidth="1.5" />
      ))}
      <ellipse cx="32" cy="50" rx="20" ry="15" fill="#e2bf88" />
      {[[50, 60], [60, 70], [66, 58]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3" fill="#ff6a2a" />
      ))}
      <circle cx="26" cy="46" r="7" fill="#fff" />
      <circle cx="24" cy="46" r="4.5" fill="#1a1020" />
      <circle cx="22.5" cy="44" r="1.5" fill="#fff" />
      <path d="M14 56 Q20 59 26 56" stroke="#7a4a20" strokeWidth="2" fill="none" />
    </>
  ),
  pardela: (
    <>
      <Shadow />
      <path d="M58 52 Q90 30 96 52 Q80 52 64 64 Z" fill="#5a6070" />
      <ellipse cx="54" cy="62" rx="24" ry="18" fill="#f4f6fa" />
      <path d="M30 62 Q34 42 54 44 Q74 46 78 62 Q64 54 54 56 Q40 56 30 62 Z" fill="#6a7080" />
      <circle cx="36" cy="42" r="15" fill="#6a7080" />
      <path d="M22 42 L8 46 L22 48 Z" fill="#f2c14e" />
      <circle cx="32" cy="40" r="5" fill="#fff" />
      <circle cx="30.5" cy="40.5" r="3" fill="#1a1020" />
      <path d="M44 80 L42 88 M58 80 L60 88" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 50 Q36 54 32 58" stroke="#8ac4f0" strokeWidth="2" fill="none" />
    </>
  ),
  lagarton: (
    <>
      <Shadow />
      <path d="M74 72 Q96 76 94 60" stroke="#3f6a3a" strokeWidth="10" fill="none" strokeLinecap="round" />
      <ellipse cx="56" cy="66" rx="30" ry="18" fill="#4a7a42" />
      {[40, 52, 64, 74].map((x) => (
        <path key={x} d={`M${x} 50 l4 -6 l4 6`} fill="#2f5a2a" />
      ))}
      {[[34, 82], [46, 84], [68, 84], [78, 80]].map(([x, y]) => (
        <ellipse key={x} cx={x} cy={y} rx="6" ry="4" fill="#3f6a3a" />
      ))}
      <ellipse cx="30" cy="58" rx="20" ry="13" fill="#5a8a4a" />
      <path d="M12 62 Q22 70 34 64" stroke="#2a4a22" strokeWidth="2.5" fill="none" />
      <circle cx="26" cy="52" r="5" fill="#fff" />
      <circle cx="24.5" cy="52.5" r="3" fill="#1a1020" />
      <path d="M22 46 L32 48" stroke="#2a4a22" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="60" cy="70" rx="14" ry="6" fill="#7ab05a" opacity="0.6" />
    </>
  ),
  renito: (
    <>
      <Shadow />
      <ellipse cx="58" cy="66" rx="24" ry="16" fill="#9a6a3a" />
      {[[42, 80], [50, 84], [66, 84], [74, 80]].map(([x, y]) => (
        <rect key={x} x={x - 3} y={y - 8} width="6" height="12" rx="2" fill="#7a4a22" />
      ))}
      <path d="M36 30 L30 10 M30 18 L22 14 M36 30 L44 12 M42 20 L50 16" stroke="#d9b27a" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="36" cy="44" rx="16" ry="14" fill="#a8763e" />
      <ellipse cx="28" cy="50" rx="9" ry="7" fill="#c89a62" />
      <circle cx="22" cy="49" r="4.5" fill="#d42a35" />
      <circle cx="36" cy="40" r="4" fill="#fff" />
      <circle cx="34.8" cy="40.5" r="2.4" fill="#1a1020" />
      <path d="M44 58 Q52 64 62 58" stroke="#d42a35" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="54" cy="62" r="3" fill="#f8c54e" />
    </>
  ),
}

// Solo las formas (para meterlas dentro de otro SVG, como la escena de la tarjeta del selector).
export const CriaturaShape = ({ sp }) => ART[sp]

export default function CriaturaArt({ sp, className = '', flip = false }) {
  return (
    <svg className={`cr-art ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <g transform={flip ? 'translate(100 0) scale(-1 1)' : undefined}>{ART[sp]}</g>
    </svg>
  )
}
