// Escena del Ascensor en primera persona. Solo dibuja: lo que pasa lo decide Elevator.jsx con lo que dice el servidor.
//   inside   vas dentro: las puertas, el display de planta, la botonera (elige planta o bájate) y los demás pasajeros
//   landing  te has bajado: miras desde tu planta cómo se cierra el ascensor y el indicador sigue subiendo… o cae
//   lobby    no vas en este viaje: el vestíbulo, con las puertas abiertas mientras se sube la gente
import { useRef } from 'react'
import { FLOORS, MULTS, fmtMult } from './elevator.js'
import Avatar from './Avatar.jsx'

const hueOf = (name = '') => [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360
const label = (f) => (f === 0 ? 'PB' : f >= FLOORS ? 'AZ' : String(f))

// Ambiente de cada tramo de plantas: vestíbulo, oficinas, plantas altas con vistas al atardecer, cielo de noche y azotea.
export const bandOf = (f) => (f <= 0 ? 'lobby' : f <= 4 ? 'office' : f <= 9 ? 'high' : f < FLOORS ? 'sky' : 'roof')

function Person({ p, small = false }) {
  return (
    <span className={`pv-person ${p.me ? 'is-me' : ''} ${small ? 'is-small' : ''}`} style={{ '--h': hueOf(p.name) }} title={p.name}>
      <Avatar name={p.name} src={p.avatar} size={small ? 30 : 40} />
      <i className="pv-person__body" />
    </span>
  )
}

// Edificios del horizonte (x, ancho, alto en % del cuadro), siempre los mismos.
const SKYLINE = [
  [0, 9, 38],
  [8, 7, 55],
  [14, 10, 30],
  [23, 6, 64],
  [28, 11, 44],
  [38, 7, 72],
  [44, 9, 36],
  [52, 12, 58],
  [63, 6, 40],
  [68, 10, 66],
  [77, 8, 34],
  [84, 9, 50],
  [92, 8, 28],
]

function Skyline({ band }) {
  return (
    <span className={`pv-sky pv-sky--${band}`} aria-hidden="true">
      {band !== 'high' && (
        <span className="pv-stars">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 60}%`, '--d': `${(i % 5) * 0.6}s` }} />
          ))}
        </span>
      )}
      <span className="pv-city">
        {SKYLINE.map(([x, w, h], i) => (
          <i key={i} style={{ left: `${x}%`, width: `${w}%`, height: `${band === 'sky' || band === 'roof' ? h * 0.55 : h}%` }} />
        ))}
      </span>
    </span>
  )
}

// Dónde se coloca cada pasajero dentro de la cabina: x en % del ancho, z en fracción del fondo. Se dejan libres el centro de
// las puertas y la botonera (a la derecha de la puerta) para que se vea lo que importa.
const CAB_SLOTS = [
  [9, 0.42],
  [21, 0.8],
  [34, 0.6],
  [92, 0.36],
  [45, 0.93],
  [14, 0.62],
  [27, 0.38],
]
// Y en el rellano, los que se bajaron en esa planta (z en fracción del fondo del rellano).
const LAND_SLOTS = [
  [42, 0.3],
  [58, 0.42],
  [33, 0.62],
  [67, 0.58],
  [50, 0.78],
]

// Una persona de pie, como un recorte de cartón en 3D: la foto como cabeza, torso y piernas.
function Figure({ p, slot, back = false }) {
  const [x, z] = slot
  return (
    <span className={`pv-fig ${back ? 'is-back' : ''}`} style={{ '--x': x, '--z': z, '--h': hueOf(p.name) }} title={p.name}>
      <Avatar name={p.name} src={p.avatar} size={40} />
      <i className="pv-fig__body" />
      <i className="pv-fig__legs" />
    </span>
  )
}

// Lo que hay al otro lado de las puertas en la planta f, con su fondo de verdad: pared de enfrente con el número de la
// planta pintado (o la ventana con la ciudad), suelo, techo y quien se bajó allí.
function Landing3D({ floor, people = [] }) {
  const band = bandOf(floor)
  const glass = band === 'high' || band === 'sky'
  return (
    <div className={`pv-land pv-landing--${band}`} aria-hidden="true">
      {band !== 'roof' && <i className="pv-land__ceil" />}
      <i className="pv-land__floor" />
      <div className="pv-land__wall">
        {glass && (
          <span className="pv-land__window">
            <Skyline band={band} />
          </span>
        )}
        {band === 'roof' && <Skyline band="roof" />}
        {band === 'roof' && <i className="pv-land__railing" />}
        {band === 'lobby' && <i className="pv-plant pv-plant--l" />}
        {band === 'lobby' && <i className="pv-plant pv-plant--r" />}
        {(band === 'office' || band === 'lobby') && <i className="pv-land__lamp" />}
        <b className={`pv-land__num ${glass ? 'is-glass' : ''}`}>{floor === 0 ? 'PB' : floor >= FLOORS ? 'AZOTEA' : floor}</b>
        <small className="pv-land__mult">{fmtMult(MULTS[Math.min(floor, FLOORS)])}</small>
      </div>
      {people.slice(0, LAND_SLOTS.length).map((p, i) => (
        <Figure key={p.name} p={p} slot={LAND_SLOTS[i]} />
      ))}
    </div>
  )
}

// La botonera: elegir planta deja puesta la bajada automática; el botón grande te baja ya. Se pinta dos veces: en la
// pared junto a la puerta (escritorio) y en primer plano a la derecha (móvil, para poder pulsarla con el dedo).
function Cop({ where, floor, phase, autoFloor, pickable, onPick, canExit, onExit, exitLabel }) {
  return (
    <div className={`pv-cop pv-cop--${where}`} role="group" aria-label="Botonera">
      <span className="pv-cop__brand" aria-hidden="true">
        TOPCODE
      </span>
      <div className="pv-cop__grid">
        {Array.from({ length: FLOORS - 1 }, (_, i) => FLOORS - 1 - i).map((f) => (
          <button
            key={f}
            type="button"
            className={`pv-btn ${autoFloor === f ? 'is-lit' : ''} ${f <= floor && phase !== 'join' ? 'is-past' : ''}`}
            disabled={!pickable(f)}
            onClick={() => onPick(autoFloor === f ? null : f)}
            aria-pressed={autoFloor === f}
            aria-label={`Bajarme solo en la planta ${f} (${fmtMult(MULTS[f])})`}
            title={fmtMult(MULTS[f])}
          >
            {f}
          </button>
        ))}
      </div>
      <button type="button" className={`pv-exit ${canExit ? 'is-ready' : ''}`} disabled={!canExit} onClick={onExit}>
        <span aria-hidden="true">◀|▶</span>
        <b>{exitLabel}</b>
      </button>
    </div>
  )
}

// El display de encima de las puertas: planta, flecha si sube y lo que vale cada planta.
function Display({ floor, moving, alarm, roof, next, chance }) {
  return (
    <div className={`pv-display ${alarm ? 'is-alarm' : ''} ${roof ? 'is-roof' : ''}`} aria-hidden="true">
      <span className={`pv-display__arrow ${moving ? 'is-on' : ''}`}>▲</span>
      <b className="pv-display__floor" key={alarm ? 'x' : floor}>
        {alarm ? '!!' : label(floor)}
      </b>
      <span className="pv-display__mult">{alarm ? 'FUERA DE SERVICIO' : roof ? '¡AZOTEA!' : fmtMult(MULTS[Math.min(floor, FLOORS)])}</span>
      {chance != null && !alarm && !roof && (
        <span className="pv-display__cable" style={{ '--c': chance }} title={`Llega a la ${next}: ${Math.round(chance * 100)} %`}>
          <i />
        </span>
      )}
    </div>
  )
}

export default function ElevatorView({
  pov,
  floor,
  here = 0,
  phase,
  doorsOpen,
  moving,
  fallen,
  roof,
  crash,
  inside,
  outAt,
  next,
  chance,
  autoFloor,
  pickable,
  onPick,
  canExit,
  onExit,
  exitLabel,
  joinedCount,
  status,
}) {
  // Con el ratón la cabeza se mueve un poco (la perspectiva sigue al puntero): se escribe en el estilo, sin repintar React.
  const frame = useRef(null)
  const look = (e) => {
    const el = frame.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
    el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
  }
  const unlook = () => {
    frame.current?.style.setProperty('--px', '0')
    frame.current?.style.setProperty('--py', '0')
  }
  const others = inside.filter((p) => !p.me)
  const shake = fallen && pov !== 'lobby'
  const tense = moving && chance != null && chance < 0.72
  const cls = [
    'pv',
    `pv--${pov}`,
    doorsOpen ? 'is-open' : '',
    moving ? 'is-moving' : '',
    tense ? 'is-tense' : '',
    fallen ? 'is-fallen' : '',
    shake ? 'is-shake' : '',
    roof ? 'is-roof' : '',
  ].join(' ')

  if (pov === 'inside') {
    const view = roof ? FLOORS : floor
    const cop = { floor, phase, autoFloor, pickable, onPick, canExit, onExit, exitLabel }
    return (
      <div
        className={cls}
        role="img"
        aria-label={status}
        ref={frame}
        onPointerMove={look}
        onPointerLeave={unlook}
        style={{ '--spd': Math.min(1, view / (FLOORS - 1)) }}
      >
        {/* La cabina es una caja 3D de verdad: la cámara está en la entrada, mirando a las puertas. */}
        <div className="pv-view">
          <div className="pv-box">
            <div className="pv-ceiling">
              <i className="pv-ceiling__panel" />
            </div>
            <div className="pv-floor">
              <i className="pv-floor__sill" />
            </div>
            <div className="pv-wall pv-wall--l">
              <i className="pv-wall__rail" />
            </div>
            <div className="pv-wall pv-wall--r">
              <i className="pv-wall__rail" />
            </div>
            <Landing3D floor={view} people={outAt.get(view) ?? []} />
            <i className="pv-door pv-door--l" />
            <i className="pv-door pv-door--r" />
            <i className="pv-seam" />
            <div className="pv-back">
              <i className="pv-back__frame" />
              <span className="pv-back__brand">Ascensores GcGames</span>
              <Display floor={view} moving={moving} alarm={fallen} roof={roof} next={next} chance={chance} />
              <Cop where="wall" {...cop} />
            </div>
            {others.slice(0, CAB_SLOTS.length).map((p, i) => (
              <Figure key={p.name} p={p} slot={CAB_SLOTS[i]} back />
            ))}
          </div>
        </div>
        {others.length > CAB_SLOTS.length && <small className="pv-more pv-more--cab">+{others.length - CAB_SLOTS.length} más</small>}
        <i className="pv-light" aria-hidden="true" />
        <i className="pv-vignette" aria-hidden="true" />
        <Cop where="hand" {...cop} />
        {fallen && (
          <div className="pv-fall" aria-hidden="true">
            <span className="pv-fall__lines" />
            <b>¡Se ha roto el cable!</b>
            <small>Ibas camino de la planta {crash}</small>
          </div>
        )}
      </div>
    )
  }

  // Desde fuera (rellano o vestíbulo): las puertas del ascensor y su indicador, que sigue al ascensor.
  const outsideOpen = pov === 'lobby' && phase === 'join'
  const cabin = roof ? FLOORS : floor
  return (
    <div className={`${cls} ${outsideOpen ? 'is-boarding' : ''}`} role="img" aria-label={status}>
      <div className={`pv-hall pv-landing--${bandOf(here)}`}>
        {(bandOf(here) === 'high' || bandOf(here) === 'sky') && (
          <span className="pv-hall__window">
            <Skyline band={bandOf(here)} />
          </span>
        )}
        {bandOf(here) === 'lobby' && <i className="pv-plant pv-plant--hall" aria-hidden="true" />}
        <span className="pv-plaque pv-plaque--hall">
          <b>{here === 0 ? 'Vestíbulo' : `Planta ${here}`}</b>
          <small>{here === 0 ? `${joinedCount} en el viaje` : fmtMult(MULTS[here])}</small>
        </span>
        <div className="pv-outer">
          <Display floor={cabin} moving={moving} alarm={fallen} roof={roof} next={next} chance={chance} />
          <div className="pv-outer__doors">
            {/* Con las puertas abiertas en el vestíbulo se ve la cabina con la gente que ya ha subido. */}
            <span className="pv-outer__cabin">
              {inside.slice(0, 6).map((p) => (
                <Person key={p.name} p={p} small />
              ))}
              {inside.length > 6 && <small className="pv-more">+{inside.length - 6}</small>}
            </span>
            <i className="pv-door pv-door--l" />
            <i className="pv-door pv-door--r" />
          </div>
        </div>
        <span className="pv-hall__people">
          {(pov === 'landing' ? (outAt.get(here) ?? []).filter((p) => !p.me) : []).slice(0, 4).map((p) => (
            <Person key={p.name} p={p} />
          ))}
        </span>
        <i className="pv-landing__floor" aria-hidden="true" />
      </div>
      {fallen && <i className="pv-dust" aria-hidden="true" />}
    </div>
  )
}
