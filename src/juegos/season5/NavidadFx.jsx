// Nieve que cae detrás del selector en la Season 5 · Navidad. Copos con posición, tamaño y ritmo fijos (salen del
// índice), solo transform y opacity, y en el móvil la mitad (season5.css). Con prefers-reduced-motion no se pinta.
// Detrás de la nieve, luces desenfocadas (bokeh) de colores que laten despacio; con reduced-motion se quedan quietas.
const COPOS = Array.from({ length: 44 }, (_, i) => ({
  '--x': `${(i * 37.3) % 100}%`,
  '--s': `${2 + ((i * 7) % 5)}px`,
  '--d': `${11 + ((i * 13) % 12)}s`,
  '--delay': `${-((i * 2.9) % 22)}s`,
  '--drift': `${((i % 5) - 2) * 16}px`,
  '--o': 0.35 + ((i * 3) % 5) * 0.1,
}))

const LUCES = ['#ff4b55', '#ffd45c', '#5be08f', '#6cc3ff', '#ff8fb1']
const BOKEH = Array.from({ length: 16 }, (_, i) => ({
  '--x': `${(i * 61.7 + 7) % 100}%`,
  '--y': `${(i * 43.1 + 11) % 100}%`,
  '--s': `${70 + ((i * 29) % 110)}px`,
  '--c': LUCES[i % LUCES.length],
  '--d': `${7 + ((i * 5) % 8)}s`,
  '--delay': `${-((i * 1.7) % 9)}s`,
}))

export default function NavidadFx() {
  return (
    <>
      <div className="ns5-bokeh" aria-hidden="true">
        {BOKEH.map((style, i) => (
          <b key={i} style={style} />
        ))}
      </div>
      <div className="ns5-fx" aria-hidden="true">
        {COPOS.map((style, i) => (
          <i key={i} style={style} />
        ))}
      </div>
    </>
  )
}

// Guirnalda de bombillas para el borde de arriba de la portada.
export function Guirnalda() {
  return (
    <div className="ns5-garland" aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  )
}
