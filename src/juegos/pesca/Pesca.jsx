import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BITE_R,
  BOTE_CUT,
  COFRADIA_MIN,
  COFRADIA_PER,
  ENTRY,
  FISH_MS,
  H,
  JOIN_MS,
  LEAGUE_POINTS,
  MAX_FIGHT_TICKS,
  RECAST_MS,
  ROUND_MS,
  SNAP,
  SLACK,
  SPECIES,
  SPECIES_ORDER,
  TICK_MS,
  W,
  WARN_TICKS,
  castMs,
  fightStart,
  fightStep,
  fishAt,
  fmtKg,
  phaseAt,
  rng,
  splitOf,
  validPoint,
} from './pesca.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playBeep, playChip, playHorn, playLose, playOvation, playReelTick, playSnap, playSplash, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import './Pesca.css'

const TOPIC = 'juegos-pesca' // el servidor avisa con cada inscripción, lanzamiento y captura (evento «cambio»)
const POLL_FISH_MS = 2500 // respaldo del Realtime mientras se pesca
const POLL_JOIN_MS = 5000
const COALESCE_MS = 300
const PAID_WAIT_MS = 3200 // tras acabar la pesca, cuándo está ya repartido (el servidor reparte a los 2,5 s)
const TOAST_MS = 4200
const STAGE_H = 640 // el mar (H) y el muelle debajo
const DOCK_TOP = H + 6

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const clockOf = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const sec = (ms) => (ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })
const END_TEXT = {
  landed: '¡Al muelle!',
  snap: '¡Se partió el sedal!',
  loose: 'Sedal flojo: se soltó',
  escaped: 'Se llevó todo el sedal',
  cut: 'Se acabó el campeonato',
}

// Sitio de cada pescador en el muelle (por nombre, para que no bailen cuando cambia la clasificación).
function dockSpots(players) {
  const names = players.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'es'))
  const n = Math.max(1, names.length)
  return new Map(names.map((name, i) => [name, 70 + ((W - 140) * (i + 0.5)) / n]))
}

// Silueta de un pez mirando a la derecha, centrada en 0 (largo L).
function shapeOf(sp) {
  const L = SPECIES[sp].size
  const tall = sp === 'vieja' || sp === 'cherne' || sp === 'sama' ? 0.3 : sp === 'morena' ? 0.1 : sp === 'atun' ? 0.26 : 0.2
  const h = L * tall
  const body = `M${L / 2} 0 C${L / 4} ${-h} ${-L / 4} ${-h} ${-L * 0.32} 0 C${-L / 4} ${h} ${L / 4} ${h} ${L / 2} 0 Z`
  const tail =
    sp === 'morena'
      ? `M${-L * 0.32} 0 Q${-L * 0.5} ${-h * 2} ${-L * 0.62} 0 Q${-L * 0.5} ${h * 2} ${-L * 0.32} 0 Z`
      : sp === 'atun' || sp === 'marlin'
        ? `M${-L * 0.3} 0 L${-L * 0.52} ${-h * 1.4} Q${-L * 0.42} 0 ${-L * 0.52} ${h * 1.4} Z`
        : `M${-L * 0.3} 0 L${-L / 2} ${-h * 0.9} L${-L * 0.44} 0 L${-L / 2} ${h * 0.9} Z`
  const extra =
    sp === 'marlin'
      ? `M${L / 2 - 2} -1.5 L${L * 0.85} 0 L${L / 2 - 2} 1.5 Z M${L * 0.18} ${-h * 0.8} C${L * 0.05} ${-h * 3.2} ${-L * 0.18} ${-h * 2.8} ${-L * 0.24} ${-h * 0.5} Z`
      : ''
  return { body, tail, extra }
}
const SHAPES = Object.fromEntries(SPECIES_ORDER.map((sp) => [sp, shapeOf(sp)]))

function FishShadow({ sp, x, y, dir, t, thrash = false, className = '' }) {
  const s = SHAPES[sp]
  const wob = thrash ? Math.sin(t / 55) * 16 : Math.sin(t / 260 + x / 50) * 4
  return (
    <g className={`pc-fish pc-fish--${sp} ${className}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${dir} 1) rotate(${wob.toFixed(1)})`}>
      <path d={s.tail} />
      <path d={s.body} />
      {s.extra && <path d={s.extra} />}
    </g>
  )
}

// Silueta para la ayuda y la guía de especies.
function Silhouette({ sp }) {
  const L = SPECIES[sp].size
  return (
    <svg className="pc-sil" viewBox={`${-L * 0.65} ${-L * 0.4} ${L * 1.55} ${L * 0.8}`} aria-hidden="true">
      <FishShadow sp={sp} x={0} y={0} dir={1} t={0} />
    </svg>
  )
}

const FLAGS = ['#ff5a4a', '#ffd25e', '#46e0c8', '#fff7e6', '#3d8cff']
// Banderines de la Cofradía a lo largo de la viga del muelle.
function Bunting() {
  const step = 26
  const span = 250
  const sag = (x) => 6 * Math.sin(((x % span) / span) * Math.PI)
  const pts = []
  for (let x = 0; x <= W; x += 10) pts.push(`${x} ${(DOCK_TOP - 1 + sag(x)).toFixed(1)}`)
  return (
    <g className="pc-bunting" pointerEvents="none">
      <path className="pc-bunting__string" d={`M${pts.join(' L')}`} />
      {Array.from({ length: Math.floor(W / step) }, (_, i) => {
        const x = i * step + 13
        const y = DOCK_TOP - 1 + sag(x)
        return <path key={i} d={`M${x - 8} ${y.toFixed(1)} L${x + 8} ${y.toFixed(1)} L${x} ${(y + 15).toFixed(1)} Z`} fill={FLAGS[i % FLAGS.length]} />
      })}
    </g>
  )
}

