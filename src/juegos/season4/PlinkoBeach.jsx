// Plinko en la Season 4: el tablero es una puesta de sol en la playa. Detrás de los clavos (que son perlas) va el cielo
// con el sol, el mar con su reflejo y la arena donde están las casetas de premio; la bola es una pelota de playa. Aquí
// el fondo del tablero y las rayas de la pelota; los colores, en plinko-beach.css. Todo se ve solo con
// .juegos-root.s4 y sin Halloween.
import './plinko-beach.css'

// El fondo, dentro del SVG del tablero (w × h, la fila de casetas en slotY).
export function PlinkoBeach({ w, h, slotY }) {
  const horizon = slotY * 0.62
  return (
    <g className="plinko__beach" aria-hidden="true">
      <defs>
        <linearGradient id="pb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1a5e" />
          <stop offset="0.45" stopColor="#a8407a" />
          <stop offset="0.8" stopColor="#ff7a5a" />
          <stop offset="1" stopColor="#ffc46a" />
        </linearGradient>
        <linearGradient id="pb-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a6a" />
          <stop offset="0.12" stopColor="#3a8ab0" />
          <stop offset="1" stopColor="#0d4a68" />
        </linearGradient>
        <linearGradient id="pb-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2d39a" />
          <stop offset="1" stopColor="#d6a462" />
        </linearGradient>
        <radialGradient id="pb-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c0" />
          <stop offset="0.55" stopColor="#ffd25e" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={w} height={horizon} fill="url(#pb-sky)" />
      {/* Estrellas arriba, donde ya es casi de noche. */}
      {Array.from({ length: 16 }, (_, k) => (
        <circle key={k} className="plinko__star" cx={(k * 97) % w} cy={8 + ((k * 53) % (horizon * 0.35))} r={k % 3 ? 0.9 : 1.4} style={{ animationDelay: `${(k % 5) * 0.5}s` }} />
      ))}
      {/* El sol, medio hundido, y una isla con su volcán. */}
      <circle className="plinko__sun" cx={w * 0.5} cy={horizon + 4} r={w * 0.16} fill="url(#pb-sun)" />
      <path d={`M${w * 0.68} ${horizon} Q${w * 0.76} ${horizon - 18} ${w * 0.8} ${horizon - 30} L${w * 0.82} ${horizon - 32} L${w * 0.84} ${horizon - 30} Q${w * 0.88} ${horizon - 16} ${w * 0.98} ${horizon} Z`} fill="#3a1f4e" opacity="0.8" />
      {/* El mar con el reflejo del sol y las olas. */}
      <rect y={horizon} width={w} height={slotY - horizon + 10} fill="url(#pb-sea)" />
      <g className="plinko__glint">
        {Array.from({ length: 7 }, (_, k) => (
          <rect key={k} x={w * 0.5 - (14 + k * 10)} y={horizon + 6 + k * 9} width={28 + k * 20} height="2" rx="1" fill="#ffe6a8" opacity={0.7 - k * 0.08} />
        ))}
      </g>
      <g className="plinko__waves" stroke="#d6f8ff" strokeOpacity="0.35" fill="none" strokeWidth="1.6" strokeLinecap="round">
        {Array.from({ length: 10 }, (_, k) => {
          const x = (k * 131) % (w - 40)
          const y = horizon + 18 + ((k * 37) % (slotY - horizon - 30))
          return <path key={k} d={`M${x} ${y} q6 -4 12 0 t12 0`} />
        })}
      </g>
      {/* La orilla y la arena bajo las casetas. */}
      <path d={`M0 ${slotY - 14} Q${w * 0.25} ${slotY - 22} ${w * 0.5} ${slotY - 16} T${w} ${slotY - 18} V${h} H0 Z`} fill="url(#pb-sand)" />
      <path className="plinko__foam" d={`M0 ${slotY - 14} Q${w * 0.25} ${slotY - 22} ${w * 0.5} ${slotY - 16} T${w} ${slotY - 18}`} stroke="#fff" strokeWidth="2.4" fill="none" opacity="0.8" />
      {/* Palmeras en las esquinas de abajo y gaviotas arriba. */}
      {[
        [10, 1],
        [w - 10, -1],
      ].map(([x, dir]) => (
        <g key={x} className="plinko__palm" transform={`translate(${x} ${slotY - 12}) scale(${dir} 1)`}>
          <path d="M0 0 Q6 -40 18 -78" stroke="#3a2412" strokeWidth="6" fill="none" strokeLinecap="round" />
          <g className="plinko__fronds">
            <path d="M18 -78 Q46 -86 60 -66 Q40 -76 18 -74 Z" />
            <path d="M18 -78 Q26 -106 8 -114 Q20 -96 17 -78 Z" />
            <path d="M18 -78 Q-6 -96 -22 -80 Q-4 -86 17 -76 Z" />
            <path d="M18 -78 Q46 -64 50 -42 Q36 -64 18 -74 Z" />
          </g>
        </g>
      ))}
      <g className="plinko__gulls" stroke="#2a1a3a" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d={`M${w * 0.12} 40 q5 -5 10 0 q5 -5 10 0`} />
        <path d={`M${w * 0.2} 58 q4 -4 8 0 q4 -4 8 0`} />
        <path d={`M${w * 0.8} 34 q5 -5 10 0 q5 -5 10 0`} />
      </g>
    </g>
  )
}

// Las rayas de la pelota de playa (dentro del grupo de la bola, recortadas a su círculo).
export function BeachBall({ r }) {
  return (
    <g className="plinko__beachball" clipPath="url(#plinko-ballclip)" aria-hidden="true">
      <circle r={r} fill="#fff" />
      <ellipse cx={-r * 0.62} rx={r * 0.42} ry={r * 1.1} fill="#ff4a3a" />
      <ellipse cx={r * 0.62} rx={r * 0.42} ry={r * 1.1} fill="#1f86d1" />
      <ellipse rx={r * 0.2} ry={r * 1.1} fill="#ffd25e" />
      <circle r={r * 0.22} fill="#fff" />
    </g>
  )
}
