// El Ascensor en 3D: monta la escena de elevator3d.js (three.js, cargado aparte) y pone encima, en HTML, el display de
// planta, la botonera (para pulsar con el ratón o el dedo) y el aviso de la caída. Si WebGL falla, avisa con onFail y la
// pantalla vuelve a la escena CSS (ElevatorView.jsx).
import { useEffect, useRef, useState } from 'react'
import { FLOORS } from './elevator.js'
import { eur } from '../comun/money.js'
import { Cop, Display } from './ElevatorView.jsx'
import './elevator3d.css'

export default function Elevator3D({ clock, scene: sceneProps, view, onFail, children }) {
  const host = useRef(null)
  const props = useRef(sceneProps)
  const fail = useRef(onFail)
  const [loading, setLoading] = useState(true)
  props.current = {
    ...sceneProps,
    disp: { floor: view.roof ? FLOORS : view.floor, moving: view.moving, alarm: view.fallen, roof: view.roof, chance: view.chance },
  }
  fail.current = onFail

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let dead = false
    let scene = null
    let frame = 0
    let observer = null
    const draw = () => {
      scene.draw({ t: clock(), ...props.current })
      frame = requestAnimationFrame(draw)
    }
    import('./elevator3d.js')
      .then(({ createElevator3D }) => {
        if (dead) return
        scene = createElevator3D(host.current, { reduced, onFail: () => fail.current() })
        observer = new ResizeObserver(() => scene.resize())
        observer.observe(host.current)
        setLoading(false)
        draw()
      })
      .catch((error) => {
        console.warn('Ascensor 3D no disponible, se usa el CSS', error)
        if (!dead) fail.current()
      })
    return () => {
      dead = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      scene?.destroy()
    }
  }, [clock])

  const { floor, moving, fallen, roof, next, chance, crash, status, pov, stake, cash, nextCash, won } = view
  const cop = {
    floor: view.floor,
    phase: view.phase,
    autoFloor: view.autoFloor,
    pickable: view.pickable,
    onPick: view.onPick,
    canExit: view.canExit,
    onExit: view.onExit,
    exitLabel: view.exitLabel,
  }
  const inside = pov === 'inside' && !fallen && !roof
  return (
    <div className={`el3 el3--${pov} ${fallen ? 'is-fallen' : ''} ${roof ? 'is-roof' : ''}`}>
      <div className="el3__scene" ref={host} role="img" aria-label={status}>
        {loading && <p className="el3__wait">Encendiendo el edificio…</p>}
      </div>
      {/* Dentro, el display es el de la cabina (en 3D, encima de las puertas). */}
      {pov !== 'inside' && <Display floor={roof ? FLOORS : floor} moving={moving} alarm={fallen} roof={roof} next={next} chance={chance} />}
      {/* Datos del viaje (dentro, bote, últimas caídas) como rótulos arriba a la izquierda. */}
      <div className="el3__top">{children}</div>
      {fallen && (
        <div className="el3__fall" aria-hidden="true">
          <b>¡Se ha roto el cable!</b>
          <small>Iba camino de la planta {crash}</small>
        </div>
      )}
      {roof && (
        <div className="el3__roof" aria-hidden="true">
          <b>¡Azotea!</b>
        </div>
      )}
      {/* Abajo: el estado (región viva), el HUD con lo importante y, dentro, la botonera de la pared de la cabina. */}
      <div className="el3__dock">
        <p className={`el3__status ${won ? 'is-win' : ''}`} aria-live="polite">
          {status}
        </p>
        {inside && stake > 0 && (
          <div className="el3__hud">
            <span className="el3__hud-cell">
              <small>Entrada</small>
              <b>{eur(stake)}</b>
            </span>
            <span className="el3__hud-cell el3__hud-cell--cash">
              <small>Si te bajas</small>
              <b>{cash != null ? eur(cash) : '—'}</b>
            </span>
            {chance != null && (
              <span className="el3__hud-odds" style={{ '--c': chance }}>
                <small>
                  Llegar a la {next}
                  {nextCash != null && <em> · {eur(nextCash)}</em>}
                </small>
                <b>{Math.round(chance * 100)} %</b>
                <i aria-hidden="true">
                  <u />
                </i>
              </span>
            )}
          </div>
        )}
        {inside && <Cop where="float" {...cop} />}
      </div>
    </div>
  )
}
