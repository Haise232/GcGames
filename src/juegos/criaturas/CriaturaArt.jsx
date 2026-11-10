// Las criaturas de Criaturas de las Islas, dibujadas en SVG (viewBox 0 0 100 100, mirando a la izquierda). Todas son
// originales y de las islas o de la Navidad: una bolita de lava, un pulpito, un drago, un muñeco de nieve, un perenquén,
// una pardela, el lagarto gigante de El Hierro, un reno, el guirre, un cardón y un pejeverde, con sus evoluciones. `className` permite animarlas (golpe, desmayo…).

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

  // --- Evoluciones (nivel 16) ---
  magmon: (
    <>
      <Shadow />
      <path d="M22 88 L28 60 L18 46 L30 30 L50 20 L72 28 L84 46 L76 62 L80 88 Z" fill="#2a120e" />
      <path d="M30 40 L44 50 L38 64 L50 74 M64 34 L60 50 L72 58 M44 84 L56 78" stroke="#ff7a1a" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M14 58 Q4 54 8 44 Q16 48 22 52 Z M86 58 Q96 54 92 44 Q84 48 78 52 Z" fill="#3a1a14" />
      <path d="M36 22 Q38 4 48 14 Q52 0 58 12 Q66 4 64 22" fill="#ffb02e" />
      <path d="M42 18 Q46 8 50 16 Q54 8 56 18" fill="#fff3b0" />
      <Eyes x={38} y={44} gap={18} r={5.5} />
      <path d="M40 58 Q50 64 60 58" stroke="#ffb02e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </>
  ),
  pulpazo: (
    <>
      <Shadow />
      {[10, 22, 34, 46, 58, 70, 82, 92].map((x, i) => (
        <path key={x} d={`M${x} 60 Q ${x + (i % 2 ? 9 : -9)} 78 ${x + (i % 2 ? -3 : 3)} 92`} stroke="#b8205a" strokeWidth="9" fill="none" strokeLinecap="round" />
      ))}
      <path d="M50 6 C 82 6, 92 32, 90 52 C 88 68, 70 70, 50 70 C 30 70, 12 68, 10 52 C 8 32, 18 6, 50 6 Z" fill="#e8558a" />
      {[[66, 20, 5], [76, 34, 4], [24, 22, 3.5], [70, 50, 3]].map(([x, y, r]) => (
        <circle key={x} cx={x} cy={y} r={r} fill="#ffb2cc" />
      ))}
      <path d="M26 30 Q36 24 44 32 M56 32 Q64 24 74 30" stroke="#7a1040" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Eyes x={34} y={40} gap={20} r={6.5} />
      <path d="M42 56 Q50 52 58 56" stroke="#7a1040" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  dragonal: (
    <>
      <Shadow />
      <path d="M36 92 L40 54 L60 54 L64 92 Z" fill="#8a5a30" />
      <path d="M40 92 L30 82 M60 92 L72 84" stroke="#8a5a30" strokeWidth="6" strokeLinecap="round" />
      <path d="M44 56 L32 38 M56 56 L68 38 M50 54 L50 34" stroke="#8a5a30" strokeWidth="7" strokeLinecap="round" />
      {[[32, 34], [50, 28], [68, 34]].map(([x, y]) => (
        <g key={x}>
          {[-55, -25, 0, 25, 55].map((a) => (
            <path key={a} d={`M${x} ${y} L${x} ${y - 20}`} stroke="#2f8f55" strokeWidth="7" strokeLinecap="round" transform={`rotate(${a} ${x} ${y})`} />
          ))}
        </g>
      ))}
      <ellipse cx="50" cy="68" rx="12" ry="9" fill="#a8763e" />
      <Eyes x={44} y={66} gap={12} r={3.5} />
      <path d="M36 74 L34 80 M64 74 L66 80" stroke="#d42a35" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  ventisquero: (
    <>
      <Shadow />
      <circle cx="50" cy="76" r="17" fill="#f4f9ff" stroke="#c9d8ee" strokeWidth="2" />
      <circle cx="50" cy="50" r="15" fill="#f4f9ff" stroke="#c9d8ee" strokeWidth="2" />
      <circle cx="50" cy="26" r="13" fill="#f4f9ff" stroke="#c9d8ee" strokeWidth="2" />
      <path d="M36 52 L14 40 M18 44 L10 46 M18 44 L16 36 M64 52 L86 40 M82 44 L90 46 M82 44 L84 36" stroke="#6a4a2a" strokeWidth="3" strokeLinecap="round" />
      <path d="M36 36 Q50 44 64 36 L64 41 Q50 49 36 41 Z" fill="#d42a35" />
      <path d="M58 40 L62 60 L68 58 L63 39 Z" fill="#d42a35" />
      <path d="M38 16 L50 2 L62 16 Z" fill="#a8e4ff" />
      <Eyes x={43} y={25} gap={11} r={3.2} />
      <path d="M46 31 L38 34 L46 34 Z" fill="#ff8a3a" />
      {[[30, 12], [74, 18], [80, 64], [18, 70]].map(([x, y]) => (
        <path key={x} d={`M${x - 4} ${y} L${x + 4} ${y} M${x} ${y - 4} L${x} ${y + 4}`} stroke="#a8e4ff" strokeWidth="2" strokeLinecap="round" />
      ))}
    </>
  ),
  salamandron: (
    <>
      <Shadow />
      <path d="M70 68 Q96 72 94 46 Q92 30 80 36" stroke="#d4462a" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M88 34 Q94 24 86 22 Q88 30 82 30 Z" fill="#ffb02e" />
      <ellipse cx="54" cy="64" rx="28" ry="16" fill="#e2603a" />
      {[[32, 80], [44, 84], [64, 84], [76, 80]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="5.5" fill="#e2603a" stroke="#8a2a14" strokeWidth="1.5" />
      ))}
      <path d="M36 50 L42 42 L48 50 L54 42 L60 50 L66 42 L72 50" fill="#ffb02e" />
      <ellipse cx="30" cy="50" rx="20" ry="15" fill="#f07a4a" />
      <circle cx="24" cy="46" r="7" fill="#fff36a" />
      <ellipse cx="22" cy="46" rx="2" ry="5" fill="#1a1020" />
      <path d="M12 56 Q20 60 28 56" stroke="#8a2a14" strokeWidth="2" fill="none" />
    </>
  ),
  pardelon: (
    <>
      <Shadow />
      <path d="M50 52 Q20 20 2 34 Q20 40 34 60 Z" fill="#4a5060" />
      <path d="M58 52 Q90 18 98 34 Q80 40 66 60 Z" fill="#4a5060" />
      <ellipse cx="54" cy="64" rx="22" ry="16" fill="#f4f6fa" />
      <path d="M34 62 Q38 46 54 48 Q70 50 74 62 Q62 56 54 58 Q42 58 34 62 Z" fill="#5a6070" />
      <circle cx="38" cy="44" r="14" fill="#5a6070" />
      <path d="M26 44 L8 50 L26 50 Z" fill="#f2c14e" />
      <path d="M30 36 L44 38" stroke="#2a3040" strokeWidth="3" strokeLinecap="round" />
      <circle cx="35" cy="42" r="4.5" fill="#fff" />
      <circle cx="33.6" cy="42.5" r="2.8" fill="#1a1020" />
      <path d="M46 80 L44 90 M60 80 L62 90" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  renazo: (
    <>
      <Shadow />
      <ellipse cx="58" cy="64" rx="28" ry="18" fill="#7a4a22" />
      {[[38, 80], [48, 86], [68, 86], [78, 80]].map(([x, y]) => (
        <rect key={x} x={x - 3.5} y={y - 10} width="7" height="14" rx="2" fill="#5a3418" />
      ))}
      <path d="M34 26 L24 4 M27 12 L16 8 M27 12 L22 2 M34 26 L46 4 M42 14 L54 10 M42 14 L48 2" stroke="#e8c48a" strokeWidth="4.5" strokeLinecap="round" />
      <ellipse cx="34" cy="40" rx="18" ry="15" fill="#8a5a2a" />
      <ellipse cx="25" cy="47" rx="10" ry="8" fill="#b88a52" />
      <circle cx="18" cy="46" r="6" fill="#ff3b48" />
      <circle cx="18" cy="46" r="10" fill="#ff3b48" opacity="0.25" />
      <path d="M32 34 L42 36" stroke="#3a2010" strokeWidth="3" strokeLinecap="round" />
      <circle cx="36" cy="38" r="4" fill="#fff" />
      <circle cx="34.8" cy="38.5" r="2.5" fill="#1a1020" />
      <path d="M42 56 Q56 64 72 56" stroke="#f8c54e" strokeWidth="5" fill="none" strokeLinecap="round" />
      {[48, 58, 68].map((x) => (
        <circle key={x} cx={x} cy={x === 58 ? 61 : 59} r="3" fill="#ffe27a" stroke="#a87a22" />
      ))}
    </>
  ),
  // --- Las que no evolucionan ---
  guirre: (
    <>
      <Shadow />
      <path d="M48 50 Q18 30 4 48 Q22 50 36 64 Z" fill="#2a2420" />
      <path d="M60 50 Q88 30 98 48 Q80 50 66 64 Z" fill="#2a2420" />
      <ellipse cx="54" cy="64" rx="20" ry="17" fill="#f2ead8" />
      <circle cx="38" cy="40" r="13" fill="#f2ead8" />
      <path d="M30 34 Q38 26 48 32" stroke="#f2ead8" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M28 40 Q24 36 26 46 L18 52 L30 48 Z" fill="#f2b632" />
      <path d="M26 46 L18 52" stroke="#2a2420" strokeWidth="2" />
      <circle cx="36" cy="38" r="3.5" fill="#1a1020" />
      <path d="M44 80 L42 90 M62 80 L64 90" stroke="#f2b632" strokeWidth="3" strokeLinecap="round" />
      <circle cx="80" cy="16" r="9" fill="#ffd25e" opacity="0.8" />
    </>
  ),
  cardon: (
    <>
      <Shadow />
      {[[30, 52, 26], [50, 30, 50], [70, 48, 30]].map(([x, y, h]) => (
        <g key={x}>
          <rect x={x - 8} y={y} width="16" height={92 - y} rx="8" fill="#3f8a4a" />
          <path d={`M${x - 3} ${y + 4} V90 M${x + 3} ${y + 4} V90`} stroke="#2f6a3a" strokeWidth="1.5" />
          {[0, 1, 2, 3].map((k) => (
            <path key={k} d={`M${x - 9} ${y + 8 + k * (h / 4)} l-4 -2 M${x + 9} ${y + 12 + k * (h / 4)} l4 -2`} stroke="#e8e0c0" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </g>
      ))}
      <Eyes x={45} y={44} gap={10} r={3.4} />
      <path d="M44 54 L56 54" stroke="#1a3a20" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M43 38 L49 40 M57 38 L51 40" stroke="#1a3a20" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="28" r="5" fill="#ff6a8a" />
    </>
  ),
  pejeverde: (
    <>
      <Shadow />
      <path d="M74 56 L96 38 L92 56 L96 74 Z" fill="#2fae9a" />
      <ellipse cx="50" cy="56" rx="32" ry="22" fill="#3fc4a8" />
      <path d="M30 40 Q50 30 70 40" stroke="#ff7ab8" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M26 56 Q50 64 76 56" stroke="#ffd25e" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M32 70 Q50 76 68 70" stroke="#6ab4ff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M44 34 L52 20 L60 34 Z" fill="#2fae9a" />
      <circle cx="30" cy="50" r="6" fill="#fff" />
      <circle cx="28.5" cy="50.5" r="3.5" fill="#1a1020" />
      <path d="M18 60 Q22 66 28 62" stroke="#1a5a50" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M20 58 L22 62 L24 58" fill="#fff" />
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
