import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  BETS_MS,
  CHIPS,
  ROUND_MS,
  SECTORS,
  SEGMENT,
  SPIN_MS,
  STRAIGHT_PAYS,
  WHEEL,
  colorOf,
  initialState,
  neighbours,
  phaseAt,
  reducer,
  streakBonus,
  totalOf,
  totalsById,
  unconfirmed,
} from './roulette.js'
import { eur } from '../comun/money.js'
import { isMuted, playChip, playLose, playSpin, playWin, playZap, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import WinToast from '../comun/WinToast.jsx'
import Help from '../comun/Help.jsx'
import './Roulette.css'

const COLOR_NAMES = { red: 'Rojo', black: 'Negro', green: 'Verde' }
const REVEAL_WAIT_MS = 700 // tras el «no va más», lo que se espera para pedir el número (el servidor lo suelta a los 600 ms)
const WINNERS_WAIT_MS = 400 // tras caer la bola, para preguntar quién ganó (para entonces ya se han pagado las apuestas)
const SEND_MS = 300 // las fichas se mandan al servidor un momento después de dejar de tocar la mesa
const LAST_CALL_MS = 3000
const WHEEL_TURN_MS = 9000 // la rueda nunca se para: una vuelta cada 9 s
const BALL_REVS = 5
const MIN_BALL_MS = 2500
const listOf = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : `${items[0]}`
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Cada casilla lleva su posición en la mesa horizontal (c, r) y la columna
// que ocupa cuando la mesa se gira a vertical en pantallas estrechas (mc).
const CELLS = [
  { id: 'n:0', n: 0, label: '0', tone: 'green', c: 1, r: 1, cs: 1, rs: 3, mc: 1 },
  ...Array.from({ length: 36 }, (_, i) => {
    const n = i + 1
    const r = 3 - ((n - 1) % 3)
    return { id: `n:${n}`, n, label: `${n}`, tone: colorOf(n), c: Math.ceil(n / 3) + 1, r, mc: 4 - r }
  }),
  ...[1, 2, 3].map((k) => ({
    id: `col:${k}`,
    label: '2 a 1',
    name: `Columna ${k}`,
    c: 14,
    r: 4 - k,
    mc: k,
  })),
  ...[1, 2, 3].map((k) => ({
    id: `dozen:${k}`,
    label: `${k}ª docena`,
    c: 2 + (k - 1) * 4,
    r: 4,
    cs: 4,
    mc: 4,
  })),
  ...[
    { id: 'low', label: '1 a 18' },
    { id: 'even', label: 'Par' },
    { id: 'red', label: 'Rojo', diamond: 'red' },
    { id: 'black', label: 'Negro', diamond: 'black' },
    { id: 'odd', label: 'Impar' },
    { id: 'high', label: '19 a 36' },
  ].map((cell, i) => ({ ...cell, c: 2 + i * 2, r: 5, cs: 2, mc: 5 })),
]

const polar = (deg, radius) => {
  const rad = (deg * Math.PI) / 180
  return `${(radius * Math.sin(rad)).toFixed(3)} ${(-radius * Math.cos(rad)).toFixed(3)}`
}

function pocketPath(index) {
  const from = (index - 0.5) * SEGMENT
  const to = (index + 0.5) * SEGMENT
  return `M ${polar(from, 84)} A 84 84 0 0 1 ${polar(to, 84)} L ${polar(to, 46)} A 46 46 0 0 0 ${polar(from, 46)} Z`
}

const mix = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k))
// Altura de la bola (top, en % de la rueda) según lo que lleva de giro: corre por la pista y cae a la casilla.
function ballTop(p) {
  if (p < 0.62) return 5.25
  if (p < 0.82) return mix(5.25, 25, (p - 0.62) / 0.2)
  if (p < 0.9) return mix(25, 21.5, (p - 0.82) / 0.08)
  return mix(21.5, 23, (p - 0.9) / 0.1)
}