function Pescador({ x, name, me, fighting, catches }) {
  return (
    <g className={`pc-man ${me ? 'pc-man--me' : ''} ${fighting ? 'pc-man--fight' : ''}`} transform={`translate(${x.toFixed(1)} ${DOCK_TOP + 6})`}>
      {me && <ellipse cx="0" cy="24" rx="34" ry="34" fill="url(#pc-meglow)" />}
      <ellipse cx="0" cy="44" rx="22" ry="5" className="pc-man__shadow" />
      <rect x="-8" y="31" width="7" height="11" rx="2" className="pc-man__pants" />
      <rect x="1" y="31" width="7" height="11" rx="2" className="pc-man__pants" />
      <ellipse cx="-4.5" cy="42" rx="6" ry="3" className="pc-man__boot" />
      <ellipse cx="4.5" cy="42" rx="6" ry="3" className="pc-man__boot" />
      <rect x="-10" y="10" width="20" height="25" rx="7" className="pc-man__shirt" />
      <path d="M-9 19 H9 M-9 26 H9" className="pc-man__stripe" />
      <path d="M-8 15 Q-4 25 6 20" className="pc-man__arm" />
      <path d={`M6 18 L${fighting ? 14 : 18} ${fighting ? -26 : -30}`} className="pc-man__rod" />
      <path d={`M7 15 L${fighting ? 14.5 : 18.5} ${fighting ? -26 : -30}`} className="pc-man__rod-hi" />
      <circle cx="8" cy="14" r="3.4" className="pc-man__reel" />
      <circle cx="6" cy="19" r="3.2" className="pc-man__head" />
      <circle cx="0" cy="2" r="10" className="pc-man__head" />
      <circle cx="-3.5" cy="3" r="1.2" className="pc-man__eye" />
      <circle cx="3.5" cy="3" r="1.2" className="pc-man__eye" />
      <path d="M-3 7 Q0 9.5 3 7" className="pc-man__smile" />
      <path d="M-11 -1 Q0 -15 11 -1 Z" className="pc-man__cap" />
      <path d="M-3 -2 Q8 -5 15 1 L14 3.5 Q6 0 -3 1 Z" className="pc-man__brim" />
      <foreignObject x="-34" y="46" width="68" height="22">
        <div className="pc-man__tag" title={name}>
          {catches > 0 && <b>{catches}</b>}
          {name}
        </div>
      </foreignObject>
    </g>
  )
}

// Un peñasco de lava en la orilla, con su espuma.
function Rock({ x, y, s = 1, i = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="16" className="pc-rock__foam" style={{ animationDelay: `${(i % 4) * 0.5}s` }} />
      <path d="M-11 3 L-7 -8 L3 -11 L11 -4 L9 7 L-3 10 Z" className="pc-rock" />
      <path d="M-7 -8 L3 -11 L11 -4 L2 -2 L-5 -2 Z" className="pc-rock__hi" />
      <path d="M-3 10 L9 7 L5 3 L-4 5 Z" className="pc-rock__dk" />
    </g>
  )
}

const COASTS = [
  {
    flip: false,
    area: 'M0 0 H90 Q60 80 80 150 Q40 220 70 300 Q30 360 0 380 Z',
    edge: 'M90 0 Q60 80 80 150 Q40 220 70 300 Q30 360 0 380',
    rocks: [[80, 36, 1.1], [72, 78, 0.9], [79, 150, 1.3], [58, 222, 1], [68, 298, 1.2], [33, 350, 1]],
    cracks: ['M14 10 L30 46 L22 84 L44 118 L36 150', 'M8 190 L26 226 L16 262 L34 296', 'M52 60 L58 92 M40 160 L56 190 M24 320 L36 346'],
    pores: [[24, 30], [58, 24], [40, 70], [18, 110], [52, 130], [30, 170], [10, 240], [38, 264], [18, 330], [44, 10]],
  },
  {
    flip: true,
    area: 'M0 0 H70 Q40 100 75 190 Q30 260 0 300 Z',
    edge: 'M70 0 Q40 100 75 190 Q30 260 0 300',
    rocks: [[59, 49, 1.2], [56, 97, 0.9], [75, 190, 1.3], [53, 223, 1], [34, 252, 1.1], [10, 290, 1]],
    cracks: ['M12 8 L26 52 L16 96 L36 140 L28 178', 'M8 210 L22 244 L12 274', 'M44 70 L48 104 M30 150 L46 176'],
    pores: [[20, 24], [44, 20], [28, 66], [12, 120], [40, 150], [20, 190], [10, 250], [30, 226], [50, 40]],
  },
]

// La costa de lava: roca con luz de atardecer, grietas calientes, peñascos y espuma que rompe.
function Coast({ flip, area, edge, rocks, cracks, pores }) {
  return (
    <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined} pointerEvents="none">
      <path d={edge} className="pc-shallows" filter="url(#pc-blur2)" />
      <path d={area} className="pc-lava" />
      <path d={area} fill="url(#pc-pumice)" opacity="0.7" />
      {pores.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={2 + (i % 3)} className="pc-pore" />
      ))}
      {cracks.map((d, i) => (
        <path key={i} d={d} className="pc-crack" />
      ))}
      <path d={edge} className="pc-rim" transform="translate(-4 0)" />
      <path d={edge} className="pc-lava__edge" />
      <path d={edge} className="pc-foam pc-foam--soft" filter="url(#pc-blur2)" />
      <path d={edge} className="pc-foam" transform="translate(-3 0)" />
      {rocks.map(([rx, ry, s], i) => (
        <Rock key={i} x={rx} y={ry} s={s} i={i} />
      ))}
    </g>
  )
}

