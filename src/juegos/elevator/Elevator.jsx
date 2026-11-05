import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import {
  BONUS,
  FLOORS,
  HOUSE,
  JOIN_MS,
  MAX_STAKE,
  MIN_STAKE,
  MULTS,
  ROUND_MS,
  STAKE_STEP,
  arriveAt,
  departAt,
  openMs,
  fmtMult,
  payout,
  phaseAt,
  rideEnd,
  rideStart,
  survival,
} from './elevator.js'
import { eur } from '../comun/money.js'
import {
  buzz,
  isMuted,
  playBoom,
  playCash,
  playChip,
  playCreak,
  playDing,
  playDoors,
  playHeartbeat,
  playLose,
  playOvation,
  playSnap,
  playWin,
  setMuted,
} from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import WinToast from '../comun/WinToast.jsx'
import Help from '../comun/Help.jsx'
import ElevatorView from './ElevatorView.jsx'
import '../estilos/season3.css'
import './Elevator.css'
import './ElevatorView.css'

const JOIN_POLL_MS = 3000
// Tras salir hacia cada planta, lo que se espera para preguntar si el cable aguantó (el servidor lo dice a los 400 ms).
const DEPART_WAIT_MS = 450
// Tras acabar el viaje, cuándo está ya pagado (el servidor paga a los 1.000 ms).
const PAID_WAIT_MS = 1300
// Lo que se ve la caída («¡Se ha roto el cable!») antes de volver al vestíbulo a esperar el siguiente viaje.
const FALL_SHOW_MS = 4000
const CHIPS = [100, 250, 500, 1000, 2000]
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const fmtSec = (ms) => (ms / 1000).toLocaleString('es-ES')
const pct = (p) => `${Math.round(p * 100)} %`

