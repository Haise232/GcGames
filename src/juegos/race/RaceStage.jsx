// La pista de la Carrera: la escena 3D (race3d.js, con three.js cargado aparte) y, si el navegador no tiene WebGL o falla al
// cargar, la escena 2D de siempre (RaceScene.jsx). Recibe las mismas props que RaceScene.
import { useEffect, useRef, useState } from 'react'
import RaceScene from './RaceScene.jsx'
import { CIRCUITS } from './race.js'
import './race3d.css'

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export default function RaceStage(props) {
  const host = useRef(null)
  const latest = useRef(props)
  const [mode, setMode] = useState(() => (hasWebGL() ? 'loading' : '2d'))
  const fallback = mode === '2d'
  latest.current = { ...props, onFail: () => setMode('2d') }

  useEffect(() => {
    if (fallback) return
    let dead = false
    let scene = null
    import('./race3d.js')
      .then(({ mountRace3D }) => {
        if (dead) return
        scene = mountRace3D(host.current, latest)
        setMode('3d')
      })
      .catch((error) => {
        console.warn('Carrera 3D no disponible, se usa la 2D', error)
        if (!dead) setMode('2d')
      })
    return () => {
      dead = true
      scene?.destroy()
    }
  }, [fallback])

  if (fallback) return <RaceScene {...props} />
  const circuit = CIRCUITS[props.circuit ?? 0]
  return (
    <div className="race-stage" ref={host} role="img" aria-label={`Circuito ${circuit.name}: la carrera en 3D`}>
      {mode === 'loading' && (
        <p className="race-stage__wait" style={{ '--c': circuit.color }}>
          Preparando la pista…
        </p>
      )}
    </div>
  )
}
