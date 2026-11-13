import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import {
  BETS_MS,
  CAR_INFO,
  CHIPS,
  CIRCUITS,
  DRAW_MS,
  GRID_MS,
  HOUSE,
  KINDS,
  MAX_BETS,
  MAX_TOTAL,
  PODIUM,
  ROUND_MS,
  bestOf,
  circuitOf,
  fmtOdds,
  keyOf,
  phaseAt,
  totalOf,
  validBet,
} from './race.js'
import { delta, eur } from '../comun/money.js'
import { isMuted, playChip, playLose, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import Avatar from '../comun/Avatar.jsx'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import RaceDraw from './RaceDraw.jsx'
import RaceStage from './RaceStage.jsx'
import './Race.css'

const SEND_MS = 250 // las apuestas se mandan al servidor un momento después de dejar de tocar
const HOT_MS = 5000 // últimos segundos: la cuenta atrás se pone tensa
const SHOW_BETS_SYNC_MS = 700 // tras cerrarse las apuestas el servidor suelta la carrera (a los 600 ms)
const END_SYNC_MS = 500 // al cruzar el último coche la meta, el servidor ya puede pagar
const HISTORY = 12
const PHASES = [
  ['betting', 'Apuestas'],
  ['grid', 'Parrilla'],
  ['race', 'Carrera'],
  ['result', 'Resultado'],
]
const KIND_IDS = Object.keys(KINDS) // podium, win, exacta, trifecta
const KIND_KEYS = { q: 'podium', w: 'win', e: 'exacta', r: 'trifecta' }
const BIG_KINDS = ['exacta', 'trifecta']
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : `${items[0] ?? ''}`)
const carNames = (cars) => cars.map((c) => CAR_INFO[c].name)
const placeName = (i) => `${i + 1}.º`
// Premio que se enseña de un tipo: «hasta ×3,4» (podio) o «×5,7».
const prizeOf = (kind) => (kind === 'podium' ? `hasta ${fmtOdds(PODIUM[0])}` : fmtOdds(KINDS[kind].pays))

// ---------- Apuestas del jugador: [{ kind, cars, amount }], una por (tipo, coches en orden) ----------
const cleanBets = (list) => (Array.isArray(list) ? list.filter(validBet).map((b) => ({ kind: b.kind, cars: [...b.cars], amount: b.amount })) : [])
const sameBets = (a, b) => a.length === b.length && a.every((x, i) => keyOf(x) === keyOf(b[i]) && x.amount === b[i].amount)
const addBet = (bets, bet) => {
  const at = bets.findIndex((b) => keyOf(b) === keyOf(bet))
  if (at < 0) return [...bets, bet]
  return bets.map((b, i) => (i === at ? { ...b, amount: b.amount + bet.amount } : b))
}
// ¿Cabe `bet` en la lista? (importe máximo, número de apuestas y saldo libre)
const fits = (bets, bet, available) => {
  if (totalOf(bets) + bet.amount > MAX_TOTAL || bet.amount > available) return false
  return bets.some((b) => keyOf(b) === keyOf(bet)) || bets.length < MAX_BETS
}

const initialState = {
  chip: CHIPS[1],
  kind: 'podium',
  picks: [], // coches elegidos (en orden) para una exacta o una trifecta, todavía sin apostar
  car: 0, // último coche tocado (teclado y asiento)
  round: null, // ronda a la que pertenecen las apuestas
  placed: [], // lo que ves en pantalla
  confirmed: [], // lo que ya tiene el servidor (su importe ya salió del saldo)
  lastPlaced: [],
  synced: null, // ronda de la que ya se recogieron las apuestas guardadas en el servidor
}

// Lo que cuestan las apuestas que aún no ha confirmado el servidor (si se han reducido, es negativo: devolución).
const unconfirmed = (state) => totalOf(state.placed) - totalOf(state.confirmed)

