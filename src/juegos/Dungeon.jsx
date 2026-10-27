import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from './useEffectEvent.js'
import {
  CLOSE_MS,
  DEPTH,
  DOORS,
  MAX_GAIN,
  MIN_BET,
  ROOMS,
  STEP,
  clampBet,
  gainLabel,
  grow,
  loses,
  maxBetFor,
  toneOf,
} from './dungeon.js'
import { eur } from './money.js'
import {
  buzz,
  isMuted,
  playBeep,
  playCash,
  playChip,
  playClank,
  playClunk,
  playCreak,
  playGrowl,
  playPeg,
  playSteps,
  playWin,
  setMuted,
} from './sound.js'
import { useCountUp } from './useCountUp.js'
import WinBurst from './WinBurst.jsx'
import Help from './Help.jsx'
import { Behind, DoorLeaf, Fall, Frame, Hoard, Torch } from './DungeonArt.jsx'
import HallScene from './DungeonScene.jsx'
import './Dungeon.css'

const OPEN_MS = 650 // la puerta elegida se abre
const REST_MS = 400 // después se abren las otras dos
const SHOW_MS = 900 // lo que se ve el resultado antes de la cuenta atrás
const AUTO_MS = 2600 // cuenta atrás para entrar solo en la sala siguiente
const HISTORY = 40

// Textos de ambiente (solo de adorno: el resultado lo decide el servidor).
const MONSTERS = {
  0: ['Un trol de las cavernas', 'Un trol con garrote'],
  1: ['Un esqueleto con hacha', 'Un guerrero esquelético'],
  2: ['Un espectro helado', 'Un alma en pena'],
  4: ['Una araña gigante', 'La reina de las arañas'],
}
const TRAPS = ['Una lluvia de pinchos', 'Un foso sin fondo', 'Una nube de gas venenoso', 'Una guillotina oxidada']
const CHESTS = [
  'Un cofre rebosante de doblones',
  'Un saco de rubíes',
  'Una corona olvidada',
  'Un cofre de monedas de plata',
  'Un cáliz de oro macizo',
]
const CORRIDORS = [
  'Un pasillo vacío: sigues adelante sin premio.',
  'Telarañas y polvo. Pasas a la siguiente sala sin premio.',
  'Un pasillo silencioso. Sigues adelante con lo que llevas.',
]
const any = (list) => list[Math.floor(Math.random() * list.length)]

function flavorOf(kind, room, timeout) {
  const late = timeout ? '¡Se acabó el tiempo y el laberinto eligió por ti! ' : ''
  if (kind === 'chest') return `${late}${any(CHESTS)}: el botín se multiplica ${gainLabel(room)}.`
  if (kind === 'empty') return late + any(CORRIDORS)
  if (kind === 'mimic') return `${late}¡El cofre tenía dientes! Era un mímico y se come el botín.`
  if (kind === 'trap') return `${late}¡${any(TRAPS)}! Pierdes el botín.`
  if (room === DEPTH - 1) return `${late}¡El dragón Ignaroth despierta! Pierdes el botín.`
  return `${late}¡${any(MONSTERS[room] ?? MONSTERS[0])}! Pierdes el botín.`
}

const NAMES = { chest: 'cofre', empty: 'pasillo vacío', monster: 'monstruo', trap: 'trampa', mimic: 'mímico' }