// Campeonato de Pesca en vivo: el servidor guarda inscripciones, lanzamientos y capturas, comprueba las peleas y reparte.
function Pesca({ onExit, juegos }) {
  const [live, setLive] = useState(null)
  const [sending, setSending] = useState(false)
  const [sound, setSound] = useState(() => !isMuted())
  const [burst, setBurst] = useState(null)
  const [aim, setAim] = useState(null)
  const [toasts, setToasts] = useState([])
  const [fightView, setFightView] = useState(null) // lo que se pinta de la pelea (se copia de fight.current)
  const [mineFx, setMineFx] = useState(null) // mi último lanzamiento a la espera de la respuesta { x, y, at, land }
  const [, setFrame] = useState(0)
  const skew = useRef(null)
  const applied = useRef(0)
  const fight = useRef(null) // { id, at, fish, st, r, reel, toggles, sent }
  const holding = useRef(false)
  const seen = useRef({ feed: new Set(), marlin: null, result: null, beeps: null, primed: null, done: new Set() })
  const stepRef = useRef(null)
  const lastCast = useRef(0) // cuándo lancé por última vez (para saber si un pez enganchado es de ahora o de antes)
  const stage = useRef(null)
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const shownBank = useCountUp(balance)

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'pesca', ...message })
      const got = Date.now()
      if (body?.pesca) {
        if (skew.current === null || got - sent < 1500) skew.current = body.pesca.now - (sent + got) / 2
        if (body.pesca.now >= applied.current) {
          applied.current = body.pesca.now
          setLive(body.pesca)
        }
      }
      return body
    },
    [request],
  )

  const toast = useCallback((text, kind = '') => {
    const id = `${Date.now()}:${Math.random()}`
    setToasts((list) => [...list.slice(-3), { id, text, kind }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), TOAST_MS)
  }, [])

  // Cuadros: el mar se mueve con el reloj (las sombras salen de sus parámetros) y la pelea avanza paso a paso.
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      stepRef.current?.()
      if (ts - last >= 33) {
        last = ts
        setFrame((n) => (n + 1) % 1000000)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ready = skew.current !== null && live !== null
  const t = clock()
  const { round, phase, start, end } = phaseAt(t)
  const view = live?.round === round ? live : null
  const joined = Boolean(view?.joined)
  const ms = t - start
  const mine = view?.mine ?? null

  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])

  // En directo: cada cambio avisa por Realtime y se pide el estado (los avisos seguidos se juntan en uno).
  useEffect(() => {
    let timer = null
    const channel = supabase
      .channel(TOPIC)
      .on('broadcast', { event: 'cambio' }, () => {
        if (timer) return
        timer = setTimeout(() => {
          timer = null
          if (document.visibilityState === 'visible') ask({ a: 'sync' })
        }, COALESCE_MS)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [ask])

  // Respaldo: sondeo (más a menudo pescando) y peticiones justo al empezar la pesca y cuando ya está repartido.
  useEffect(() => {
    if (!ready) return
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    const at = [start + 150, end + PAID_WAIT_MS, start - 5000]
    const timers = at.map((when) => when - clock()).filter((wait) => wait > 0).map((wait) => setTimeout(sync, wait))
    const poll = setInterval(() => sync(), phaseAt(clock()).phase === 'fish' ? POLL_FISH_MS : POLL_JOIN_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, round, phase, start, end, ask, clock])

  // --- La pelea ---
  const finishFight = useCallback(
    async (f) => {
      if (f.sent) return
      f.sent = true
      seen.current.done.add(f.key)
      const body = await ask({ a: 'land', fish: f.id, toggles: f.toggles, ticks: f.st.tick })
      fight.current = null
      setFightView(null)
      const out = body?.landed
      if (!out) return
      const name = SPECIES[out.fish.sp].name
      if (out.end === 'landed') {
        const big = out.fish.sp === 'marlin' || out.fish.sp === 'atun'
        playWin(big)
        if (out.fish.sp === 'marlin') playOvation()
        buzz(big ? [60, 40, 120] : 40)
        toast(`¡${name} de ${fmtKg(out.fish.g)}!`, out.fish.sp === 'marlin' ? 'gold' : 'good')
      } else {
        if (out.end === 'snap') playSnap()
        else playLose()
        toast(`${END_TEXT[out.end]}: ${out.end === 'cut' ? 'el' : 'era un'} ${name.toLowerCase()}.`, 'bad')
      }
    },
    [ask, toast],
  )

  // Avanza la pelea hasta el paso que toca según el reloj (se llama en cada cuadro).
  stepRef.current = stepFight
  function stepFight() {
    const f = fight.current
    if (!f || f.sent) return
    const now = clock()
    if (now < f.at) return
    const cap = Math.floor((phaseAt(f.at).end - f.at) / TICK_MS)
    const target = Math.min(MAX_FIGHT_TICKS, cap, Math.floor((now - f.at) / TICK_MS))
    let changed = false
    while (f.st.tick < target && !f.st.end) {
      const want = holding.current
      if (want !== f.reel) {
        f.reel = want
        f.toggles.push(f.st.tick)
      }
      const before = f.st
      f.st = fightStep(f.st, f.fish, f.reel, f.r)
      if (f.st.warn === WARN_TICKS && before.warn !== WARN_TICKS) buzz(25)
      if (f.reel && f.st.tick % 6 === 0) playReelTick()
      changed = true
    }
    if (changed) setFightView({ ...f.st, sp: f.fish.sp, started: true })
    if (f.st.end || f.st.tick >= cap) finishFight(f)
  }

  // Al llegar el estado: si tengo un pez enganchado y no hay pelea en marcha, empieza (o, si llego tarde, se da por suelto).
  useEffect(() => {
    const hook = mine?.hook
    if (!hook) return
    const f = fight.current
    if (f && f.key === `${hook.fish.id}:${hook.at}`) return
    if (seen.current.done.has(`${hook.fish.id}:${hook.at}`)) return // ya acabada: una vista vieja que llega tarde
    const elapsed = Math.floor((clock() - hook.at) / TICK_MS)
    const st = fightStart(hook.fish)
    // La pelea empieza cuando la ves: si la respuesta llegó tarde, no se pierde ese rato con el sedal flojo (el servidor
    // solo comprueba que no se cuenten más pasos de los que han pasado desde que picó).
    const fresh = clock() - lastCast.current < 8000
    const next = { key: `${hook.fish.id}:${hook.at}`, id: hook.fish.id, at: fresh ? Math.max(hook.at, clock()) : hook.at, fish: hook.fish, st, r: rng(hook.fish.seed), reel: false, toggles: [], sent: false }
    fight.current = next
    if (!fresh && elapsed > 40) {
      // Volviste a la pantalla con la pelea a medias: sin saber qué pulsaste, el sedal se quedó flojo.
      next.st = { ...st, tick: Math.min(elapsed, MAX_FIGHT_TICKS - 1) }
      let sim = fightStart(hook.fish)
      const r = rng(hook.fish.seed)
      while (!sim.end && sim.tick < elapsed) sim = fightStep(sim, hook.fish, false, r)
      next.st = sim
      if (sim.end) finishFight(next)
      return
    }
    setFightView({ ...st, sp: hook.fish.sp, started: false })
  }, [mine?.hook, clock, finishFight])

  // Mantener para recoger: ratón o dedo en el mar, el botón grande o la barra espaciadora.
  useEffect(() => {
    const down = (e) => {
      if (e.code !== 'Space' || e.repeat) return
      if (fight.current) {
        e.preventDefault()
        holding.current = true
      }
    }
    const up = (e) => {
      if (e.code === 'Space') holding.current = false
    }
    const release = () => {
      holding.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerup', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('blur', release)
    }
  }, [])

  // --- Avisos: capturas de los demás, el marlín, el resultado del campeonato y la cuenta atrás ---
  useEffect(() => {
    if (!view) return
    // La primera vista de cada campeonato no avisa de lo que ya estaba pescado.
    const primed = seen.current.primed === view.round
    seen.current.primed = view.round
    for (const item of view.feed) {
      const key = `${view.round}:${item.name}:${item.at}`
      if (seen.current.feed.has(key)) continue
      seen.current.feed.add(key)
      if (!item.me && primed) {
        toast(`${item.name} saca: ${SPECIES[item.sp].name.toLowerCase()} de ${fmtKg(item.g)}`, item.sp === 'marlin' ? 'gold' : '')
        if (item.sp === 'marlin') playOvation()
      }
    }
    const marlin = view.fish.find((f) => f.sp === 'marlin')
    if (marlin && seen.current.marlin !== view.round && phase === 'fish') {
      seen.current.marlin = view.round
      playHorn()
      toast(`¡MARLÍN AZUL A LA VISTA! Quien lo saque se lleva ${eur(view.bote)}`, 'gold')
    }
  }, [view, phase, toast])

  const myLast = live?.myLast ?? null
  useEffect(() => {
    if (!myLast || myLast.round !== round - 1 || seen.current.result === myLast.round) return
    seen.current.result = myLast.round
    if (myLast.payout > 0 && !myLast.refund) {
      setBurst({
        id: `pc:${myLast.round}`,
        amount: myLast.payout,
        caption: myLast.marlin > 0 ? '¡Bote del Marlín!' : myLast.place === 1 ? '¡Campeón de la Cofradía!' : `${myLast.place}.º puesto`,
        big: myLast.place === 1 || myLast.marlin > 0,
      })
      setTimeout(() => setBurst(null), 4500)
    }
  }, [myLast, round])

  useEffect(() => {
    if (phase !== 'join' || !joined) return
    const left = Math.ceil((start - t) / 1000)
    if (left <= 3 && left >= 1 && seen.current.beeps !== `${round}:${left}`) {
      seen.current.beeps = `${round}:${left}`
      playBeep(1)
    }
  })

  // --- Acciones ---
  async function join() {
    if (sending) return
    setSending(true)
    try {
      const body = await ask({ a: 'join' })
      if (!body?.error) {
        playChip()
        buzz(20)
      }
    } finally {
      setSending(false)
    }
  }

  function pointOf(event) {
    const svg = stage.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const canCast = phase === 'fish' && joined && !mine?.hook && !fight.current && t >= (mine?.ready ?? 0) && !mineFx
  async function cast(p) {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (!validPoint(x, y)) return
    const at = clock()
    lastCast.current = at
    setMineFx({ x, y, at, land: at + castMs(x, y) })
    playSplash()
    try {
      const body = await ask({ a: 'cast', x, y, at })
      if (body?.cast?.bite !== null && body?.cast?.bite !== undefined) {
        const wait = Math.max(0, castMs(x, y) - (Date.now() - (at - (skew.current ?? 0))))
        setTimeout(() => {
          buzz([30, 30, 60])
          playReelTick()
        }, wait)
      }
    } finally {
      setTimeout(() => setMineFx(null), castMs(x, y))
    }
  }

  function onStageDown(event) {
    if (fight.current) {
      holding.current = true
      event.preventDefault()
      return
    }
    if (!canCast) return
    const p = pointOf(event)
    if (p) cast(p)
  }
  function onStageMove(event) {
    if (event.pointerType === 'touch') return
    const p = pointOf(event)
    setAim(p && validPoint(p.x, p.y) ? p : null)
  }

  // --- Lo que se pinta ---
  const players = view?.players ?? []
  const spots = useMemo(() => dockSpots(players), [players])
  const meSpot = players.find((p) => p.me) ? spots.get(players.find((p) => p.me).name) : W / 2
  const fishList = view?.fish ?? []
  const fishById = new Map(fishList.map((f) => [f.id, f]))
  const free = phase === 'fish' ? fishList.filter((f) => !f.taken) : []
  const hooked = []
  for (const p of players) {
    if (!p.hook) continue
    const f = fishById.get(p.hook.fish) ?? (p.me ? mine?.hook?.fish : null)
    if (!f) continue
    const pos = fishAt(f, p.hook.at - start)
    if (pos) hooked.push({ p, f, pos })
  }
  // Mi pez enganchado aunque el servidor aún no lo enseñe como tal en la lista.
  if (mine?.hook && !hooked.some((h) => h.p.me) && t >= mine.hook.at) {
    const pos = fishAt(mine.hook.fish, mine.hook.at - start)
    const me = players.find((p) => p.me)
    if (pos && me) hooked.push({ p: me, f: mine.hook.fish, pos })
  }
  const lures = []
  for (const p of players) {
    if (p.me || !p.lure || p.hook) continue
    if (t > p.lure.land + RECAST_MS) continue
    lures.push({ key: p.name, from: spots.get(p.name) ?? W / 2, ...p.lure })
  }
  if (mineFx) lures.push({ key: 'me', me: true, from: meSpot, ...mineFx })
  else if (mine?.lure && !mine.hook && t < mine.ready) lures.push({ key: 'me', me: true, from: meSpot, ...mine.lure })

  const fighting = fightView && mine?.hook && t >= mine.hook.at
  const myG = players.find((p) => p.me)?.g ?? 0
  const myPlace = players.findIndex((p) => p.me) + 1
  const recast = joined && phase === 'fish' && !mine?.hook && mine && t < mine.ready ? mine.ready - t : 0
  const last = live?.last && live.last.round === round - 1 ? live.last : null
  const showPodium = phase === 'join' && last && !last.refund
  const n = view?.n ?? 0
  const split = splitOf(Math.max(1, Math.min(3, n)))
  const marlinIn = fishList.some((f) => f.sp === 'marlin' && !f.taken)

  return (
    <main className={`app pc-app ${fighting ? 'pc-app--fight' : ''}`}>
      <header className="top">
        <h1>Campeonato de Pesca</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div className="pc-hud-bote">
              <dt>Bote del Marlín</dt>
              <dd>{eur(view?.bote ?? live?.bote ?? 0)}</dd>
            </div>
          </dl>
          <div className="toggles">
            <button type="button" className="tg tg--back" onClick={onExit}>
              Juegos
            </button>
            <button
              type="button"
              className="tg tg--sound"
              aria-pressed={sound}
              onClick={() => {
                setMuted(sound)
                setSound(!sound)
              }}
            >
              Sonido
            </button>
            <Help className="tg tg--help" title="Cómo se juega al Campeonato de Pesca" wide>
              <p>
                Cada {ROUND_MS / 60000} minutos hay un campeonato en La Restinga. Durante {JOIN_MS / 1000} s te inscribes por{' '}
                <b>{eur(ENTRY)}</b>; luego todos pescáis <b>en el mismo mar</b> durante {FISH_MS / 1000} s. Gana quien saque más kilos.
              </p>
              <p>
                <b>Lanzar.</b> Toca el agua donde quieras lanzar. El anzuelo tarda en caer (de {sec(castMs(W / 2, H - 40))} a{' '}
                {sec(castMs(0, 0))} s, más cuanto más lejos): apunta <b>por delante</b> de la sombra, a donde va a estar. Si cae cerca de
                un pez libre, pica y es tuyo; nadie más lo puede enganchar. Si no, el anzuelo tarda {sec(RECAST_MS)} s en volver.
              </p>
              <p>
                <b>Pelear.</b> Mantén pulsado (en el mar, el botón o la <kbd>barra espaciadora</kbd>) para recoger sedal y suelta para
                aflojar. Si tiras con el sedal muy tenso, <b>se parte</b>; si lo dejas flojo demasiado rato, el pez se suelta; y si
                se lleva todo el sedal, se escapa. Antes de cada carrera el pez se revuelve (<b>¡Va a correr!</b>): suelta mientras
                corre y recoge cuando descansa. Los grandes se cansan si los trabajas.
              </p>
              <p>
                <b>Premios.</b> De cada inscripción, el {Math.round(BOTE_CUT * 100)} % va al <b>Bote del Marlín</b> y el resto al bote del
                campeonato; con {COFRADIA_MIN} pescadores o más, la Cofradía pone {eur(COFRADIA_PER)} por pescador. Con un pescador que
                saca algo se lo lleva entero; con dos, 65 % y 35 %; con tres o más, 50 %, 30 % y 20 % para el podio. El marlín azul no
                sale siempre: quien lo saque se lleva además <b>todo el Bote del Marlín</b>. Si pescas solo, o nadie saca nada, se
                devuelve la inscripción (menos lo del bote).
              </p>
              <p>
                <b>Liga de la Cofradía.</b> En cada campeonato de dos o más, el 1.º suma {LEAGUE_POINTS[0]} puntos, el 2.º{' '}
                {LEAGUE_POINTS[1]}, el 3.º {LEAGUE_POINTS[2]} y el resto que pesque algo, 1. La liga se reinicia con la semana.
              </p>
              <div className="pc-guide">
                {SPECIES_ORDER.map((sp) => (
                  <div key={sp} className="pc-guide__row">
                    <Silhouette sp={sp} />
                    <span>
                      <b>{SPECIES[sp].name}</b>
                      {SPECIES[sp].kg[0].toLocaleString('es-ES')}–{SPECIES[sp].kg[1].toLocaleString('es-ES')} kg
                      {sp === 'morena' && ' · tirones muy bruscos'}
                      {sp === 'atun' && ' · dos por campeonato'}
                      {sp === 'marlin' && ' · a veces; lleva el bote'}
                    </span>
                  </div>
                ))}
              </div>
            </Help>
          </div>
        </div>
      </header>

      <div className="pc">
        <section className="pc-stage" aria-label="El mar de La Restinga">
          <svg
            ref={stage}
            className={`pc-sea ${canCast ? 'pc-sea--cast' : ''}`}
            viewBox={`0 0 ${W} ${STAGE_H}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerLeave={() => setAim(null)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <defs>
              <linearGradient id="pc-water" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0a2f62" />
                <stop offset="0.3" stopColor="#0b4f80" />
                <stop offset="0.62" stopColor="#0f7c94" />
                <stop offset="0.86" stopColor="#25aaa6" />
                <stop offset="1" stopColor="#52cdb4" />
              </linearGradient>
              <radialGradient id="pc-sun" cx="0.5" cy="0" r="0.75">
                <stop offset="0" stopColor="#ffb25c" stopOpacity="0.4" />
                <stop offset="0.45" stopColor="#ff8a5c" stopOpacity="0.14" />
                <stop offset="1" stopColor="#ff8a5c" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pc-vig" cx="0.5" cy="0.55" r="0.72">
                <stop offset="0.55" stopColor="#021428" stopOpacity="0" />
                <stop offset="1" stopColor="#021428" stopOpacity="0.5" />
              </radialGradient>
              <linearGradient id="pc-shallow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8ff5d4" stopOpacity="0" />
                <stop offset="1" stopColor="#b8ffe0" stopOpacity="0.32" />
              </linearGradient>
              <linearGradient id="pc-rock" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#07050b" />
                <stop offset="0.7" stopColor="#1d1626" />
                <stop offset="1" stopColor="#35283f" />
              </linearGradient>
              <pattern id="pc-pumice" width="22" height="22" patternUnits="userSpaceOnUse">
                <circle cx="5" cy="6" r="1.6" fill="#000" opacity="0.5" />
                <circle cx="16" cy="14" r="2.2" fill="#000" opacity="0.4" />
                <circle cx="12" cy="3" r="1" fill="#8a6a9a" opacity="0.35" />
                <circle cx="3" cy="17" r="1" fill="#8a6a9a" opacity="0.3" />
              </pattern>
              <pattern id="pc-caustic" width="160" height="110" patternUnits="userSpaceOnUse">
                <path d="M0 22 Q20 2 40 20 T80 18 T120 24 T160 22 M0 74 Q26 54 52 72 T104 70 T160 74 M30 46 q14 -10 28 0 q-14 10 -28 0 M104 40 q12 -9 24 0 q-12 9 -24 0 M70 96 q10 -7 20 0 M10 100 q8 -6 16 0" fill="none" stroke="#d6fbff" strokeWidth="1.6" strokeLinecap="round" />
              </pattern>
              <filter id="pc-blur" x="-30%" y="-60%" width="160%" height="220%">
                <feGaussianBlur stdDeviation="1.8" />
              </filter>
              <filter id="pc-blur2" x="-30%" y="-10%" width="160%" height="120%">
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
              <pattern id="pc-planks" width="200" height="80" patternUnits="userSpaceOnUse">
                <rect width="200" height="80" fill="#4a2c15" />
                <rect y="0" width="200" height="25" fill="#a06f3f" />
                <rect y="27" width="200" height="24" fill="#8c5e33" />
                <rect y="53" width="200" height="25" fill="#97673a" />
                <rect y="0" width="200" height="2" fill="#d8a56b" opacity="0.45" />
                <rect y="27" width="200" height="2" fill="#d8a56b" opacity="0.35" />
                <rect y="53" width="200" height="2" fill="#d8a56b" opacity="0.4" />
                <rect x="68" y="0" width="2" height="25" fill="#4a2c15" />
                <rect x="150" y="27" width="2" height="24" fill="#4a2c15" />
                <rect x="16" y="53" width="2" height="25" fill="#4a2c15" />
                <rect x="112" y="53" width="2" height="25" fill="#4a2c15" />
                <path d="M6 9 H52 M82 15 H140 M150 6 H190 M10 38 H80 M100 44 H138 M160 36 H196 M26 63 H92 M124 70 H180" stroke="#6a4222" strokeWidth="1" opacity="0.5" />
                <g fill="#3a2210" opacity="0.8">
                  <circle cx="64" cy="12" r="1.2" />
                  <circle cx="74" cy="12" r="1.2" />
                  <circle cx="146" cy="39" r="1.2" />
                  <circle cx="156" cy="39" r="1.2" />
                  <circle cx="12" cy="66" r="1.2" />
                  <circle cx="22" cy="66" r="1.2" />
                  <circle cx="108" cy="66" r="1.2" />
                  <circle cx="118" cy="66" r="1.2" />
                </g>
              </pattern>
              <linearGradient id="pc-dockshade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#031320" stopOpacity="0" />
                <stop offset="1" stopColor="#031320" stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id="pc-dockdepth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1a0a00" stopOpacity="0.32" />
                <stop offset="0.25" stopColor="#1a0a00" stopOpacity="0" />
                <stop offset="1" stopColor="#1a0a00" stopOpacity="0.38" />
              </linearGradient>
              <radialGradient id="pc-lampglow">
                <stop offset="0" stopColor="#ffd88a" stopOpacity="0.55" />
                <stop offset="1" stopColor="#ffb25c" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pc-meglow">
                <stop offset="0" stopColor="#ffd25e" stopOpacity="0.38" />
                <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="url(#pc-water)" />
            <rect width={W} height={H} fill="url(#pc-sun)" />
            <rect y={H - 150} width={W} height="150" fill="url(#pc-shallow)" />
            {/* Luz que se mueve bajo el agua (cáusticas). */}
            <g className="pc-caustics" pointerEvents="none">
              <rect className="pc-caustics__a" x="-160" width={W + 320} height={H} fill="url(#pc-caustic)" />
              <rect className="pc-caustics__b" x="-160" width={W + 320} height={H} fill="url(#pc-caustic)" />
            </g>
            {/* Brillos del agua y el reflejo del sol. */}
            <g className="pc-glints">
              {Array.from({ length: 18 }, (_, i) => (
                <path key={i} d={`M${(i * 157) % W} ${30 + ((i * 89) % (H - 80))} q 14 -6 28 0`} style={{ animationDelay: `${(i % 6) * 0.4}s` }} />
              ))}
            </g>
            <g className="pc-glints pc-glints--sun">
              {Array.from({ length: 16 }, (_, i) => (
                <path key={i} d={`M${500 + Math.sin(i * 2.3) * (30 + i * 9)} ${20 + i * 22} h ${22 - i}`} style={{ animationDelay: `${(i % 5) * 0.45}s` }} />
              ))}
            </g>
            <rect width={W} height={H} fill="url(#pc-vig)" pointerEvents="none" />
            {COASTS.map((c, i) => (
              <Coast key={i} {...c} />
            ))}

            {/* Sombras libres. */}
            <g filter="url(#pc-blur)">
              {free.map((f) => {
                const p = fishAt(f, ms)
                return p ? <FishShadow key={f.id} sp={f.sp} x={p.x} y={p.y} dir={p.dir} t={t} /> : null
              })}
            </g>

            {/* Peces enganchados, con su sedal hasta el pescador. */}
            {hooked.map(({ p, f, pos }) => {
              const from = spots.get(p.name) ?? W / 2
              const tight = p.me && fightView ? Math.min(1, fightView.tension / SNAP) : 0.5
              return (
                <g key={`h${f.id}`} className={`pc-hooked ${p.me ? 'pc-hooked--me' : ''}`}>
                  <path className="pc-line" d={`M${from + 14} ${DOCK_TOP - 20} Q${(from + pos.x) / 2} ${(DOCK_TOP + pos.y) / 2 + 60 * (1 - tight)} ${pos.x} ${pos.y}`} />
                  <circle className="pc-splash" cx={pos.x} cy={pos.y} r={SPECIES[f.sp].size * 0.5} />
                  <g filter="url(#pc-blur)">
                    <FishShadow sp={f.sp} x={pos.x} y={pos.y} dir={pos.dir} t={t} thrash />
                  </g>
                  {!p.me && (
                    <text className="pc-hooked__who" x={pos.x} y={pos.y - SPECIES[f.sp].size * 0.45 - 8}>
                      {p.name} pelea
                    </text>
                  )}
                </g>
              )
            })}

            {/* Anzuelos: en el aire (un arco desde el muelle) o flotando. */}
            {lures.map((l) => {
              const k = Math.min(1, Math.max(0, (t - l.at) / Math.max(1, l.land - l.at)))
              const sx = l.from + 14
              const sy = DOCK_TOP - 20
              const cx = (sx + l.x) / 2
              const cy = Math.min(sy, l.y) - 140
              const x = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * cx + k * k * l.x
              const y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * cy + k * k * l.y
              return (
                <g key={l.key} className={`pc-lure ${l.me ? 'pc-lure--me' : ''}`}>
                  <path className="pc-line pc-line--slack" d={`M${sx} ${sy} Q${cx} ${cy + 80} ${x} ${y}`} />
                  {k >= 1 && <circle className="pc-ripple" cx={l.x} cy={l.y} r="10" />}
                  <circle className="pc-bobber" cx={x} cy={y} r={k >= 1 ? 7 : 6} />
                </g>
              )
            })}

            {/* Mira: dónde caerá el anzuelo y cuánto tarda. */}
            {canCast && aim && (
              <g className="pc-aim" pointerEvents="none">
                <path className="pc-aim__path" d={`M${meSpot + 14} ${DOCK_TOP - 20} L${aim.x} ${aim.y}`} />
                <circle cx={aim.x} cy={aim.y} r={BITE_R} />
                <circle cx={aim.x} cy={aim.y} r="3" className="pc-aim__dot" />
                <text x={aim.x} y={aim.y - BITE_R - 8}>
                  {sec(castMs(aim.x, aim.y))} s
                </text>
              </g>
            )}

            {/* El muelle: sombra en el agua, tablones, viga, banderines de la Cofradía, faroles y noray. */}
            <rect x="0" y={H - 16} width={W} height="16" fill="url(#pc-dockshade)" />
            <path className="pc-dockfoam" d={`M0 ${H - 3} q 25 -5 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0`} />
            <rect x="0" y={H} width={W} height={STAGE_H - H} fill="url(#pc-planks)" />
            <rect x="0" y={H} width={W} height={STAGE_H - H} fill="url(#pc-dockdepth)" />
            <rect x="0" y={H - 5} width={W} height="11" className="pc-dock-edge" />
            <rect x="0" y={H - 5} width={W} height="3" className="pc-dock-edge__hi" />
            <rect x="0" y={H + 5} width={W} height="2.5" fill="rgba(20,8,0,0.45)" />
            <Bunting />
            {[34, 966].map((x) => (
              <g key={x} transform={`translate(${x} ${H})`}>
                <circle className="pc-lamp__glow" cx="0" cy="-8" r="60" fill="url(#pc-lampglow)" />
                <rect x="-5" y="2" width="10" height="72" rx="3" className="pc-post" />
                <rect x="-7" y="-2" width="14" height="5" rx="2" className="pc-post__cap" />
                <path d="M0 -2 V-16" className="pc-lamp__arm" />
                <rect x="-6" y="-26" width="12" height="15" rx="3" className="pc-lamp__body" />
                <rect x="-3.5" y="-23" width="7" height="9" rx="2" className="pc-lamp__flame" />
                <path d="M-7 -26 L0 -33 L7 -26 Z" className="pc-lamp__roof" />
              </g>
            ))}
            {[88, 912].map((x) => (
              <g key={x} transform={`translate(${x} ${H + 24})`} className="pc-bollard">
                <ellipse cx="0" cy="12" rx="12" ry="4" fill="rgba(0,0,0,0.3)" />
                <rect x="-8" y="-6" width="16" height="18" rx="4" className="pc-bollard__body" />
                <ellipse cx="0" cy="-6" rx="10" ry="4.5" className="pc-bollard__top" />
                <path d="M-9 0 q9 6 18 0 M-9 5 q9 6 18 0" className="pc-rope" />
              </g>
            ))}
            <g transform={`translate(${38} ${H + 56})`}>
              <circle r="11" className="pc-buoy" />
              <circle r="4.5" className="pc-buoy__hole" />
              <path d="M-9 -6 L-3 -2 M9 6 L3 2 M-9 6 L-3 2 M9 -6 L3 -2" className="pc-buoy__band" />
            </g>
            <path className="pc-rope pc-rope--long" d={`M${88} ${H + 36} Q130 ${H + 56} 38 ${H + 44}`} />
            {players.map((p) => (
              <Pescador key={p.name} x={spots.get(p.name)} name={p.name} me={p.me} fighting={Boolean(p.hook)} catches={p.n} />
            ))}
            {!players.length && (
              <text className="pc-empty" x={W / 2} y={H + 52}>
                El muelle está vacío: ¡sé el primero en inscribirte!
              </text>
            )}
          </svg>

          {/* Encima del mar: la inscripción, el podio, los avisos y la pelea. */}
          {!ready && <div className="pc-veil">Preparando las cañas…</div>}

          {ready && phase === 'join' && (
            <div className={`pc-veil pc-veil--join ${showPodium ? 'pc-veil--podium' : ''}`}>
              {showPodium && <Podium last={last} />}
              <div className="pc-signup">
                <p className="pc-signup__kicker">Inscripción abierta · empieza en {clockOf(start - t)}</p>
                {joined ? (
                  <p className="pc-signup__in">¡Estás inscrito! Prepara la caña.</p>
                ) : (
                  <button type="button" className="pc-cta" disabled={sending || balance < ENTRY} onClick={join}>
                    Inscribirme · {eur(ENTRY)}
                  </button>
                )}
                <p className="pc-signup__pot">
                  {plural(n, 'pescador', 'pescadores')} · bote de {eur(view?.pot ?? 0)}
                  {n < COFRADIA_MIN ? ` · con ${COFRADIA_MIN} la Cofradía pone ${eur(COFRADIA_PER)} por cabeza` : ` (la Cofradía pone ${eur(view?.cofradia ?? 0)})`}
                </p>
              </div>
            </div>
          )}

          {ready && phase === 'fish' && !joined && (
            <div className="pc-banner">Estás mirando: la inscripción del siguiente campeonato abre en {clockOf(end - t)}.</div>
          )}
          {ready && phase === 'fish' && joined && recast > 0 && !mineFx && <div className="pc-banner pc-banner--soft">Recogiendo el anzuelo… {sec(recast)} s</div>}
          {ready && phase === 'fish' && marlinIn && <div className="pc-marlin">Marlín azul en el agua · {eur(view?.bote ?? 0)}</div>}

          <ol className="pc-toasts" aria-live="polite">
            {toasts.map((x) => (
              <li key={x.id} className={`pc-toast ${x.kind ? `pc-toast--${x.kind}` : ''}`}>
                {x.text}
              </li>
            ))}
          </ol>

          {fightView && <FightHud st={fightView} started={Boolean(fighting)} holding={holding} />}
        </section>

        <aside className="pc-side">
          <div className="pc-clock" style={{ '--p': Math.max(0, Math.min(1, ((phase === 'join' ? start : end) - t) / (phase === 'join' ? JOIN_MS : FISH_MS))) }}>
            <span className="pc-clock__label">{phase === 'join' ? 'Inscripción' : 'Pesca'}</span>
            <span className={`pc-clock__time ${phase === 'fish' && end - t < 10000 ? 'pc-clock__time--hot' : ''}`}>{clockOf((phase === 'join' ? start : end) - t)}</span>
            {joined && phase === 'fish' && (
              <span className="pc-clock__me">
                {fmtKg(myG)} · {myPlace}.º de {players.length}
              </span>
            )}
            <span className="pc-clock__bar" aria-hidden="true" />
          </div>

          <div className="pc-pots">
            <div>
              <span>Bote del campeonato</span>
              <b>{eur(view?.pot ?? 0)}</b>
              <small>{n >= 2 ? `reparto ${split.map((p) => `${Math.round(p * 100)} %`).join(' · ')}` : 'se reparte entre el podio'}</small>
            </div>
            <div className="pc-pots__marlin">
              <span>Bote del Marlín</span>
              <b>{eur(view?.bote ?? live?.bote ?? 0)}</b>
              <small>para quien saque el marlín azul</small>
            </div>
          </div>

          <section className="pc-card">
            <h2>{phase === 'join' ? 'Inscritos' : 'Clasificación'}</h2>
            {players.length ? (
              <ol className="pc-rank">
                {players.map((p, i) => (
                  <li key={p.name} className={`${p.me ? 'is-me' : ''} ${p.hook ? 'is-fight' : ''}`}>
                    <span className="pc-rank__pos">{phase === 'fish' ? i + 1 : '·'}</span>
                    <Avatar name={p.name} src={p.avatar} size={26} />
                    <span className="pc-rank__name">{p.name}</span>
                    <span className="pc-rank__kg">
                      {p.hook ? '🎣 ' : ''}
                      {fmtKg(p.g)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="pc-muted">Nadie todavía.</p>
            )}
          </section>

          {view?.feed?.length > 0 && (
            <section className="pc-card">
              <h2>Capturas</h2>
              <ul className="pc-feed">
                {view.feed.slice(0, 6).map((c) => (
                  <li key={`${c.name}:${c.at}`} className={c.me ? 'is-me' : ''}>
                    <Silhouette sp={c.sp} />
                    <span>
                      <b>{c.name}</b> {SPECIES[c.sp].name.toLowerCase()}
                    </span>
                    <span className="pc-feed__kg">{fmtKg(c.g)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="pc-card pc-league">
            <h2>Liga de la Cofradía</h2>
            {live?.league?.length ? (
              <ol className="pc-rank">
                {live.league.map((r, i) => (
                  <li key={r.name} className={r.me ? 'is-me' : ''}>
                    <span className="pc-rank__pos">{i === 0 ? '👑' : i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={24} />
                    <span className="pc-rank__name">{r.name}</span>
                    <span className="pc-rank__kg">{r.pts} pts</span>
                  </li>
                ))}
                {live.myLeague && (
                  <li className="is-me">
                    <span className="pc-rank__pos">{live.myLeague.place}</span>
                    <Avatar name={live.myLeague.name} src={live.myLeague.avatar} size={24} />
                    <span className="pc-rank__name">{live.myLeague.name}</span>
                    <span className="pc-rank__kg">{live.myLeague.pts} pts</span>
                  </li>
                )}
              </ol>
            ) : (
              <p className="pc-muted">Aún no hay puntos esta semana. El primer campeonato con dos o más pescadores abre la liga.</p>
            )}
            {live?.record && (
              <p className="pc-record">
                Récord de la semana: <b>{SPECIES[live.record.sp].name}</b> de {fmtKg(live.record.g)} · {live.record.name}
              </p>
            )}
          </section>
        </aside>
      </div>

      {burst && <WinBurst key={burst.id} amount={burst.amount} caption={burst.caption} big={burst.big} coins />}
    </main>
  )
}

// El podio del último campeonato (encima del mar mientras se inscribe la gente).
function Podium({ last }) {
  const top = last.players.filter((p) => p.g > 0).slice(0, 3)
  const order = [top[1], top[0], top[2]]
  return (
    <div className="pc-podium">
      <p className="pc-podium__title">Podio del último campeonato</p>
      <div className="pc-podium__steps">
        {order.map((p, i) =>
          p ? (
            <div key={p.name} className={`pc-step pc-step--${i === 1 ? 1 : i === 0 ? 2 : 3} ${p.me ? 'is-me' : ''}`}>
              <Avatar name={p.name} src={p.avatar} size={i === 1 ? 46 : 36} />
              <b>{p.name}</b>
              <span>{fmtKg(p.g)}</span>
              {p.paid > 0 && <em>+{eur(p.paid)}</em>}
              <i>{i === 1 ? 1 : i === 0 ? 2 : 3}</i>
            </div>
          ) : (
            <div key={i} className="pc-step pc-step--none" />
          ),
        )}
      </div>
      {last.marlin && (
        <p className="pc-podium__marlin">
          🏆 {last.marlin.name} sacó un marlín azul de {fmtKg(last.marlin.g)} y se llevó el bote: {eur(last.marlin.bote)}
        </p>
      )}
    </div>
  )
}

// La pelea: tensión del sedal, sedal fuera y el botón de recoger.
function FightHud({ st, started, holding }) {
  const tension = Math.min(1, st.tension / SNAP)
  const slack = st.tension < SLACK
  const run = st.run > 0
  const warn = st.warn > 0
  const lineLeft = Math.min(1, st.line / (st.maxLine * 1.6))
  const sp = SPECIES[st.sp]
  const hot = tension > 0.8
  const on = holding.current
  const call = run ? '¡CORRE! Suelta' : warn ? '¡Va a correr!' : slack ? 'Sedal flojo: recoge' : hot ? '¡Cuidado, se parte!' : 'Recoge'
  return (
    <div className={`pc-fight ${run ? 'pc-fight--run' : ''} ${warn ? 'pc-fight--warn' : ''} ${hot ? 'pc-fight--hot' : ''} ${slack && !run && !warn ? 'pc-fight--slack' : ''}`}>
      <div className="pc-fight__head">
        <b>{started ? `¡Ha picado! Parece ${sp.size > 90 ? 'algo enorme' : sp.size > 60 ? 'un pez grande' : 'un pez'}` : '¡Pica!'}</b>
        <span className="pc-fight__call">{call}</span>
      </div>
      <div className="pc-meter pc-meter--tension" aria-label="Tensión del sedal">
        <span className="pc-meter__zone" />
        <span className="pc-meter__fill" style={{ '--v': tension }} />
        <span className="pc-meter__label">Tensión</span>
        <span className="pc-meter__snap" aria-hidden="true">
          ✕
        </span>
      </div>
      <div className="pc-meter pc-meter--line" aria-label="Sedal fuera">
        <span className="pc-meter__fill" style={{ '--v': lineLeft }} />
        <span className="pc-meter__label">Sedal fuera</span>
      </div>
      <button
        type="button"
        className={`pc-reel ${on ? 'pc-reel--on' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault()
          holding.current = true
        }}
        onPointerUp={() => {
          holding.current = false
        }}
        onPointerCancel={() => {
          holding.current = false
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="pc-reel__hub">
          Mantén para recoger
        </span>
      </button>
    </div>
  )
}

export default Pesca