// action.available: saldo libre (el del servidor menos lo que está por confirmar).
function reducer(state, action) {
  switch (action.type) {
    case 'ROUND': {
      if (state.round === action.round) return state
      const played = state.confirmed.length > 0 ? state.confirmed : state.lastPlaced
      return { ...state, round: action.round, placed: [], confirmed: [], picks: [], lastPlaced: played }
    }
    // Apuestas que el servidor ya tenía para esta ronda (por ejemplo, tras recargar): solo la primera respuesta de cada ronda.
    case 'SERVER': {
      if (state.round !== action.round || state.synced === action.round) return state
      const next = { ...state, synced: action.round }
      const bets = cleanBets(action.bets)
      if (state.placed.length === 0 && bets.length > 0) return { ...next, placed: bets, confirmed: bets }
      return next
    }
    case 'CONFIRMED':
      return state.round === action.round ? { ...state, confirmed: action.bets } : state
    // El servidor no aceptó el cambio: se vuelve a lo confirmado.
    case 'REJECTED':
      return state.round === action.round ? { ...state, placed: state.confirmed } : state
    case 'CHIP':
      return { ...state, chip: action.chip }
    case 'KIND':
      return state.kind === action.kind ? state : { ...state, kind: action.kind, picks: [] }
    case 'CAR':
      return { ...state, car: action.car }
    // Tocar un coche: en Podio y Ganador apuesta al momento; en Exacta y Trifecta lo añade al orden elegido (o lo quita).
    case 'TAP': {
      const { car } = action
      const need = KINDS[state.kind].picks
      if (need > 1) {
        if (state.picks.includes(car)) return { ...state, car, picks: state.picks.filter((c) => c !== car) }
        if (state.picks.length >= need) return { ...state, car }
        return { ...state, car, picks: [...state.picks, car] }
      }
      const bet = { kind: state.kind, cars: [car], amount: state.chip }
      if (!fits(state.placed, bet, action.available)) return { ...state, car }
      return { ...state, car, placed: addBet(state.placed, bet) }
    }
    case 'UNPICK':
      return { ...state, picks: state.picks.slice(0, -1) }
    // Apostar el orden elegido (exacta o trifecta).
    case 'COMMIT': {
      const bet = { kind: state.kind, cars: state.picks, amount: state.chip }
      if (!validBet(bet) || !fits(state.placed, bet, action.available)) return state
      return { ...state, picks: [], placed: addBet(state.placed, bet) }
    }
    case 'REMOVE':
      return { ...state, placed: state.placed.filter((_, i) => i !== action.index) }
    case 'CLEAR':
      return { ...state, placed: [] }
    case 'DOUBLE': {
      const total = totalOf(state.placed)
      if (total === 0 || total * 2 > MAX_TOTAL || total > action.available) return state
      return { ...state, placed: state.placed.map((b) => ({ ...b, amount: b.amount * 2 })) }
    }
    case 'REPEAT': {
      const bets = cleanBets(action.bets)
      const total = totalOf(bets)
      if (state.placed.length > 0 || total === 0 || total > MAX_TOTAL || total > action.available || bets.length > MAX_BETS) return state
      return { ...state, placed: bets }
    }
    default:
      return state
  }
}

// Cuenta atrás: un aro que se vacía; en los últimos segundos se pone roja y late más rápido.
function Countdown({ phase, count, fraction, hot }) {
  return (
    <div className={`race-count race-count--${phase} ${hot ? 'race-count--hot' : ''}`} style={{ '--left': fraction }} aria-hidden="true">
      <span key={count}>{count}</span>
    </div>
  )
}

function Dot({ car }) {
  return <i className="race-dot" style={{ '--car': CAR_INFO[car].color }} title={CAR_INFO[car].name} />
}