// El laberinto lo sortea el servidor con el saldo semanal (cuenta en el Score). Cada sala llega entera (qué hay detrás
// de cada puerta y cómo se barajan) y aquí se anima: se ven (peek), se cierran (close), cambian de sitio (shuffle) y
// hay que elegir antes de que se acabe el tiempo (pick). Al elegir, el servidor dice qué había (open) y si sigues.
function Dungeon({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, pot, room } mientras hay una partida en marcha
  const [maze, setMaze] = useState(null) // sala en juego: { id, room, doors, swaps, phase, step, left }
  const [order, setOrder] = useState([0, 1, 2]) // order[posición] = puerta (por dónde estaba al verse)
  const [hall, setHall] = useState(0) // cambia en cada sala nueva (las puertas entran de nuevo)
  const [reveal, setReveal] = useState(null) // resultado: { id, room, doors, pick, kind, text, all, view, shown }
  const [auto, setAuto] = useState(null) // cuenta atrás para la sala siguiente: { id }
  const [asking, setAsking] = useState(false)
  const [last, setLast] = useState(null) // última partida liquidada
  const [history, setHistory] = useState([]) // { id, ratio, stake, end }
  const [streak, setStreak] = useState(0) // salas seguidas cruzadas en esta partida
  const [burst, setBurst] = useState(null)
  const [hurt, setHurt] = useState(0) // sacudida al perder
  const [ready, setReady] = useState(false)
  const lock = useRef(false)
  const doorRefs = useRef([])
  const rects = useRef(null) // dónde estaba cada puerta antes de un cambio de sitio
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  const animating = (reveal !== null && reveal.moving) || (maze !== null && maze.phase !== 'pick')
  useEffect(() => {
    if (!animating && !asking) setBalance(serverBalance)
  }, [serverBalance, animating, asking])
  const shownBank = useCountUp(balance)
  const shownPot = useCountUp(run?.pot ?? 0, 500, 0)

  const record = (result) => {
    setLast(result)
    setHistory((list) => {
      if (list.some((h) => h.id === result.round)) return list
      return [{ id: result.round, ratio: result.payout / result.stake, stake: result.stake, end: result.end }, ...list].slice(
        0,
        HISTORY,
      )
    })
  }

  // Empieza a animar una sala recién llegada del servidor.
  const enter = (view) => {
    setOrder([0, 1, 2])
    setHall(Date.now())
    setReveal(null)
    setAuto(null)
    if (!view.maze) return setMaze(null)
    const { doors, swaps, left } = view.maze
    // Al recargar a mitad de sala las puertas ya no se enseñan: solo queda elegir con el tiempo que quede.
    if (!doors) return setMaze({ id: Date.now(), room: view.room, doors: null, swaps: [], phase: 'pick', step: 0, left })
    setMaze({ id: Date.now(), room: view.room, doors, swaps, phase: 'peek', step: 0 })
    playCreak()
  }

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_dungeon', a: 'sync' })
    const view = body?.solo
    if (!view) return false
    if (view.bet > 0) {
      setRun({ bet: view.bet, pot: view.pot, room: view.room })
      setBet(view.bet)
    } else setRun(null)
    enter(view)
    if (view.last) record(view.last)
    setBalance(view.balance)
    return true
  })
  useEffect(() => {
    let alive = true
    resync().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const room = maze ? maze.room : reveal ? reveal.room : run ? run.room : 0
  const treasure = !run && last?.end === 'treasure' && reveal?.all
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const broke = !run && !animating && balance < MIN_BET
  const busy = asking || animating || !ready
  const canPick = Boolean(run) && maze?.phase === 'pick' && !asking && !reveal
  const between = Boolean(run) && !maze && !asking && !(reveal && reveal.moving)

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_dungeon', ...message })
    const view = body?.solo ?? null
    if (!view) await resync()
    lock.current = false
    setAsking(false)
    return view
  }

  async function start() {
    if (busy || run || shownBet < MIN_BET || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    setStreak(0)
    const view = await act({ a: 'start', bet: shownBet })
    if (!view) return
    setBalance(view.balance)
    setRun({ bet: view.bet, pot: view.pot, room: view.room })
    enter(view)
  }

  async function go() {
    if (!between) return
    const view = await act({ a: 'go' })
    if (!view) return
    setRun({ bet: view.bet, pot: view.pot, room: view.room })
    enter(view)
  }

  // pos: posición elegida (0, 1 o 2), o -1 si se acabó el tiempo.
  async function open(pos) {
    if (!run || !maze || maze.phase !== 'pick' || reveal || lock.current) return
    const view = await act({ a: 'open', door: pos })
    if (!view || !view.doors) return
    const kind = view.ev
    setMaze(null)
    playCreak()
    setReveal({
      id: Date.now(),
      room: view.at,
      doors: view.doors,
      pick: view.pick,
      kind,
      text: flavorOf(kind, view.at, view.timeout),
      all: false,
      moving: true,
      view,
    })
  }

  // --- La sala: se ve, se cierra, cambia de sitio y espera a que elijas. ---
  const stepMaze = useEffectEvent(() => {
    if (!maze) return
    const spec = ROOMS[maze.room]
    if (maze.phase === 'peek') {
      playClunk()
      setMaze({ ...maze, phase: 'close' })
    } else if (maze.phase === 'close') {
      setMaze({ ...maze, phase: maze.swaps.length ? 'shuffle' : 'pick', left: spec.pickMs })
    } else if (maze.phase === 'shuffle') {
      const [a, b] = maze.swaps[maze.step]
      rects.current = doorRefs.current.map((el) => el?.getBoundingClientRect() ?? null)
      setOrder((o) => {
        const next = [...o]
        ;[next[a], next[b]] = [next[b], next[a]]
        return next
      })
      playPeg(maze.step * 2)
      const step = maze.step + 1
      setMaze({ ...maze, step, phase: step >= maze.swaps.length ? 'settle' : 'shuffle' })
    } else if (maze.phase === 'settle') {
      playBeep(2)
      setMaze({ ...maze, phase: 'pick', left: spec.pickMs, since: Date.now() })
    }
  })
  useEffect(() => {
    if (!maze || maze.phase === 'pick') return
    const spec = ROOMS[maze.room]
    const ms = { peek: spec.revealMs, close: CLOSE_MS, shuffle: maze.step === 0 ? 120 : spec.swapMs, settle: spec.swapMs }[
      maze.phase
    ]
    const timer = setTimeout(stepMaze, ms)
    return () => clearTimeout(timer)
  }, [maze?.id, maze?.phase, maze?.step])

  // Tiempo para elegir: al acabarse, el laberinto elige por ti. Pitidos en el último segundo y medio.
  const timeUp = useEffectEvent(() => open(-1))
  const tick = useEffectEvent(() => playBeep(6))
  useEffect(() => {
    if (maze?.phase !== 'pick') return
    const left = Math.max(maze.left ?? 0, 1200)
    const timers = [setTimeout(timeUp, left)]
    for (const at of [1500, 1000, 500]) if (left > at) timers.push(setTimeout(tick, left - at))
    return () => timers.forEach(clearTimeout)
  }, [maze?.id, maze?.phase])

  // Cada cambio de sitio: la puerta salta de su sitio viejo al nuevo, una por arriba y otra por abajo (FLIP).
  useLayoutEffect(() => {
    const before = rects.current
    rects.current = null
    if (!before || !maze) return
    const spec = ROOMS[maze.room]
    let up = true
    doorRefs.current.forEach((el, id) => {
      const from = before[id]
      if (!el || !from) return
      const to = el.getBoundingClientRect()
      const dx = from.left - to.left
      if (Math.abs(dx) < 1) return
      const lift = (up ? -1 : 1) * Math.min(40, to.height * 0.14)
      const scale = up ? 1.06 : 0.92
      el.style.zIndex = up ? '3' : '1'
      up = false
      el.animate(
        [
          { transform: `translate(${dx}px, 0)` },
          { transform: `translate(${dx / 2}px, ${lift}px) scale(${scale})`, offset: 0.5 },
          { transform: 'none' },
        ],
        { duration: spec.swapMs * 0.92, easing: 'cubic-bezier(0.45, 0, 0.35, 1)' },
      ).onfinish = () => {
        el.style.zIndex = ''
      }
    })
  }, [order])

  // --- El resultado: se abre la elegida, suena lo que hay, se abren las demás y se sigue (o se acaba). ---
  const afterOpen = useEffectEvent(() => {
    const { kind, view } = reveal
    setReveal((r) => ({ ...r, shown: true }))
    if (kind === 'chest') {
      playCash(3)
      buzz(40)
    } else if (kind === 'empty') playSteps()
    else if (kind === 'trap') playClank()
    else {
      playGrowl()
      if (kind === 'mimic') playClank()
    }
    if (loses(kind)) {
      setHurt((n) => n + 1)
      buzz([60, 40, 160])
      setRun(null)
      setStreak(0)
      record(view.last)
      setBalance(view.balance)
    } else {
      setStreak((n) => n + 1)
      if (view.bet > 0) setRun({ bet: view.bet, pot: view.pot, room: view.room })
    }
  })
  const afterAll = useEffectEvent(() => {
    const { kind, view } = reveal
    if (loses(kind)) return setReveal((r) => ({ ...r, all: true, moving: false }))
    if (view.bet > 0) {
      setReveal((r) => ({ ...r, all: true, moving: false }))
      setAuto({ id: Date.now() })
      return
    }
    // Sala del tesoro: cobra solo.
    setRun(null)
    record(view.last)
    setBalance(view.balance)
    setReveal((r) => ({ ...r, all: true, moving: false }))
    celebrate(view.last)
  })
  useEffect(() => {
    if (!reveal?.moving) return
    const k = reduced ? 0.4 : 1
    const timers = [setTimeout(afterOpen, OPEN_MS * k), setTimeout(afterAll, (OPEN_MS + REST_MS + SHOW_MS) * k)]
    return () => timers.forEach(clearTimeout)
  }, [reveal?.id, reduced])

  // Si no sales, se entra solo en la sala siguiente: el laberinto no espera.
  const autoGo = useEffectEvent(() => go())
  useEffect(() => {
    if (!auto) return
    const timer = setTimeout(autoGo, AUTO_MS)
    return () => clearTimeout(timer)
  }, [auto?.id])

  async function cash() {
    if (!between) return
    setAuto(null)
    const view = await act({ a: 'cash' })
    if (!view) return
    setRun(null)
    setReveal(null)
    setStreak(0)
    record(view.last)
    setBalance(view.balance)
    celebrate(view.last)
  }

  function celebrate(result) {
    if (result.net <= 0) return
    const ratio = result.payout / result.stake
    playCash(Math.min(10, ratio))
    playWin(ratio >= 10)
    buzz(ratio >= 10 ? [60, 40, 60, 40, 160] : [60, 40, 80])
    setBurst({ id: result.round, amount: result.net, ratio, stake: result.stake, treasure: result.end === 'treasure' })
  }

  // Sacudida al perder (dura lo que la animación).
  useEffect(() => {
    if (!hurt) return
    const timer = setTimeout(() => setHurt(0), 600)
    return () => clearTimeout(timer)
  }, [hurt])

  const nudge = (delta) => setBet(clampBet(shownBet + delta, maxBet))
  const canBet = !run && !busy && maxBet > MIN_BET

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select')) return
    const digit = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(event.code)
    if (digit >= 0) {
      event.preventDefault()
      if (canPick) open(digit % 3)
    } else if (event.code === 'Space') {
      if (target?.matches('button:focus-visible')) return
      event.preventDefault()
      if (!run) start()
      else go()
    } else if (event.code === 'KeyC' || event.code === 'Enter') {
      if (target?.matches('button, a') || !run) return
      event.preventDefault()
      cash()
    } else if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && canBet) {
      event.preventDefault()
      nudge((event.code === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1) * STEP)
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const phase = maze?.phase
  let status = `Entra, mira dónde está el cofre y no le quites ojo: las puertas se barajan.`
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Encendiendo las antorchas…'
  else if (reveal && (reveal.moving || !run)) status = reveal.shown ? reveal.text : 'La puerta cruje al abrirse…'
  else if (broke) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
  else if (phase === 'peek') status = '¡Fíjate bien! ¿Dónde está el cofre?'
  else if (phase === 'close' || phase === 'shuffle' || phase === 'settle')
    status = '¡El laberinto se mueve! No pierdas de vista el cofre.'
  else if (phase === 'pick')
    status = maze.doors ? '¿Dónde está el cofre? ¡Elige ya!' : 'Las puertas ya se movieron: elige antes de que se acabe el tiempo.'
  else if (asking && run) status = 'Las puertas crujen…'
  else if (run && auto) status = `Sala superada. ¿Sigues o sales con ${eur(run.pot)}?`
  else if (run) status = 'Entre sala y sala: sigue o sal con el botín.'
  else if (last?.end === 'cash' && last.net > 0) status = `Sales con ${eur(last.payout)}. Ganaste ${eur(last.net)}.`
  else if (last?.end === 'cash') status = 'Sales por donde entraste y recuperas tu apuesta.'
  else if (last && last.end !== 'treasure') status = `Caíste en ${ROOMS[last.room].name.toLowerCase()}. Perdiste ${eur(last.stake)}.`

  if (treasure) status = `¡La sala del tesoro! Cruzaste las ${DEPTH} salas y te llevas ${eur(last.payout)}.`
  const lastWon = !run && last?.net > 0
  const tension = run ? (room >= DEPTH - 1 ? 2 : room >= 3 ? 1 : 0) : 0
  const dead = reveal && loses(reveal.kind) && reveal.all
  const best = history.reduce((top, h) => Math.max(top, h.ratio), 0)
  const walking = Boolean(auto)
  const roomName = treasure ? 'La sala del tesoro' : ROOMS[room].name
  const spec = ROOMS[room]
  const peeking = phase === 'peek'
  const moving = phase === 'shuffle' || phase === 'settle'

  // Cada puerta (por cómo se vio al entrar) está en una posición: order[pos] = puerta.
  const posOf = (id) => order.indexOf(id)

  return (
    <main className="app dg-app" data-tension={tension}>
      <header className="top">
        <h1>Laberinto</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={lastWon ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>{run ? 'Botín' : 'Apuesta'}</dt>
              <dd>{eur(run ? shownPot : shownBet)}</dd>
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
            <Help className="tg tg--help" title="Cómo se juega">
              <p>
                Pon tu apuesta y entra: es tu <b>botín</b>. En cada sala hay {DOORS} puertas: un <b>cofre</b> (el botín
                se multiplica), un <b>pasillo</b> (pasas sin premio) y un <b>monstruo</b> o una <b>trampa</b> (pierdes el
                botín).
              </p>
              <p>
                Las puertas se abren <b>un instante</b> para que veas qué hay detrás, se cierran y <b>cambian de sitio</b>.
                Sigue el cofre con la vista y elige antes de que se acabe el tiempo (si no, el laberinto elige por ti al
                azar). Cuanto más hondo, menos se ven, más se mueven y más deprisa, pero más paga el cofre: con todo
                cofres el botín llega a {MAX_GAIN}.
              </p>
              <p>
                Ojo: algunos cofres son <b>mímicos</b> y se comen el botín (más cuanto más hondo). El pasillo siempre es
                seguro: te deja pasar de sala sin arriesgar.
              </p>
              <p>
                Al cruzar una sala, entras solo en la siguiente en unos segundos: si quieres, <b>sal con el botín</b>{' '}
                antes. Si cruzas las {DEPTH} salas llegas a la <b>sala del tesoro</b> y cobras solo.
              </p>
              <p>
                Teclado: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> eligen puerta, <kbd>Espacio</kbd> entra o sigue,{' '}
                <kbd>C</kbd> o <kbd>Intro</kbd> sale con el botín, <kbd>←</kbd> <kbd>→</kbd> cambian la apuesta.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="dg fill">
        <section className="dg__machine" aria-label="Laberinto">
          <p className={`status ${lastWon ? 'status--win' : ''} ${dead ? 'status--lose' : ''}`} aria-live="polite">
            {status}
          </p>
          <div
            className={`dg__hall ${hurt ? 'is-hurt' : ''} ${dead ? 'is-dead' : ''} ${treasure ? 'is-treasure' : ''} ${walking ? 'is-walking' : ''} ${moving ? 'is-moving' : ''}`}
            data-room={room}
          >
            <HallScene key={`${room}-${treasure ? 't' : ''}`} room={room} treasure={Boolean(treasure)} />
            <div className="dg__light" />
            <div className="dg__banner">
              <span className="dg__depth">{treasure ? '★' : `Sala ${room + 1} de ${DEPTH}`}</span>
              <h2 key={roomName}>{roomName}</h2>
              {streak > 1 && !treasure && (
                <span className="dg__streak" key={streak}>
                  Racha ×{streak}
                </span>
              )}
            </div>
            {treasure ? (
              <div className="dg__vault">
                <Torch />
                <Hoard />
                <Torch />
              </div>
            ) : (
              <div className={`dg__doors ${walking ? 'is-walking' : ''}`} key={`h${hall}`}>
                <Torch />
                {Array.from({ length: DOORS }, (_, id) => {
                  const pos = posOf(id)
                  // Lo que se ve: al asomarse, lo que había al entrar; al abrir, lo que dice el servidor en esa posición.
                  const kind = reveal ? reveal.doors[pos] : peeking || phase === 'close' ? maze?.doors?.[id] : null
                  const opened = reveal ? pos === reveal.pick || reveal.all : false
                  const cls = [
                    'dg__door',
                    opened ? 'is-open' : '',
                    peeking ? 'is-peek' : '',
                    reveal && pos === reveal.pick ? 'is-pick' : '',
                    reveal && pos !== reveal.pick ? 'is-other' : '',
                    kind ? `has-${kind}` : '',
                    canPick ? 'is-live' : '',
                  ].join(' ')
                  return (
                    <button
                      key={id}
                      ref={(el) => {
                        doorRefs.current[id] = el
                      }}
                      type="button"
                      className={cls}
                      style={{ order: pos }}
                      disabled={!canPick}
                      onClick={() => open(pos)}
                      aria-label={
                        opened || peeking
                          ? `Puerta ${pos + 1}: ${NAMES[kind]}`
                          : canPick
                            ? `Elegir la puerta ${pos + 1}`
                            : `Puerta ${pos + 1}`
                      }
                    >
                      <Frame />
                      <span className="dg__behind">{kind && <Behind kind={kind} room={room} />}</span>
                      <span className="dg__leaf">
                        <DoorLeaf n={id + 1} label={canPick || reveal ? String(pos + 1) : ''} />
                      </span>
                      <Fall />
                      {reveal?.all && pos === reveal.pick && reveal.kind === 'chest' && (
                        <span className="dg__gain">{gainLabel(reveal.room)}</span>
                      )}
                    </button>
                  )
                })}
                <Torch />
              </div>
            )}
            {phase === 'pick' && (
              <div className="dg__timer" key={`t${maze.id}`} style={{ '--ms': `${Math.max(maze.left ?? spec.pickMs, 1200)}ms` }}>
                <span />
              </div>
            )}
            {auto && run && (
              <div className="dg__next" key={`n${auto.id}`} style={{ '--ms': `${AUTO_MS}ms` }}>
                <button type="button" className="dg__go" onClick={go} disabled={asking}>
                  Sala {run.room + 1}: ¡sigue! <kbd>Espacio</kbd>
                </button>
                <button type="button" className="dg__cash" onClick={cash} disabled={asking}>
                  Salir con {eur(run.pot)} <kbd>C</kbd>
                </button>
                <span className="dg__next-bar" />
              </div>
            )}
            <ol className="dg__map" aria-label="Salas del laberinto">
              {ROOMS.map((r, i) => {
                const lostHere = dead && i === reveal.room
                const state = lostHere
                  ? 'is-lost'
                  : treasure || i < room || (reveal && !loses(reveal.kind) && i === reveal.room)
                    ? 'is-past'
                    : i === room && (run || reveal)
                      ? 'is-here'
                      : ''
                return (
                  <li
                    key={r.name}
                    className={`dg__step ${state}`}
                    title={`${r.name}: cofre ${gainLabel(i)}`}
                    aria-current={state === 'is-here' ? 'step' : undefined}
                  >
                    {lostHere ? '✕' : i + 1}
                  </li>
                )
              })}
              <li className={`dg__step dg__step--gold ${treasure ? 'is-past' : ''}`} title="La sala del tesoro">
                ★
              </li>
            </ol>
          </div>
        </section>

        <aside className="dg__panel">
          <div className="dg__group dg__now">
            <h2>Ahora</h2>
            {run ? (
              <>
                <span className="dg__amount" aria-hidden="true">
                  {eur(shownPot)}
                </span>
                <p className="dg__odds">
                  {ROOMS[run.room]?.name ?? ''}: cofre <b>{gainLabel(run.room)}</b> ({eur(grow(run.pot, run.room))}) ·{' '}
                  {spec.swaps} cambios de sitio · mímico {ROOMS[run.room].mimic} %
                  <span className="dg__odds-bar" style={{ '--p': run.room / DEPTH }} />
                </p>
              </>
            ) : (
              <p className="dg__hint">Sin partida en marcha. Elige la apuesta y entra.</p>
            )}
          </div>

          <div className="dg__group">
            <h2>Apuesta</h2>
            <label className="dg__slider">
              <span className="dg__amount">{eur(shownBet)}</span>
              <input
                type="range"
                min={MIN_BET}
                max={Math.max(maxBet, MIN_BET)}
                step={STEP}
                value={shownBet}
                disabled={!canBet}
                aria-label="Apuesta"
                onChange={(event) => setBet(Number(event.target.value))}
              />
            </label>
            <div className="dg__quick">
              <button type="button" disabled={!canBet} onClick={() => setBet(MIN_BET)} aria-label="Apuesta mínima">
                Mín
              </button>
              <button
                type="button"
                disabled={!canBet}
                onClick={() => setBet(clampBet(shownBet / 2, maxBet))}
                aria-label="Mitad de la apuesta"
              >
                ½
              </button>
              <button
                type="button"
                disabled={!canBet}
                onClick={() => setBet(clampBet(shownBet * 2, maxBet))}
                aria-label="Doblar la apuesta"
              >
                ×2
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(maxBet)} aria-label="Apuesta máxima">
                Máx
              </button>
            </div>
          </div>

          <div className="actions dg__actions">
            {!run && !broke && (
              <button type="button" className="primary" disabled={busy || shownBet > balance} onClick={start}>
                {asking ? 'Entrando…' : 'Entrar al laberinto'} <kbd>Espacio</kbd>
              </button>
            )}
            {run && (
              <>
                <p className="dg__hint dg__pick">
                  {canPick ? '¡Elige una puerta!' : between ? 'Sala superada' : 'Sigue el cofre…'}
                </p>
                {between && !auto && (
                  <button type="button" className="primary" disabled={asking} onClick={go}>
                    Entrar en la sala {run.room + 1} <kbd>Espacio</kbd>
                  </button>
                )}
                <button type="button" className="dg__cash" disabled={!between} onClick={cash}>
                  Salir con {eur(run.pot)} <kbd>C</kbd>
                </button>
              </>
            )}
          </div>

          <div className="dg__group">
            <h2>Últimas partidas</h2>
            {history.length === 0 ? (
              <p className="dg__hint">Todavía no has jugado ninguna.</p>
            ) : (
              <>
                <ol className="dg__history" aria-label="Últimas partidas">
                  {history.slice(0, 10).map((h) => (
                    <li key={h.id} className={`dg__chip dg__chip--${toneOf(h.ratio)}`}>
                      {h.end === 'treasure'
                        ? '★'
                        : h.ratio > 0
                          ? `×${String(Math.round(h.ratio * 10) / 10).replace('.', ',')}`
                          : '✕'}
                    </li>
                  ))}
                </ol>
                <p className="dg__hint">
                  Mejor: {best ? `×${String(Math.round(best * 10) / 10).replace('.', ',')}` : '–'}
                </p>
              </>
            )}
          </div>
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={
            burst.treasure
              ? `¡Sala del tesoro! ×${String(Math.round(burst.ratio * 10) / 10).replace('.', ',')}`
              : `Botín de ${eur(burst.amount + burst.stake)} con ${eur(burst.stake)}`
          }
          coins={Math.min(70, 20 + Math.round(burst.ratio * 3))}
          big={burst.treasure || burst.ratio >= 10}
          who={juegos.me?.name}
        />
      )}
    </main>
  )
}

export default Dungeon