// El Ascensor en vivo, en primera persona: el servidor guarda quién entra y dónde se baja, rompe el cable y paga.
function Elevator({ onExit, juegos }) {
  const [live, setLive] = useState(null)
  const [stake, setStake] = useState(500)
  const [auto, setAuto] = useState(null) // bajada automática elegida antes de entrar
  const [sending, setSending] = useState(false)
  const [sound, setSound] = useState(() => !isMuted())
  const [burst, setBurst] = useState(null)
  const [mine, setMine] = useState([]) // avisos propios (el bonus), con el mismo aspecto que los de los demás
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const heard = useRef({ round: null, floor: 0, open: false, done: false, out: false, bonus: false })
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const shownBank = useCountUp(balance)

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'elevator', ...message })
      const got = Date.now()
      if (body?.elevator) {
        if (skew.current === null || got - sent < 1500) skew.current = body.elevator.now - (sent + got) / 2
        setLive(body.elevator)
      }
      return body
    },
    [request],
  )

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(timer)
  }, [])

  const ready = skew.current !== null && live !== null
  const t = clock()
  const clockAt = phaseAt(t)
  const { round, offset } = clockAt
  const view = live?.round === round ? live : null
  const done = view?.phase === 'done'
  const crash = view?.crash ?? null
  const fallen = done && crash <= FLOORS
  // Pasada la caída, se espera el siguiente viaje en el vestíbulo, con el ascensor ya en la planta baja.
  const waiting = fallen && t >= rideEnd(round, crash) + FALL_SHOW_MS
  const roof = done && crash > FLOORS

  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  // Peticiones en los momentos justos: al salir de la planta baja, tras salir hacia cada planta (¿aguantó el cable?),
  // al llegar a la azotea y al empezar el siguiente viaje. Mientras se entra, cada pocos segundos para ver quién sube.
  useEffect(() => {
    if (!ready) return
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    const at = [rideStart(round) + 200, arriveAt(round, FLOORS) + DEPART_WAIT_MS, (round + 1) * ROUND_MS + 200]
    for (let f = 1; f <= FLOORS; f++) at.push(departAt(round, f) + DEPART_WAIT_MS)
    const timers = at
      .map((when) => when - clock())
      .filter((wait) => wait > 0)
      .map((wait) => setTimeout(sync, wait))
    const poll = setInterval(() => phaseAt(clock()).phase === 'join' && sync(), JOIN_POLL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, round, ask, clock])
  // Acabado el viaje, una petición más cuando ya está pagado: trae el reparto (bonus) y tu saldo nuevo.
  useEffect(() => {
    if (!done || view?.result) return
    const wait = rideEnd(round, crash) + PAID_WAIT_MS - clock()
    const timer = setTimeout(() => ask({ a: 'sync' }), Math.max(300, wait))
    return () => clearTimeout(timer)
  }, [done, view?.result, round, crash, ask, clock])

  // Planta hasta la que el servidor ya ha dicho que el cable aguanta: la cabina no llega a una planta sin esa respuesta,
  // así nunca se la ve llegar a donde no llegó.
  let confirmed = 0
  if (view && !done) for (let f = 1; f <= FLOORS; f++) if (view.now >= departAt(round, f) + 400) confirmed = f
  if (done) confirmed = roof ? FLOORS : crash - 1
  const riding = clockAt.phase !== 'join'
  let floor = riding ? Math.min(clockAt.floor, confirmed) : 0
  if (roof) floor = FLOORS
  const doorsOpenRide = riding && !done && clockAt.open && clockAt.floor <= confirmed
  const moving = riding && !done && !doorsOpenRide && floor < FLOORS

  const players = view?.players ?? []
  const me = players.find((p) => p.me) ?? null
  const myState = view?.mine ?? null
  const joined = Boolean(view?.joined)
  const myOut = me?.out ?? null
  const myStake = myState?.stake ?? 0
  const myAuto = myState?.auto ?? null
  const inside = players.filter((p) => p.out == null && !p.fell)
  const iAmInside = joined && myOut == null && !me?.fell
  const canJoin = ready && clockAt.phase === 'join' && !joined && stake <= balance
  const canExit = ready && iAmInside && doorsOpenRide && floor >= 1 && floor < FLOORS
  const pot = view?.pot ?? 0
  const bonus = view?.bonus ?? 0
  const result = view?.result ?? null
  const myLast = live?.last?.round === round ? live.last : null
  const next = Math.min(FLOORS, floor + 1)
  const chance = done ? null : riding ? (floor < FLOORS ? survival(next) / survival(floor) : null) : survival(1)
  const pov = waiting || !joined ? 'lobby' : myOut != null && !(roof && myOut === FLOORS) ? 'landing' : 'inside'

  // Sonidos: puertas y «ding» en cada planta, crujidos cuando el cable va justo y la caída o la azotea.
  useEffect(() => {
    const h = heard.current
    if (h.round !== round) {
      heard.current = { round, floor: 0, open: false, done: false, out: false, bonus: false }
      return
    }
    if (doorsOpenRide && !h.open) {
      h.open = true
      playDing(floor)
      setTimeout(() => playDoors(true), 250)
    } else if (!doorsOpenRide && h.open) {
      h.open = false
      playDoors(false)
    }
    if (moving && floor !== h.floor) {
      h.floor = floor
      if (chance != null && chance < 0.6) playCreak()
      if (iAmInside && chance != null && chance < 0.45) playHeartbeat()
    }
    if (done && !h.done) {
      h.done = true
      if (fallen) {
        if (iAmInside || me?.fell) {
          playSnap()
          buzz([80, 40, 260])
        } else playBoom()
      } else {
        playDing(FLOORS)
        if (joined && me?.out === FLOORS) setTimeout(playOvation, 400)
      }
    }
  }, [round, floor, doorsOpenRide, moving, done, fallen, chance, iAmInside, joined, me])

  // Celebración en cuanto te bajas (desde ese momento el premio es tuyo): como en el resto de juegos.
  useEffect(() => {
    const h = heard.current
    if (h.round !== round || h.out || myOut == null || !myStake) return
    h.out = true
    const won = payout(myStake, myOut)
    const net = won - myStake
    if (net <= 0) return
    const mult = MULTS[myOut] / 100
    playCash(Math.max(2, Math.round(mult * 2)))
    playWin(mult >= 3)
    buzz(mult >= 3 ? [60, 40, 60, 40, 160] : [60, 40, 80])
    setBurst({
      id: `${round}:${myOut}`,
      amount: net,
      stake: myStake,
      caption: myOut >= FLOORS ? `¡Llegaste a la azotea! ${fmtMult(MULTS[FLOORS])}` : `Te bajaste en la planta ${myOut} · ${fmtMult(MULTS[myOut])}`,
      tags: [],
    })
  }, [round, myOut, myStake])
  // Al pagar: el bonus del último en bajar (si es tuyo), el Admin Abuse, o la pérdida si caíste.
  useEffect(() => {
    const h = heard.current
    if (!result || !myLast || h.round !== round || h.bonus) return
    h.bonus = true
    const extra = myLast.floor != null ? myLast.payout - payout(myLast.stake, myLast.floor) : 0
    const notes = []
    if (myLast.top && extra > 0) notes.push({ key: `bonus:${round}`, name: juegos.me?.name ?? 'Tú', amount: extra, detail: 'con el bonus del último en bajar' })
    if (myLast.abuse > 0) notes.push({ key: `abuse:${round}`, name: juegos.me?.name ?? 'Tú', amount: myLast.abuse, detail: 'con el Admin Abuse' })
    if (notes.length) {
      playCash(4)
      setMine(notes)
    }
    if (myLast.net < 0) playLose()
  }, [result, myLast, round, juegos.me?.name])

  // Avisos de los demás: «Ana ha ganado 300 € bajándose en la planta 6».
  const othersWon = useMemo(
    () =>
      players
        .filter((p) => !p.me && p.out != null && payout(p.stake, p.out) > p.stake)
        .map((p) => ({
          key: `${round}:${p.name}`,
          name: p.name,
          amount: payout(p.stake, p.out) - p.stake,
          detail: p.out >= FLOORS ? 'en la azotea' : `bajándose en la planta ${p.out}`,
        })),
    [players, round],
  )
  const toasts = useMemo(() => [...mine, ...othersWon], [mine, othersWon])

  async function join() {
    if (!canJoin || sending) return
    setSending(true)
    playChip()
    await ask({ a: 'join', stake, auto })
    setSending(false)
  }
  async function getOff() {
    if (!canExit || sending) return
    setSending(true)
    playChip()
    await ask({ a: 'exit' })
    setSending(false)
  }
  async function changeAuto(value) {
    if (!joined) {
      setAuto(value)
      return
    }
    setSending(true)
    playChip()
    await ask({ a: 'auto', floor: value })
    setSending(false)
  }
  const pickable = (f) => !sending && !done && (joined ? iAmInside && f > (riding ? floor : 0) : clockAt.phase === 'join')

  // Espacio: subir o bajarse.
  const onKey = useEffectEvent((event) => {
    if (event.code !== 'Space' || event.repeat || event.target?.closest?.('input, select, textarea, button')) return
    event.preventDefault()
    if (canExit) getOff()
    else if (canJoin) join()
  })
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const joinLeft = Math.ceil((JOIN_MS - offset) / 1000)
  let status = 'Conectando con el ascensor…'
  if (juegos.error) status = juegos.error
  else if (ready && clockAt.phase === 'join')
    status = joined
      ? `Estás dentro con ${eur(myStake)}. Las puertas se cierran en ${joinLeft} s. Pulsa una planta para bajarte solo.`
      : `Paga la entrada y súbete. Las puertas se cierran en ${joinLeft} s.`
  else if (ready && !done) {
    if (!joined) status = `Planta ${floor}. Mira quién se baja… y súbete al siguiente viaje.`
    else if (myOut != null) status = `Te bajaste en la planta ${myOut} con ${eur(payout(myStake, myOut))}. ¿Aguantará el cable para los demás?`
    else if (floor === 0) status = 'Subiendo… En la primera planta ya te puedes bajar.'
    else if (doorsOpenRide) status = `Planta ${floor}: puertas abiertas. Bájate con ${eur(payout(myStake, floor))} o sigue subiendo.`
    else status = `Subiendo a la planta ${next}… (llega el ${pct(chance ?? 1)} de las veces)`
  } else if (ready && done) {
    if (roof) status = `¡El ascensor llegó a la azotea! Todos los que seguían dentro cobran ${fmtMult(MULTS[FLOORS])}.`
    else if (!result) status = `¡Se rompió el cable camino de la planta ${crash}!`
    else if (result.winners?.length)
      status = `¡Se rompió el cable camino de la planta ${crash}! ${result.winners.map((w) => w.name).join(', ')} ${result.winners.length > 1 ? 'se reparten' : 'se lleva'} el bonus de ${eur(result.bonus)}.`
    else status = `¡Se rompió el cable camino de la planta ${crash}! Nadie se bajó a tiempo.`
    if (waiting) status = `Se rompió el cable camino de la planta ${crash}. Ya lo están arreglando: siguiente viaje en ${Math.max(0, Math.ceil(((round + 1) * ROUND_MS - t) / 1000))} s.`
  }

  // Bajadas por planta, para pintarlas en los rellanos.
  const outAt = new Map()
  for (const p of players) if (p.out != null) outAt.set(p.out, [...(outAt.get(p.out) ?? []), p])
  const history = live?.history ?? []
  const exitLabel = canExit ? `Bajarme ${eur(payout(myStake, floor))}` : floor < 1 && riding ? 'Subiendo' : riding ? 'Cerrado' : 'Bajarme'
  const won = Boolean(myOut != null && payout(myStake, myOut) > myStake)

  return (
    <main className="app s3-app elevator-app">
      <header className="top">
        <h1>El Ascensor</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>Bonus</dt>
              <dd>{eur(bonus)}</dd>
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
                Cada {ROUND_MS / 1000} s hay un viaje para todos. Durante {JOIN_MS / 1000} s pagas la entrada (de {eur(MIN_STAKE)} a{' '}
                {eur(MAX_STAKE)}) y te subes. Luego el ascensor sube planta a planta y <b>cada vez más rápido</b>: en
                la primera planta las puertas están abiertas {fmtSec(openMs(1))} s y en la 15 solo {fmtSec(openMs(FLOORS - 1))} s.
              </p>
              <p>
                Con las puertas abiertas puedes <b>bajarte</b> (el botón rojo de la botonera o <kbd>Espacio</kbd>) y cobras tu
                entrada por el multiplicador de esa planta, de {fmtMult(MULTS[1])} en la primera a {fmtMult(MULTS[FLOORS - 1])} en la{' '}
                {FLOORS - 1}. Pulsa una planta en la botonera y te bajas solo al llegar. Si llega a la azotea ({FLOORS}), todos los
                que siguen dentro cobran {fmtMult(MULTS[FLOORS])}.
              </p>
              <p>
                En un trayecto al azar <b>se rompe el cable</b>: quien sigue dentro pierde la entrada. Cuanto más arriba, menos
                probable es llegar: a cada planta llega el {Math.round(HOUSE * 100)} % entre su multiplicador (por ejemplo, a ×2 el{' '}
                {pct(HOUSE / 2)}). La barra del display dice lo probable que es llegar a la siguiente.
              </p>
              <p>
                <b>Bonus:</b> el último en bajarse antes de que caiga el cable se lleva además el {Math.round(BONUS * 100)} % de todas
                las entradas del viaje (si empatan, se reparte según la entrada). Lo que se pierde va a la jaula del bingo.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="s3 fill">
        <section className="s3__stage el" aria-label="El ascensor">
          <p className={`status ${won ? 'status--win' : ''}`} aria-live="polite">
            {status}
          </p>
          <ElevatorView
            pov={pov}
            floor={waiting ? 0 : floor}
            here={waiting ? 0 : (myOut ?? 0)}
            phase={clockAt.phase}
            doorsOpen={(clockAt.phase === 'join' && joined) || doorsOpenRide || roof}
            moving={moving}
            fallen={fallen && !waiting}
            roof={roof}
            crash={crash}
            inside={waiting ? [] : done ? players.filter((p) => (roof ? p.out >= FLOORS : p.fell)) : inside}
            outAt={outAt}
            next={next}
            chance={chance}
            autoFloor={joined ? myAuto : auto}
            pickable={pickable}
            onPick={changeAuto}
            canExit={canExit && !sending}
            onExit={getOff}
            exitLabel={exitLabel}
            joinedCount={players.length}
            status={status}
          />
          <div className="el-strip">
            <span>
              <small>Dentro</small>
              <b>{inside.length}</b>
            </span>
            <span>
              <small>Se bajaron</small>
              <b>{players.filter((p) => p.out != null).length}</b>
            </span>
            <span>
              <small>Bote del viaje</small>
              <b>{eur(pot)}</b>
            </span>
            <span className="el-strip__hist" aria-label="Últimas caídas">
              {history.slice(0, 8).map((h) => (
                <i key={h.round} className={h.crash > FLOORS ? 'is-roof' : h.crash >= 8 ? 'is-high' : ''}>
                  {h.crash > FLOORS ? 'AZ' : h.crash}
                </i>
              ))}
            </span>
          </div>
        </section>

        <aside className="s3__panel el-panel">
          <div className="s3__group">
            <h2>{clockAt.phase === 'join' && !joined ? 'Entrada' : 'Tu viaje'}</h2>
            {clockAt.phase === 'join' && !joined ? (
              <>
                <p className="el-amount" key={stake}>
                  {eur(stake)}
                  <small>Bonus del viaje ahora: {eur(Math.floor((pot + stake) * BONUS))}</small>
                </p>
                <input
                  className="el-slider"
                  type="range"
                  min={MIN_STAKE}
                  max={MAX_STAKE}
                  step={STAKE_STEP}
                  value={stake}
                  aria-label="Entrada"
                  onChange={(e) => setStake(Number(e.target.value))}
                />
                <div className="el-chips" role="group" aria-label="Entradas rápidas">
                  {CHIPS.map((c) => (
                    <button key={c} type="button" className={`el-chip ${stake === c ? 'is-on' : ''}`} aria-pressed={stake === c} onClick={() => setStake(c)}>
                      {c >= 1000 ? `${c / 1000}k` : c}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="el-amount">
                {joined ? eur(myStake) : 'Mirando'}
                <small>
                  {!joined
                    ? `${plural(players.length, 'jugador', 'jugadores')} en este viaje`
                    : myOut != null
                      ? `Bajaste en la ${myOut}: ${eur(payout(myStake, myOut))}`
                      : me?.fell
                        ? 'Caíste con el ascensor'
                        : doorsOpenRide
                          ? `Si te bajas ahora: ${eur(payout(myStake, floor))}`
                          : `En la planta ${next}: ${eur(payout(myStake, next))}`}
                </small>
              </p>
            )}
            <label className="el-auto">
              Bajarme solo en
              <select
                value={(joined ? myAuto : auto) ?? ''}
                disabled={sending || (joined && (!iAmInside || done))}
                onChange={(e) => changeAuto(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">A mano</option>
                {Array.from({ length: FLOORS - 1 }, (_, i) => i + 1)
                  .filter((f) => !riding || f > floor)
                  .map((f) => (
                    <option key={f} value={f}>
                      Planta {f} · {fmtMult(MULTS[f])} ({pct(survival(f))} de llegar)
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="actions s3__actions el-actions">
            {iAmInside && riding && !done ? (
              <button type="button" className="primary el-off" disabled={!canExit || sending} onClick={getOff}>
                {floor < 1 ? 'Subiendo…' : doorsOpenRide ? `Bajarme · ${eur(payout(myStake, floor))}` : 'Puertas cerradas…'}
              </button>
            ) : (
              <button type="button" className="primary" disabled={!canJoin || sending} onClick={join}>
                {clockAt.phase !== 'join'
                  ? 'Súbete al siguiente'
                  : joined
                    ? '¡Dentro!'
                    : stake > balance
                      ? 'No te llega el saldo'
                      : sending
                        ? 'Subiendo…'
                        : `Subir por ${eur(stake)}`}
              </button>
            )}
          </div>
          {myLast && result && (
            <div className={`el-last ${myLast.net > 0 ? 'is-win' : 'is-lose'}`}>
              <small>Tu último viaje</small>
              <b>{myLast.net > 0 ? `+${eur(myLast.net)}` : `−${eur(myLast.stake)}`}</b>
              <span>{myLast.floor == null ? `Caíste camino de la ${myLast.crash}` : `Bajaste en la ${myLast.floor}${myLast.top ? ' · bonus' : ''}`}</span>
            </div>
          )}
          <div className="s3__group">
            <h2>Últimos viajes</h2>
            {history.length === 0 ? (
              <p className="s3__hint">Todavía no ha subido nadie esta semana.</p>
            ) : (
              <ul className="el-history">
                {history.map((h) => (
                  <li key={h.round} className={h.crash > FLOORS ? 'is-roof' : ''}>
                    <b>{h.crash > FLOORS ? 'Azotea' : `Cae en la ${h.crash}`}</b>
                    <span>
                      {plural(h.players, 'jugador', 'jugadores')}
                      {h.winners?.length ? ` · bonus: ${h.winners.map((w) => w.name).join(', ')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <WinToast wins={toasts} />
      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={burst.caption}
          coins={60}
          big={burst.amount >= burst.stake * 3}
          who={juegos.me?.name}
          tags={burst.tags}
        />
      )}
    </main>
  )
}

export default Elevator