// La carrera en vivo: una para todos cada 42 s. El servidor sortea y paga con el saldo semanal; aquí se apuesta mientras
// las apuestas están abiertas y la escena anima la carrera con el reloj del servidor (todos ven lo mismo).
function Race({ onExit, juegos }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [sound, setSound] = useState(() => !isMuted())
  const [live, setLive] = useState(null) // última respuesta del servidor
  const [sending, setSending] = useState(false)
  const [seating, setSeating] = useState(false)
  const [seatMsg, setSeatMsg] = useState('')
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const seq = useRef(0)
  const applied = useRef(0)
  const liveRef = useRef(null)
  const stateRef = useRef(state)
  const soundRound = useRef(null)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const { chip, kind, picks, car: picked, placed, confirmed } = state
  liveRef.current = live
  stateRef.current = state

  // Reloj del servidor (con la diferencia medida en cada respuesta).
  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const now = clock()
  const { round, offset, phase: basePhase } = phaseAt(now)
  const ready = skew.current !== null
  const circuit = circuitOf(round)
  const drawing = ready && basePhase === 'betting' && offset < DRAW_MS

  const ask = useCallback(
    async (message) => {
      const n = ++seq.current
      const sent = Date.now()
      const body = await request({ t: 'solo_race', ...message })
      const got = Date.now()
      const view = body?.solo
      if (view) {
        // La diferencia de reloj se mide en el punto medio del viaje; con un viaje lento se mantiene la anterior.
        if (skew.current === null || got - sent < 1500) skew.current = view.now - (sent + got) / 2
        // Una respuesta más vieja que otra ya recibida no la pisa.
        if (n > applied.current) {
          applied.current = n
          setLive(view)
        }
      }
      return body
    },
    [request],
  )
  const sync = useEffectEvent(() => {
    if (document.visibilityState === 'visible') ask({ a: 'sync' })
  })

  // Cuatro veces por segundo: cuenta atrás y cambio de fase.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (ready) dispatch({ type: 'ROUND', round })
  }, [ready, round])
  useEffect(() => setSeatMsg(''), [round, picked])

  // Al entrar, al volver a la pestaña y al empezar cada ronda (asientos e historial nuevos).
  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  useEffect(() => {
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [sync])
  useEffect(() => {
    if (!ready || liveRef.current?.round === round) return
    const timer = setTimeout(sync, 150)
    return () => clearTimeout(timer)
  }, [ready, round, sync])

  const view = live?.round === round ? live : null
  const race = view?.race ?? null
  const endAt = race ? race.start + Math.max(...race.finish) : null

  // Cuando se cierran las apuestas el servidor suelta la carrera: se pide hasta tenerla.
  const needRace = ready && basePhase !== 'betting' && live !== null && !race
  useEffect(() => {
    if (!needRace) return
    const first = setTimeout(sync, Math.max(150, round * ROUND_MS + BETS_MS + SHOW_BETS_SYNC_MS - clock()))
    const poll = setInterval(sync, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(poll)
    }
  }, [needRace, round, sync, clock])

  // Al cruzar el último coche la meta se paga: se pide el resultado (y otra vez si aún no ha llegado).
  const raceStart = race?.start ?? null
  useEffect(() => {
    if (endAt === null) return
    const wait = endAt + END_SYNC_MS - clock()
    if (wait < -2500) return
    const first = setTimeout(sync, Math.max(0, wait))
    const retry = setTimeout(() => {
      if (stateRef.current.confirmed.length > 0 && liveRef.current?.last?.round !== round) sync()
    }, Math.max(0, wait) + 1500)
    return () => {
      clearTimeout(first)
      clearTimeout(retry)
    }
    // endAt depende de la carrera de esta ronda: basta con que cambie su salida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceStart, round, sync, clock])

  // Apuestas que el servidor ya tenía para esta ronda (por ejemplo, tras recargar).
  useEffect(() => {
    if (live) dispatch({ type: 'SERVER', round: live.round, bets: live.bets })
  }, [live])

  const phase = basePhase === 'race' && endAt !== null && now >= endAt ? 'result' : basePhase
  const balance = live?.balance ?? juegos.me?.balance ?? 0
  const available = Math.max(0, balance - unconfirmed(state))
  const onTable = totalOf(placed)
  const left = Math.max(0, MAX_TOTAL - onTable)
  const broke = balance === 0 && onTable === 0
  const betting = ready && phase === 'betting' && state.round === round && view !== null
  const dirty = !sameBets(placed, confirmed)

  // Las apuestas se confirman con el servidor poco después de ponerlas (y al momento si se acaba el tiempo).
  // De una en una: dos peticiones a la vez pueden llegar en otro orden y dejar guardada la lista vieja.
  useEffect(() => {
    if (!dirty || sending || seating || state.round !== round) return
    // Lo que no llegó a enviarse antes de cerrar no juega: vuelve a lo confirmado.
    if (basePhase !== 'betting') {
      dispatch({ type: 'REJECTED', round })
      return
    }
    const bets = placed
    const wait = Math.max(0, Math.min(SEND_MS, BETS_MS - offset - 150))
    const timer = setTimeout(async () => {
      setSending(true)
      const body = await ask({ a: 'bet', round, bets })
      setSending(false)
      if (body?.solo) dispatch({ type: 'CONFIRMED', round, bets })
      else dispatch({ type: 'REJECTED', round })
    }, wait)
    return () => clearTimeout(timer)
    // offset cambia cuatro veces por segundo: solo se reprograma si cambian las apuestas o la ronda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, sending, seating, placed, basePhase, round, state.round, ask])

  // Resultado de tu última carrera liquidada; es de esta ronda si ya se pagó.
  const last = live?.last ?? null
  const fresh = last !== null && last.round === round && phase === 'result'
  const winnerShown = race !== null && now >= race.start + race.finish[race.winner]
  const bigHit = fresh && last.bets.some((b, i) => BIG_KINDS.includes(b.kind) && (last.paid?.[i] ?? 0) > 0)
  const won = fresh && last.net > 0
  const shownBank = useCountUp(available)

  // Sonido al conocer el resultado (una vez por ronda).
  useEffect(() => {
    if (!fresh || soundRound.current === last.round) return
    soundRound.current = last.round
    if (last.net > 0) playWin(bigHit || last.payout >= last.stake * 3)
    else if (last.net < 0) playLose()
  }, [fresh, last, bigHit])

  const seats = view?.seats ?? []
  const mySeat = view?.seat ?? null
  const pilotOf = (car) => {
    if (mySeat === car) return { name: juegos.me?.name ?? 'Tú', avatar: juegos.me?.avatar, me: true }
    const seat = seats.find((s) => s.car === car)
    return seat ? { name: seat.name, avatar: seat.avatar, me: false } : null
  }
  const players = view?.players ?? 0
  const history = (live?.history ?? []).slice(0, HISTORY)
  const need = KINDS[kind].picks

  function tap(car) {
    if (!betting) {
      dispatch({ type: 'CAR', car })
      return
    }
    if (need === 1 && fits(placed, { kind, cars: [car], amount: chip }, available)) playChip()
    dispatch({ type: 'TAP', car, available })
  }
  const commitBet = { kind, cars: picks, amount: chip }
  const canCommit = betting && need > 1 && picks.length === need && fits(placed, commitBet, available)
  function commit() {
    if (!canCommit) return
    playChip()
    dispatch({ type: 'COMMIT', available })
  }

  const repeatBets = state.lastPlaced.length > 0 ? state.lastPlaced : cleanBets(live?.last?.bets)
  const repeatTotal = totalOf(repeatBets)
  const canRepeat = betting && placed.length === 0 && repeatTotal > 0 && repeatTotal <= available && repeatTotal <= MAX_TOTAL
  const canDouble = betting && onTable > 0 && onTable * 2 <= MAX_TOTAL && onTable <= available

  async function toggleSeat() {
    if (!betting || seating || sending) return
    const owner = pilotOf(picked)
    if (owner && !owner.me) {
      setSeatMsg(`${CAR_INFO[picked].name} ya lo pilota ${owner.name}. Elige otro coche.`)
      return
    }
    setSeatMsg('')
    setSeating(true)
    const body = await ask({ a: 'seat', round, car: owner?.me ? null : picked })
    setSeating(false)
    if (body?.solo) return
    if (body?.error?.code === 'SEAT_TAKEN') {
      setSeatMsg(`${CAR_INFO[picked].name} ya lo pilota otro jugador. Elige otro coche.`)
      sync()
    } else setSeatMsg('No se pudo cambiar de asiento. Inténtalo otra vez.')
  }

  // Teclado: 1-6 coche, Q W E R tipo de apuesta, + / - ficha, Intro apuesta, Retroceso deshace. El Espacio no hace nada.
  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea, [contenteditable]')) return
    const key = event.key.toLowerCase()
    if (/^[1-6]$/.test(key)) {
      tap(Number(key) - 1)
    } else if (KIND_KEYS[key]) {
      if (betting) dispatch({ type: 'KIND', kind: KIND_KEYS[key] })
    } else if (key === '+' || key === '-') {
      const at = CHIPS.indexOf(chip) + (key === '+' ? 1 : -1)
      if (at >= 0 && at < CHIPS.length) dispatch({ type: 'CHIP', chip: CHIPS[at] })
    } else if (key === 'backspace') {
      if (betting && picks.length > 0) dispatch({ type: 'UNPICK' })
    } else if (key === 'enter') {
      if (target?.matches('button, a, summary, dialog, dialog *')) return
      if (!betting) return
      event.preventDefault()
      if (need > 1) commit()
      else if (fits(placed, { kind, cars: [picked], amount: chip }, available)) {
        playChip()
        dispatch({ type: 'TAP', car: picked, available })
      }
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [onKeys])

  // La escena avisa de los momentos clave; el panel va por reloj, así que solo se refresca al instante.
  const onEvent = useCallback((event) => {
    if (event?.type === 'winner' || event?.type === 'finish') setTick((n) => n + 1)
  }, [])

  // ---------- Textos ----------
  const secondsTo = (ms) => Math.max(0, Math.ceil(ms / 1000))
  const nextIn = secondsTo(ROUND_MS - offset)
  const winnerName = race ? CAR_INFO[race.winner].name : ''
  const hot = ready && phase === 'betting' && BETS_MS - offset <= HOT_MS
  const bets = fresh ? cleanBets(last.bets) : placed
  const paidOf = (i) => (fresh ? (last.paid?.[i] ?? 0) : null)
  const summary = onTable > 0 ? `${plural(placed.length, 'apuesta', 'apuestas')} · ${eur(onTable)}` : ''
  let call = 'Conectando con la pista…'
  let detail = ''
  if (ready) {
    if (phase === 'betting') {
      call = hot ? '¡Últimos segundos!' : 'Hagan sus apuestas'
      if (broke) detail = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
      else if (onTable > 0) detail = sending || dirty ? `Enviando ${summary}…` : `Aceptado: ${summary}.`
      else detail = 'Elige el tipo de apuesta y toca un coche.'
    } else if (phase === 'grid') {
      call = '¡Parrilla de salida!'
      detail = onTable > 0 ? `Juegas ${summary}. ¡Suerte!` : 'Apuestas cerradas: los coches se colocan.'
    } else if (phase === 'race') {
      if (winnerShown) {
        call = `Gana ${winnerName}`
        detail = onTable > 0 ? 'Los demás cruzan la meta. Calculando tu resultado…' : 'Los demás coches cruzan la meta.'
      } else {
        call = '¡Carrera en marcha!'
        detail = onTable > 0 ? `Juegas ${summary}.` : 'Esta carrera la miras; en la siguiente puedes apostar.'
      }
    } else {
      call = `Ganó ${winnerName}`
      if (fresh) detail = last.net > 0 ? `¡Has ganado ${eur(last.net)}! Felicidades.` : last.net < 0 ? `Perdiste ${eur(-last.net)}.` : 'Recuperas lo apostado.'
      else if (onTable > 0) detail = 'Calculando tu resultado…'
      else detail = `Siguiente carrera en ${nextIn} s.`
    }
    if (juegos.error) detail = juegos.error
  }

  // Mensaje para lectores de pantalla: solo cambia con la fase, la apuesta o el resultado (nunca con la cuenta atrás).
  const announce = !ready
    ? ''
    : phase === 'betting'
      ? `Apuestas abiertas. Circuito: ${CIRCUITS[circuit].name}. ${onTable > 0 && !dirty ? `Aceptado: ${summary}.` : 'Sin apuestas.'}`
      : phase === 'grid'
        ? 'Apuestas cerradas. Parrilla de salida.'
        : phase === 'race'
          ? winnerShown
            ? `Gana ${winnerName}.`
            : 'Carrera en marcha.'
          : `Ganó ${winnerName}. ${fresh ? (last.net > 0 ? `Ganaste ${eur(last.net)}.` : last.net < 0 ? `Perdiste ${eur(-last.net)}.` : 'Recuperas lo apostado.') : ''}`

  let count = '•'
  let fraction = 0
  if (ready && phase === 'betting') {
    count = secondsTo(BETS_MS - offset)
    fraction = 1 - offset / BETS_MS
  } else if (ready && phase === 'grid') {
    count = secondsTo(BETS_MS + GRID_MS - offset)
    fraction = 1 - (offset - BETS_MS) / GRID_MS
  } else if (phase === 'result') count = '✓'

  // Cuánto se ha llenado el tramo de la fase actual en el carril de fases (0-1).
  let railFill = 0
  if (ready && phase === 'betting') railFill = offset / BETS_MS
  else if (ready && phase === 'grid') railFill = (offset - BETS_MS) / GRID_MS
  else if (ready && phase === 'race') railFill = race && endAt > race.start ? (now - race.start) / (endAt - race.start) : 0
  else if (phase === 'result') railFill = 1
  railFill = Math.min(1, Math.max(0, railFill))

  // Rótulo del panel: si se puede apostar ahora o no.
  const gate = !ready
    ? 'Conectando…'
    : betting
      ? `Apuestas abiertas · ${count} s`
      : phase === 'betting'
        ? 'Apuestas abiertas en un momento…'
        : phase === 'grid'
          ? 'Apuestas cerradas · parrilla'
          : phase === 'race'
            ? 'Apuestas cerradas · en carrera'
            : `Nuevas apuestas en ${nextIn} s`

  // Tu última carrera (la de esta ronda si ya se pagó).
  let lastText = 'Todavía no has apostado en ninguna carrera.'
  let lastTone = ''
  const lastOrder = fresh || (last && phase === 'betting') ? last?.order : null
  if (onTable > 0 && !fresh) lastText = `Juegas ${summary} en esta carrera.`
  else if (last) {
    lastTone = last.net > 0 ? 'is-win' : last.net < 0 ? 'is-loss' : ''
    lastText = `${fresh ? 'Esta carrera' : 'Anterior'}: apostaste ${eur(last.stake)}, cobraste ${eur(last.payout)} (${delta(last.net)}).`
  }

  return (
    <main className="app race-app">
      <header className="top">
        <h1>Carrera</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={won ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>En juego</dt>
              <dd>{eur(onTable)}</dd>
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
                Una carrera cada {ROUND_MS / 1000} segundos, la misma para todos. Seis coches igual de rápidos: el orden de llegada
                es al azar. Tienes {BETS_MS / 1000} segundos para apostar; luego salen de la parrilla y corren tres vueltas al
                circuito que toque o, si sale una recta de aceleración, una sola pasada de 402 m. El circuito no cambia las
                probabilidades.
              </p>
              <h3>Tipos de apuesta</h3>
              <p>
                <b>Podio</b>: eliges 1 coche y cobras si acaba en el podio, por cada euro: 1.º {fmtOdds(PODIUM[0])}, 2.º{' '}
                {fmtOdds(PODIUM[1])}, 3.º {fmtOdds(PODIUM[2])}. Del 4.º al 6.º, nada.
              </p>
              <p>
                <b>Ganador</b>: 1 coche; cobras {fmtOdds(KINDS.win.pays)} solo si gana.
              </p>
              <p>
                <b>Exacta</b>: 2 coches en orden; si llegan 1.º y 2.º tal cual, cobras {fmtOdds(KINDS.exacta.pays)}.
              </p>
              <p>
                <b>Trifecta</b>: 3 coches en orden; si llegan 1.º, 2.º y 3.º tal cual, cobras {fmtOdds(KINDS.trifecta.pays)}.
              </p>
              <p>
                El retorno de cada tipo es de alrededor del {Math.round(HOUSE * 100) - 1}-{Math.round(HOUSE * 100)} %: los premios
                altos llegan menos veces.
              </p>
              <p>
                En Podio y Ganador, tocar un coche apuesta la ficha elegida. En Exacta y Trifecta toca los coches en el orden que
                crees (aparece su puesto) y pulsa <b>Apostar</b>; <b>Atrás</b> quita el último. Puedes hacer hasta {MAX_BETS}{' '}
                apuestas, con un máximo de {eur(MAX_TOTAL)} entre todas. Con Repetir recuperas las de la carrera anterior, con
                Doblar duplicas todas y con Vaciar las quitas. Se envían solas al servidor.
              </p>
              <p>
                Los coches los pilotan jugadores si se sientan al volante (<b>Pilotar</b>, solo con apuestas abiertas); el resto
                los lleva la IA. Pilotar es solo para presumir: no cambia las probabilidades ni el pago.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
              <p>
                Teclado: <kbd>1</kbd>–<kbd>6</kbd> eligen coche, <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> el tipo (Podio,
                Ganador, Exacta, Trifecta), <kbd>+</kbd> <kbd>-</kbd> la ficha, <kbd>Intro</kbd> apuesta y <kbd>Retroceso</kbd> quita
                el último coche elegido.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className={`race fill race--${ready ? phase : 'wait'}`}>
        <section className={`race__status ${hot ? 'is-hot' : ''}`} aria-label="Estado de la carrera">
          <Countdown phase={ready ? phase : 'race'} count={count} fraction={fraction} hot={hot} />
          <div className="race__call">
            <strong key={call} className={won ? 'is-win' : ''}>
              {call}
            </strong>
            <span className={won ? 'is-win' : ''}>{detail}</span>
          </div>
          <div className="race__rail">
            <ol className="race__phases" aria-hidden="true">
              {PHASES.map(([id, label], i) => {
                const at = ready ? PHASES.findIndex(([p]) => p === phase) : -1
                const fill = i < at ? 1 : i === at ? railFill : 0
                return (
                  <li key={id} className={i === at ? 'is-now' : i < at ? 'is-done' : ''} style={{ '--fill': fill }}>
                    {label}
                  </li>
                )
              })}
            </ol>
            <p className="race__circuit" style={{ '--c': CIRCUITS[circuit].color }}>
              <b>{CIRCUITS[circuit].name}</b>
              <small>{CIRCUITS[circuit].drag ? CIRCUITS[circuit].tag : `${CIRCUITS[circuit].laps} vueltas`}</small>
            </p>
          </div>
          <p className="race__sr" role="status" aria-live="polite">
            {announce}
          </p>
        </section>

        <section className="race__scene" aria-label="Pista">
          <RaceStage
            getNow={clock}
            round={round}
            race={race}
            seats={seats}
            bets={placed}
            mySeat={mySeat}
            circuit={circuit}
            podium={PODIUM}
            muted={!sound}
            reduced={reduced}
            onEvent={onEvent}
          />
          {drawing && (
            <RaceDraw key={round} circuit={circuit} getNow={clock} startAt={round * ROUND_MS} muted={!sound} reduced={reduced} />
          )}
        </section>

        <section className="race__strip" aria-label="Resultados">
          <div className="race__history">
            <h2>Últimos ganadores</h2>
            {history.length === 0 ? (
              <span className="race__muted">Aún no hay carreras.</span>
            ) : (
              <ol aria-label={`Últimos ganadores: ${history.map((c) => CAR_INFO[c].name).join(', ')}`}>
                {history.map((c, i) => (
                  <li key={i}>
                    <Dot car={c} />
                  </li>
                ))}
              </ol>
            )}
            <span className="race__players">{players > 0 ? plural(players, 'jugador apuesta', 'jugadores apuestan') : 'Sin apuestas aún'}</span>
          </div>
          <div className={`race__last ${lastTone}`}>
            {lastOrder && (
              <div className="race__order" aria-label={`Llegada: ${lastOrder.map((c, i) => `${placeName(i)} ${CAR_INFO[c].name}`).join(', ')}`}>
                <b>{fresh ? 'Llegada' : 'Anterior'}</b>
                {lastOrder.map((c, i) => (
                  <span key={c} className={i < 3 ? 'is-podium' : ''}>
                    <small>{i + 1}</small>
                    <Dot car={c} />
                  </span>
                ))}
              </div>
            )}
            <p>{lastText}</p>
          </div>
        </section>

        <aside className={`race__panel ${betting ? 'is-open' : 'is-closed'}`} aria-label="Apuestas">
          <div className="race__gate" aria-hidden="true">
            <i />
            <span>{gate}</span>
          </div>

          <div className="race__kinds" role="group" aria-label="Tipo de apuesta">
            {KIND_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={kind === id} disabled={!betting} onClick={() => dispatch({ type: 'KIND', kind: id })}>
                <b>{KINDS[id].name}</b>
                <small>{prizeOf(id)}</small>
              </button>
            ))}
          </div>
          <p className="race__kind-text">
            {KINDS[kind].text}.{kind === 'podium' ? ` 1.º ${fmtOdds(PODIUM[0])}, 2.º ${fmtOdds(PODIUM[1])}, 3.º ${fmtOdds(PODIUM[2])}.` : ''}
          </p>

          <ul className="race__cars">
            {CAR_INFO.map((info, car) => {
              const pilot = pilotOf(car)
              const place = phase === 'result' && race?.order ? race.order.indexOf(car) : -1
              const pickAt = picks.indexOf(car)
              const mine = placed.filter((b) => b.cars.includes(car)).length
              const label = [
                `Coche ${car + 1}, ${info.name}`,
                pilot ? `piloto ${pilot.me ? 'tú' : pilot.name}` : 'piloto IA',
                place >= 0 ? `acabó ${place + 1}.º` : null,
                pickAt >= 0 ? `elegido para el ${pickAt + 1}.º` : null,
                mine > 0 ? plural(mine, 'apuesta tuya', 'apuestas tuyas') : null,
                betting ? (need > 1 ? 'Tocar para elegir o quitar' : `Apostar ${eur(chip)} a ${KINDS[kind].name}`) : null,
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <li key={car}>
                  <button
                    type="button"
                    className={`race-car ${picked === car ? 'is-picked' : ''} ${pickAt >= 0 ? 'is-chosen' : ''} ${mine > 0 ? 'has-bet' : ''} ${winnerShown && race?.winner === car ? 'is-winner' : ''}`}
                    style={{ '--car': info.color, '--accent': info.accent }}
                    disabled={!betting}
                    aria-pressed={need > 1 ? pickAt >= 0 : picked === car}
                    aria-label={label}
                    onClick={() => tap(car)}
                  >
                    <span className="race-car__num" aria-hidden="true">
                      {car + 1}
                    </span>
                    <span className="race-car__name">{info.name}</span>
                    <span className="race-car__pilot">
                      {pilot ? (
                        <>
                          <Avatar name={pilot.name} src={pilot.avatar} size={16} />
                          <span>{pilot.me ? 'Tú pilotas' : pilot.name}</span>
                        </>
                      ) : (
                        <span className="race-car__ai">Piloto IA</span>
                      )}
                    </span>
                    <span className="race-car__badge">
                      {place >= 0 ? (
                        <b className={`race-car__place ${place < 3 ? 'is-podium' : ''}`}>{placeName(place)}</b>
                      ) : pickAt >= 0 ? (
                        <b className="race-car__place is-pick">{placeName(pickAt)}</b>
                      ) : phase === 'race' && winnerShown && race?.winner === car ? (
                        <b className="race-car__place is-podium">Ganó</b>
                      ) : mine > 0 ? (
                        <small className="race-car__mine">★ {mine}</small>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="race__compose">
            {need > 1 ? (
              <>
                <ol className="race__slots" aria-label={`Orden elegido para la ${KINDS[kind].name}`}>
                  {Array.from({ length: need }, (_, i) => (
                    <li key={i} className={picks[i] !== undefined ? 'is-set' : ''}>
                      <span>{placeName(i)}</span>
                      {picks[i] !== undefined ? <Dot car={picks[i]} /> : <i className="race-dot race-dot--empty" />}
                    </li>
                  ))}
                </ol>
                <button type="button" disabled={!betting || picks.length === 0} onClick={() => dispatch({ type: 'UNPICK' })}>
                  Atrás
                </button>
                <button type="button" className="race__go" disabled={!canCommit} onClick={commit} aria-label={`Apostar ${eur(chip)} a la ${KINDS[kind].name}`}>
                  Apostar {eur(chip)}
                </button>
              </>
            ) : (
              <p className="race__tip">{betting ? `Toca un coche para apostar ${eur(chip)} a ${KINDS[kind].name}` : 'Apuestas cerradas'}</p>
            )}
          </div>

          <div className="race__chips" role="group" aria-label="Valor de la ficha">
            {CHIPS.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip chip--${value}`}
                aria-pressed={chip === value}
                aria-label={`Ficha de ${eur(value)}`}
                disabled={available < value || left < value}
                onClick={() => dispatch({ type: 'CHIP', chip: value })}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="race__slip">
            <div className="race__head">
              <h2>Tus apuestas</h2>
              <span className="race__max">
                {plural(placed.length, 'apuesta', 'apuestas')} · {eur(onTable)} de {eur(MAX_TOTAL)}
              </span>
            </div>
            <div className="race__meter" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (onTable / MAX_TOTAL) * 100)}%` }} />
            </div>
            <ul className="race__bets" aria-label="Tus apuestas de esta carrera">
              {bets.length === 0 ? (
                <li className="race__bets-empty">{betting ? 'Aún no has apostado: elige tipo, ficha y coche.' : 'Sin apuestas en esta carrera.'}</li>
              ) : (
                bets.map((b, i) => {
                  const paid = paidOf(i)
                  return (
                    <li key={keyOf(b)} className={paid === null ? '' : paid > 0 ? 'is-hit' : 'is-miss'}>
                      <span className="race__bet-kind">{KINDS[b.kind].name}</span>
                      <span className="race__bet-cars" aria-label={listOf(b.cars.map((c, n) => `${placeName(n)} ${CAR_INFO[c].name}`))}>
                        {b.cars.map((c, n) => (
                          <span key={c}>
                            {b.cars.length > 1 && <small>{n + 1}</small>}
                            <Dot car={c} />
                          </span>
                        ))}
                      </span>
                      <span className="race__bet-amount">{eur(b.amount)}</span>
                      <span className="race__bet-prize">
                        {paid === null ? `${b.kind === 'podium' ? 'hasta ' : ''}${eur(bestOf(b))}` : paid > 0 ? `Cobró ${eur(paid)}` : 'Sin premio'}
                      </span>
                      <button
                        type="button"
                        className="race__bet-x"
                        disabled={!betting || paid !== null}
                        aria-label={`Quitar apuesta ${KINDS[b.kind].name} ${carNames(b.cars).join(', ')} de ${eur(b.amount)}`}
                        onClick={() => dispatch({ type: 'REMOVE', index: i })}
                      >
                        ×
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>

          <div className="race__actions">
            <button type="button" disabled={!canRepeat} onClick={() => dispatch({ type: 'REPEAT', bets: repeatBets, available })}>
              Repetir
            </button>
            <button type="button" disabled={!canDouble} onClick={() => dispatch({ type: 'DOUBLE', available })}>
              Doblar
            </button>
            <button type="button" disabled={!betting || placed.length === 0} onClick={() => dispatch({ type: 'CLEAR' })}>
              Vaciar
            </button>
          </div>

          <div className="race__seat">
            <button type="button" className="race__drive" disabled={!betting || seating} aria-pressed={mySeat === picked} onClick={toggleSeat}>
              <span className="race__wheel" aria-hidden="true" />
              {mySeat === picked ? `Dejar el volante de ${CAR_INFO[picked].name}` : `Pilotar ${CAR_INFO[picked].name}`}
            </button>
            <p className={seatMsg ? 'is-warn' : ''}>
              {seatMsg || (mySeat !== null ? `Pilotas el ${CAR_INFO[mySeat].name} (solo para presumir).` : 'Opcional: no cambia el pago.')}
            </p>
          </div>
          <p className="race__keys">
            <kbd>1</kbd>–<kbd>6</kbd> coche · <kbd>Q</kbd>
            <kbd>W</kbd>
            <kbd>E</kbd>
            <kbd>R</kbd> tipo · <kbd>+</kbd> <kbd>-</kbd> ficha · <kbd>Intro</kbd> apostar
          </p>
        </aside>
      </div>

      {won && (
        <WinBurst
          key={round}
          amount={last.net}
          caption={bigHit ? '¡Exacta! ¡Has clavado el orden!' : `Ganó el ${CAR_INFO[last.winner].name}`}
          coins={Math.min(90, Math.round(24 + (last.net / Math.max(last.stake, 1)) * 6))}
          big={bigHit || last.payout >= last.stake * 5}
          who={juegos.me?.name}
          tags={last.bets
            .map((b, i) => ((last.paid?.[i] ?? 0) > 0 ? `${KINDS[b.kind].name} ${carNames(b.cars).join(' › ')}: ${eur(last.paid[i])}` : null))
            .filter(Boolean)
            .slice(0, 3)}
        />
      )}
    </main>
  )
}

export default Race
