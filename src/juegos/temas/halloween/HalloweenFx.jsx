// Adornos de Halloween del selector de juegos: murciélagos que cruzan el fondo y telarañas en las esquinas.
// Solo se montan con el tema activo y van detrás de todo (sin foco, sin ratón y ocultos a los lectores de pantalla).
// Pocos y animados solo con transform, para no lastrar el móvil.

const BAT = 'M32 14c-3-5-9-8-14-6 3 1 4 4 3 6-4-3-11-3-15 1 4 0 6 3 6 6 4-3 10-2 13 1 2-2 4-4 7-4s5 2 7 4c3-3 9-4 13-1 0-3 2-6 6-6-4-4-11-4-15-1-1-2 0-5 3-6-5-2-11 1-14 6z'

// Cada murciélago: altura a la que cruza, tamaño, duración y retraso (los retrasos negativos hacen que al cargar ya
// estén repartidos por la pantalla en vez de salir todos a la vez).
const BATS = [
  { top: '9%', size: 44, dur: 19, delay: -3 },
  { top: '22%', size: 28, dur: 26, delay: -14 },
  { top: '41%', size: 36, dur: 23, delay: -8 },
  { top: '63%', size: 24, dur: 31, delay: -21 },
  { top: '80%', size: 32, dur: 27, delay: -2 },
]

function Web({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 120">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M0 0 L120 120 M0 0 L120 46 M0 0 L46 120 M0 0 L120 0 M0 0 L0 120" />
        <path d="M24 0 Q20 10 24 24 Q10 20 0 24" />
        <path d="M50 0 Q42 20 48 48 Q20 42 0 50" />
        <path d="M78 0 Q66 30 72 72 Q30 66 0 78" />
        <path d="M108 0 Q92 40 98 98 Q40 92 0 108" />
      </g>
    </svg>
  )
}

export default function HalloweenFx() {
  return (
    <div className="hw-fx" aria-hidden="true">
      <Web className="hw-fx__web hw-fx__web--left" />
      <Web className="hw-fx__web hw-fx__web--right" />
      {BATS.map((b, i) => (
        <svg
          key={i}
          className="hw-fx__bat"
          viewBox="0 0 64 30"
          style={{ top: b.top, width: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}
        >
          <path d={BAT} fill="currentColor" />
        </svg>
      ))}
    </div>
  )
}