// Rueda en directo: gira siempre con el reloj del servidor (todos la ven igual) y la bola sale tras el «no va más».
// spin: { number, launch, land } (instantes del reloj del servidor) · rest: número donde descansa la bola.
function Wheel({ clock, spin, rest, reduced }) {
  const disc = useRef(null)
  const orbit = useRef(null)
  const ball = useRef(null)
  const props = useRef({ spin, rest })
  props.current = { spin, rest }

  useEffect(() => {
    let frame
    const draw = () => {
      const t = clock()
      const { spin, rest } = props.current
      const discDeg = reduced ? 0 : ((t % WHEEL_TURN_MS) / WHEEL_TURN_MS) * 360
      disc.current.style.transform = `rotate(${discDeg}deg)`
      let ballDeg = null
      let top = 23
      if (spin && t >= spin.launch) {
        const pocket = discDeg + WHEEL.indexOf(spin.number) * SEGMENT
        const u = reduced ? 0 : Math.max(0, (spin.land - t) / (spin.land - spin.launch))
        // Respecto a la rueda, la bola va en sentido contrario y frena hasta quedarse en su casilla.
        ballDeg = pocket + BALL_REVS * 360 * u * u
        top = ballTop(1 - u)
      } else if (rest !== null) {
        ballDeg = discDeg + WHEEL.indexOf(rest) * SEGMENT
      }
      orbit.current.style.transform = `rotate(${ballDeg ?? 0}deg)`
      ball.current.style.opacity = ballDeg === null ? '0' : '1'
      ball.current.style.top = `${top}%`
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [clock, reduced])

  return (
    <div className="wheel wheel--live" role="img" aria-label="Rueda de la ruleta">
      <svg viewBox="-100 -100 200 200" aria-hidden="true">
        <circle r="100" className="wheel__wood" />
        <circle r="90" className="wheel__track" />
        <circle r="97" className="wheel__trim" />
      </svg>
      <svg ref={disc} viewBox="-100 -100 200 200" className="wheel__disc" aria-hidden="true">
        {WHEEL.map((n, i) => (
          <g key={n}>
            <path d={pocketPath(i)} className={`pocket pocket--${colorOf(n)}`} />
            <text transform={`rotate(${i * SEGMENT}) translate(0 -73)`} className="pocket__number">
              {n}
            </text>
          </g>
        ))}
        <circle r="54" className="wheel__well" />
        <circle r="46" className="wheel__cone" />
        <path d="M -34 0 H 34 M 0 -34 V 34" className="wheel__spokes" />
        {[0, 90, 180, 270].map((deg) => (
          <circle key={deg} r="4.5" transform={`rotate(${deg}) translate(0 -34)`} className="wheel__knob" />
        ))}
        <circle r="11" className="wheel__knob" />
      </svg>
      <div ref={orbit} className="wheel__orbit">
        <span ref={ball} className="wheel__ball" />
      </div>
    </div>
  )
}

function Table({ totals, hit, lucky, disabled, erasing, onPlace, onRemove }) {
  const luckyOrder = Object.keys(lucky)
  return (
    <div className="felt">
      {CELLS.map((cell) => {
        const amount = totals[cell.id]
        const isHit = hit !== null && cell.n === hit
        const boost = cell.n !== undefined ? lucky[cell.n] : undefined
        const name = cell.name ?? cell.label
        return (
          <button
            key={cell.id}
            type="button"
            className={`cell ${cell.tone ? `cell--${cell.tone}` : 'cell--outside'} ${
              cell.id.startsWith('col:') ? 'cell--column' : ''
            } ${isHit ? 'cell--hit' : ''} ${boost ? 'cell--lucky' : ''}`}
            style={{
              '--c': cell.c,
              '--r': cell.r,
              '--cs': cell.cs ?? 1,
              '--rs': cell.rs ?? 1,
              '--mc': cell.mc,
              '--z': boost ? luckyOrder.indexOf(`${cell.n}`) : 0,
            }}
            disabled={disabled}
            aria-label={amount ? `${name}, apostado ${eur(amount)}` : name}
            onClick={() => (erasing ? onRemove(cell.id) : onPlace([cell.id]))}
            onContextMenu={(event) => {
              event.preventDefault()
              onRemove(cell.id)
            }}
          >
            {cell.diamond && <span className={`diamond diamond--${cell.diamond}`} />}
            <span className="cell__label">{cell.label}</span>
            {boost && <span className="boost">×{boost}</span>}
            {amount && <span className="stack">{amount}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Pista (racetrack): los números en el orden de la rueda. Tocar uno apuesta a él y a sus dos vecinos de cada lado;
// los sectores ponen una ficha a pleno en cada número del sector.
const TRACK = { w: 640, h: 200, r: 74, pad: 26 }
function trackPoint(k) {
  const { w, h, r, pad } = TRACK
  const straight = w - 2 * pad - 2 * r
  const perimeter = 2 * straight + 2 * Math.PI * r
  // Empieza arriba a la izquierda y va en sentido horario, como la rueda.
  let s = (k / WHEEL.length) * perimeter
  const top = pad + 0
  const left = pad + r
  const right = w - pad - r
  if (s < straight) return [left + s, top]
  s -= straight
  if (s < Math.PI * r) {
    const a = s / r
    return [right + r * Math.sin(a), h / 2 - r * Math.cos(a)]
  }
  s -= Math.PI * r
  if (s < straight) return [right - s, h - pad]
  s -= straight
  const a = s / r
  return [left - r * Math.sin(a), h / 2 + r * Math.cos(a)]
}

// Se empieza por el 19 para que el cero quede en el centro de la curva de la izquierda, como en las mesas reales.
const TRACK_ORDER = WHEEL.map((_, k) => WHEEL[(k + 3) % WHEEL.length])

function Racetrack({ totals, hit, disabled, chip, onPlace }) {
  return (
    <div className="track">
      <p className="track__hint">
        Los números van en el orden de la rueda. Toca uno y apuestas a él y a sus 2 vecinos de cada lado: 5 fichas de {eur(chip)}.
      </p>
      <svg viewBox={`0 0 ${TRACK.w} ${TRACK.h}`} role="group" aria-label="Pista de vecinos">
        <rect
          x={TRACK.pad}
          y={TRACK.pad}
          width={TRACK.w - 2 * TRACK.pad}
          height={TRACK.h - 2 * TRACK.pad}
          rx={TRACK.r}
          className="track__ring"
        />
        {TRACK_ORDER.map((n, k) => {
          const [x, y] = trackPoint(k)
          const amount = totals[`n:${n}`]
          return (
            <g
              key={n}
              className={`track__num track__num--${colorOf(n)} ${hit === n ? 'track__num--hit' : ''}`}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              aria-label={`${n} y sus vecinos`}
              onClick={() => !disabled && onPlace(neighbours(n).map((v) => `n:${v}`))}
              onKeyDown={(event) => {
                if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onPlace(neighbours(n).map((v) => `n:${v}`))
                }
              }}
            >
              <circle cx={x} cy={y} r="17" />
              <text x={x} y={y}>
                {n}
              </text>
              {amount && (
                <text x={x} y={y - 22} className="track__stack">
                  {amount}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="track__sectors">
        {SECTORS.map((sector) => (
          <button
            key={sector.id}
            type="button"
            disabled={disabled}
            title={`Una ficha a pleno en ${sector.numbers.join(', ')}`}
            onClick={() => onPlace(sector.numbers.map((n) => `n:${n}`))}
          >
            {sector.name}
            <small>
              {plural(sector.numbers.length, 'número', 'números')} · {eur(sector.numbers.length * chip)}
            </small>
          </button>
        ))}
      </div>
    </div>
  )
}

// Estadísticas de las últimas tiradas, como en las mesas en directo.
function Stats({ numbers }) {
  const stats = useMemo(() => {
    const counts = new Map(WHEEL.map((n) => [n, 0]))
    for (const n of numbers) counts.set(n, counts.get(n) + 1)
    const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    const share = (test) => Math.round((numbers.filter(test).length / Math.max(numbers.length, 1)) * 100)
    return {
      hot: sorted.slice(0, 4),
      cold: sorted.slice(-4).reverse(),
      bars: [
        [
          { label: 'Rojo', tone: 'red', pct: share((n) => colorOf(n) === 'red') },
          { label: '0', tone: 'green', pct: share((n) => n === 0) },
          { label: 'Negro', tone: 'black', pct: share((n) => colorOf(n) === 'black') },
        ],
        [
          { label: 'Par', tone: 'plain', pct: share((n) => n > 0 && n % 2 === 0) },
          { label: '0', tone: 'green', pct: share((n) => n === 0) },
          { label: 'Impar', tone: 'plain', pct: share((n) => n % 2 === 1) },
        ],
        [
          { label: '1-18', tone: 'plain', pct: share((n) => n > 0 && n <= 18) },
          { label: '0', tone: 'green', pct: share((n) => n === 0) },
          { label: '19-36', tone: 'plain', pct: share((n) => n >= 19) },
        ],
      ],
    }
  }, [numbers])
  if (numbers.length === 0) return null
  return (
    <div className="stats">
      <h2>Últimas {numbers.length} tiradas</h2>
      <div className="stats__hc">
        {[
          ['Calientes', stats.hot],
          ['Fríos', stats.cold],
        ].map(([title, list]) => (
          <div key={title}>
            <h3>{title}</h3>
            <ol>
              {list.map(([n, count]) => (
                <li key={n} className={`tile tile--${colorOf(n)}`} title={`${n}: ${plural(count, 'vez', 'veces')}`}>
                  {n}
                  <small>{count}</small>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {stats.bars.map((bar) => (
        <div key={bar[0].label} className="stats__bar">
          {bar.map((part) => (
            <span key={part.label} className={`stats__part stats__part--${part.tone}`} style={{ flexGrow: Math.max(part.pct, 0.5) }}>
              {part.pct >= 8 ? `${part.label} ${part.pct}%` : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

// Cuenta atrás de la ronda: un aro que se vacía mientras se puede apostar.
function Countdown({ phase, offset }) {
  const left = Math.ceil(((phase === 'betting' ? BETS_MS : ROUND_MS) - offset) / 1000)
  const fraction = phase === 'betting' ? 1 - offset / BETS_MS : 0
  return (
    <div
      className={`countdown countdown--${phase} ${phase === 'betting' && left <= LAST_CALL_MS / 1000 ? 'countdown--last' : ''}`}
      style={{ '--left': fraction }}
      aria-hidden="true"
    >
      <span>{left}</span>
    </div>
  )
}

// La ruleta en vivo: una sola rueda para todos que gira cada 25 s. El servidor sortea la ronda y paga; aquí se
// apuesta mientras la mesa está abierta y se anima la rueda con el reloj del servidor.
function Roulette({ onExit, juegos }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [view, setView] = useState('table')
  const [sound, setSound] = useState(() => !isMuted())
  const [live, setLive] = useState(null) // última respuesta del servidor (ronda, número, historial, jugadores)
  const [sending, setSending] = useState(false)
  const [winners, setWinners] = useState({ round: null, list: [] })
  const [notice, setNotice] = useState(null) // { round, text }: fichas que no llegaron a jugar
  const [erasing, setErasing] = useState(false)
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const { chip, placed, confirmed, lastPlaced } = state

  // Reloj del servidor (con la diferencia medida en cada respuesta).
  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const { round, offset, phase } = phaseAt(clock())
  const ready = skew.current !== null

  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'solo_roulette', ...message })
      const got = Date.now()
      if (body?.solo) {
        // La diferencia de reloj se mide en el punto medio del viaje; con un viaje lento se mantiene la anterior.
        if (skew.current === null || got - sent < 1500) skew.current = body.solo.now - (sent + got) / 2
        if (body.solo.winners && Number.isSafeInteger(message.winners)) setWinners({ round: message.winners, list: body.solo.winners })
        setLive((before) => ({ ...body.solo, receivedAt: before?.round === body.solo.round && before.number !== null && body.solo.number !== null ? before.receivedAt : clock() }))
      }
      return body
    },
    [request, clock],
  )

  // Cuatro veces por segundo: cuenta atrás y cambio de fase.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (ready) dispatch({ type: 'ROUND', round })
  }, [ready, round])

  // Al entrar, y una vez por ronda cuando el servidor suelta el número (si la pestaña está a la vista).
  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  useEffect(() => {
    if (!ready) return
    const due = round * ROUND_MS + BETS_MS + REVEAL_WAIT_MS
    const wait = due - clock()
    if (wait < 0) return
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') ask({ a: 'sync' })
    }, wait)
    return () => clearTimeout(timer)
  }, [ready, round, ask, clock])
  // Cuando la bola cae se pregunta quién ganó en la tirada, para anunciarlo a toda la mesa.
  useEffect(() => {
    if (!ready) return
    const due = round * ROUND_MS + BETS_MS + SPIN_MS + WINNERS_WAIT_MS
    const wait = due - clock()
    if (wait < 0) return
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') ask({ a: 'sync', winners: round })
    }, wait)
    return () => clearTimeout(timer)
  }, [ready, round, ask, clock])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') ask({ a: 'sync' })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ask])

  // Fichas que el servidor ya tenía para esta ronda (por ejemplo, tras recargar).
  useEffect(() => {
    if (live) dispatch({ type: 'SERVER', round: live.round, bets: live.bets })
  }, [live])

  // Las fichas se confirman con el servidor poco después de ponerlas (y al momento si se acaba el tiempo).
  // De una en una: dos peticiones a la vez pueden llegar al servidor en otro orden y dejar guardada la lista vieja.
  const dirty = placed !== confirmed
  useEffect(() => {
    if (!dirty || sending || state.round !== round) return
    // Lo que no llegó a enviarse antes del «no va más» no juega: la mesa vuelve a lo confirmado.
    if (phase !== 'betting') {
      dispatch({ type: 'REJECTED', round })
      setNotice({ round, text: 'Esas últimas fichas llegaron tarde y no juegan: solo cuenta lo que se guardó antes del «no va más».' })
      return
    }
    const bets = placed
    const wait = Math.max(0, Math.min(SEND_MS, BETS_MS - offset - 150))
    const timer = setTimeout(async () => {
      setSending(true)
      const body = await ask({ a: 'bet', round, bets })
      setSending(false)
      if (body?.solo) dispatch({ type: 'CONFIRMED', round, bets })
      else {
        dispatch({ type: 'REJECTED', round })
        setNotice({ round, text: 'No se pudo guardar tu apuesta: la mesa vuelve a lo que ya estaba guardado.' })
      }
    }, wait)
    return () => clearTimeout(timer)
    // offset cambia cuatro veces por segundo: solo se vuelve a programar si cambian las fichas o la ronda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, sending, placed, phase, round, state.round, ask])

  // Lo que se puede apostar todavía: el saldo del servidor (ya sin lo confirmado) menos lo pendiente de confirmar.
  const available = Math.max(0, balance - unconfirmed(state))
  const onTable = totalOf(placed)
  const betting = ready && phase === 'betting' && state.round === round

  // Resultado de esta ronda (si ya se conoce) y tu jugada en ella.
  const draw = live?.round === round && live.number !== null ? live : null
  const spin = draw
    ? (() => {
        const launch = Math.max(round * ROUND_MS + BETS_MS, draw.receivedAt)
        const stop = round * ROUND_MS + BETS_MS + SPIN_MS
        // Si entras con la bola ya parada, se ve directamente en su casilla.
        const land = launch >= stop ? launch : Math.max(stop, launch + MIN_BALL_MS)
        return { number: draw.number, launch, land }
      })()
    : null
  const landed = spin !== null && clock() >= spin.land
  const mine = live?.last && live.last.round === round ? live.last : null
  // La última jugada que ya se vio caer (la de esta ronda, solo cuando la bola se para).
  const lastPlay = live?.last && (live.last.round !== round || landed) ? live.last : null
  // Hasta que la bola cae no se ve lo ganado: el saldo del servidor ya lo incluye.
  const hidden = mine && !landed ? mine.payout + mine.bonus : 0
  const shownBank = useCountUp(Math.max(0, available - hidden))

  // Últimos números: el de esta ronda aparece cuando la bola se para.
  const numbers = useMemo(() => {
    if (!live) return []
    return live.history.last === round && !landed ? live.history.numbers.slice(1) : live.history.numbers
  }, [live, round, landed])
  const rest = numbers[0] ?? null
  const lucky = draw?.lucky ?? {}
  const streak = live?.streak ?? 0
  const nextBonus = Math.round(streakBonus(streak + 1) * 100)

  // Sonidos: tictac de la bola al salir, relámpago y, al caer, si ganaste o perdiste.
  const launched = spin !== null && clock() >= spin.launch
  const spinKey = launched ? round : null
  useEffect(() => {
    if (spinKey === null || !spin) return
    playSpin(spin.land - clock())
    playZap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey])
  const landKey = landed ? round : null
  useEffect(() => {
    if (landKey === null || !mine) return
    if (mine.net > 0) playWin(mine.net >= mine.stake * 10)
    else playLose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landKey])

  function place(ids) {
    if (!betting) return
    setNotice(null)
    if (state.chip * ids.length <= available) playChip()
    dispatch({ type: 'PLACE', ids, available })
  }

  function remove(id) {
    if (!betting) return
    setNotice(null)
    dispatch({ type: 'REMOVE', id })
  }

  // El modo de quitar fichas solo vale mientras hay algo que quitar.
  const erasingOn = erasing && betting && placed.length > 0

  const canRepeat = betting && placed.length === 0 && totalOf(lastPlaced) > 0 && totalOf(lastPlaced) <= available
  const broke = balance === 0 && onTable === 0
  const won = landed && mine && mine.net > 0
  const players = live?.round === round ? (live.players ?? 0) : 0
  const othersWon = useMemo(
    () =>
      winners.list
        .filter((w) => !w.me)
        .map((w) => ({ key: `${winners.round}-${w.name}`, name: w.name, amount: w.amount, detail: 'en la ruleta' })),
    [winners],
  )

  let call = 'Conectando con la mesa…'
  let detail = ''
  if (ready) {
    if (phase === 'betting') {
      call = BETS_MS - offset <= LAST_CALL_MS ? 'Últimas apuestas' : 'Hagan sus apuestas'
      if (broke) detail = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
      else if (onTable > 0) detail = sending || dirty ? `Guardando ${eur(onTable)}…` : `✓ Apuesta guardada: ${eur(onTable)}. Puedes cambiarla hasta el «no va más».`
      else detail = 'Elige el valor de la ficha abajo y toca una casilla. Se guarda sola, no hay que confirmar.'
    } else if (!landed) {
      call = 'No va más'
      const flashes = Object.entries(lucky).map(([n, x]) => `${n} (×${x})`)
      detail = flashes.length
        ? `⚡ Relámpago en ${listOf(flashes)}: si tienes ficha a pleno en uno de ellos, ese pleno paga eso.`
        : onTable > 0
          ? `Juegas ${eur(onTable)}.`
          : 'La bola está en marcha. Apuesta en la siguiente ronda.'
    } else {
      call = `${COLOR_NAMES[colorOf(spin.number)]} ${spin.number}`
      if (mine) detail = mine.net > 0 ? `¡Has ganado ${eur(mine.net)}! Felicidades.` : mine.net < 0 ? `Perdiste ${eur(-mine.net)}.` : 'Quedaste igual.'
      else detail = 'Prepárate para la siguiente ronda.'
    }
    if (phase !== 'betting') detail += ` Siguiente ronda en ${Math.ceil((ROUND_MS - offset) / 1000)} s.`
    if (notice?.round === round) detail = notice.text
    if (juegos.error) detail = juegos.error
  }

  return (
    <main className="app roulette-live">
      <header className="top">
        <h1>Ruleta</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={won ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>En la mesa</dt>
              <dd>{eur(onTable)}</dd>
            </div>
            <div>
              <dt title="Victorias seguidas en las que ganas al menos el doble de lo apostado">Racha</dt>
              <dd className={streak >= 2 ? 'money__hot' : ''}>
                {streak}
                {nextBonus > 0 && <small>+{nextBonus}% si ganas el doble</small>}
              </dd>
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
                Es una mesa en vivo: la rueda es la misma para todos y lanza la bola cada 25 segundos. Tienes 15 segundos para
                apostar; con el «no va más» la mesa se cierra y la bola gira.
              </p>
              <p>
                Elige el valor de la ficha y toca una casilla: la apuesta se guarda sola, no hay que confirmar. Mientras la
                mesa esté abierta puedes cambiarla: «Deshacer» quita la última ficha, «Quitar fichas» (o el clic derecho)
                quita las de la casilla que toques y «Quitar todo» lo retira todo.
              </p>
              <p>
                En la pista, tocar un número apuesta a él y a sus dos vecinos de la rueda (5 fichas). Los sectores ponen una
                ficha a pleno en cada número: Vecinos del cero (17), Tercio (12), Huérfanos (8) y Juego cero (7).
              </p>
              <p>
                Relámpago ⚡: con el «no va más» se marcan de 1 a 3 números al azar. Si la bola cae en uno y tenías ficha a
                pleno en él, ese pleno paga entre 50 y 150 a 1 en vez de {STRAIGHT_PAYS} a 1.
              </p>
              <p>Cada victoria seguida en la que al menos duplicas lo apostado suma un 5% extra a la siguiente, hasta un 15%. El
                extra se calcula sobre la ganancia más pequeña de la racha.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
              <h3>Pagos</h3>
              <p>
                Pleno {STRAIGHT_PAYS} a 1 · Docena y columna 2 a 1 · Rojo, negro, par, impar, 1-18 y 19-36: 1 a 1.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="floor fill">
        <section className={`side ${ready && phase !== 'betting' ? 'side--up' : ''}`}>
          <Wheel clock={clock} spin={spin} rest={rest} reduced={reduced} />
          <div className="recent">
            <h2>Últimos números</h2>
            {numbers.length === 0 ? (
              <p>Todavía no ha salido ninguno.</p>
            ) : (
              <ol>
                {numbers.slice(0, 12).map((n, i) => (
                  <li key={`${round}-${i}`} className={`tile tile--${colorOf(n)}`}>
                    {n}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <Stats numbers={numbers} />
        </section>

        <section className="play">
          <div className="dealer">
            <Countdown phase={ready ? phase : 'spinning'} offset={offset} />
            <p className={`status ${won ? 'status--win' : ''}`} aria-live="polite">
              <strong>{call}</strong>
              {detail && <span>{detail}</span>}
            </p>
            <p className="dealer__players">{players > 0 ? `${plural(players, 'jugador', 'jugadores')} en esta tirada` : 'Mesa en vivo'}</p>
          </div>

          <div className="views" role="tablist" aria-label="Tipo de apuesta">
            <button type="button" role="tab" aria-selected={view === 'table'} onClick={() => setView('table')}>
              Mesa
            </button>
            <button type="button" role="tab" aria-selected={view === 'track'} onClick={() => setView('track')}>
              Pista
            </button>
          </div>

          {view === 'table' ? (
            <Table
              totals={totalsById(placed)}
              hit={landed ? spin.number : null}
              lucky={lucky}
              disabled={!betting || broke}
              erasing={erasingOn}
              onPlace={place}
              onRemove={remove}
            />
          ) : (
            <Racetrack totals={totalsById(placed)} hit={landed ? spin.number : null} disabled={!betting || broke} chip={chip} onPlace={place} />
          )}
          <p className="pays">
            Pleno {STRAIGHT_PAYS} a 1 · Docena y columna 2 a 1 · Rojo, negro, par, impar, 1-18 y 19-36: 1 a 1
          </p>
          {lastPlay && (
            <p className={`last-play ${lastPlay.net > 0 ? 'last-play--win' : lastPlay.net < 0 ? 'last-play--lose' : ''}`}>
              <span className={`tile tile--${colorOf(lastPlay.number)}`}>{lastPlay.number}</span>
              Tu última jugada: apostaste {eur(lastPlay.stake)} y{' '}
              {lastPlay.net > 0 ? `ganaste ${eur(lastPlay.net)}` : lastPlay.net < 0 ? `perdiste ${eur(-lastPlay.net)}` : 'quedaste igual'}
              {lastPlay.boosted ? ` · ⚡ relámpago ×${lastPlay.boosted}` : ''}
              {lastPlay.bonus > 0 ? ` · racha +${eur(lastPlay.bonus)}` : ''}
            </p>
          )}

          <div className="controls">
            <div className="chips" role="group" aria-label="Valor de la ficha">
              {CHIPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip chip--${value}`}
                  aria-pressed={chip === value}
                  disabled={available < value}
                  title={available < value ? 'No te llega el saldo para esta ficha' : `Fichas de ${eur(value)}`}
                  onClick={() => dispatch({ type: 'SELECT_CHIP', chip: value })}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="actions">
              {canRepeat ? (
                <button type="button" className="primary" onClick={() => dispatch({ type: 'REPEAT', available })}>
                  Repetir apuesta
                </button>
              ) : (
                <>
                  <button type="button" disabled={!betting || placed.length === 0} onClick={() => dispatch({ type: 'UNDO' })}>
                    Deshacer
                  </button>
                  {view === 'table' && (
                    <button
                      type="button"
                      aria-pressed={erasingOn}
                      disabled={!betting || placed.length === 0}
                      title="Toca una casilla para quitar sus fichas de una en una"
                      onClick={() => setErasing(!erasingOn)}
                    >
                      Quitar fichas
                    </button>
                  )}
                  <button type="button" disabled={!betting || placed.length === 0} onClick={() => dispatch({ type: 'CLEAR' })}>
                    Quitar todo
                  </button>
                  <button
                    type="button"
                    disabled={!betting || onTable === 0 || onTable > available}
                    onClick={() => dispatch({ type: 'DOUBLE', available })}
                  >
                    Doblar
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {won && (
        <WinBurst
          key={round}
          amount={mine.net}
          caption={`Ganaste con el ${spin.number}`}
          coins={Math.min(70, Math.round(24 + (mine.net / Math.max(mine.stake, 1)) * 6))}
          big={mine.net >= mine.stake * 10}
          who={juegos.me?.name}
          tags={[
            mine.boosted && `Relámpago ×${mine.boosted}`,
            mine.bonus > 0 && `Racha de ${mine.streak}: +${eur(mine.bonus)} extra`,
          ].filter(Boolean)}
        />
      )}
      <WinToast wins={othersWon} />
    </main>
  )
}

export default Roulette
