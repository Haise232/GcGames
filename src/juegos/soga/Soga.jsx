import { useCallback, useEffect, useRef, useState } from 'react'
import { ENTRY, JOIN_MS, MAX_TAPS, PULL_MS, ROUND_MS, TAP_RATE, TEAM_NAME, capAt, phaseAt, ropeAt } from './soga.js'
import { Cuerda, TapPad, useTaps } from './Cuerda.jsx'
import { useEnVivo, useTick } from '../comun/useEnVivo.js'
import { eur } from '../comun/money.js'
import { isMuted, playBeep, playGo, playLose, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import './Soga.css'

const TOPIC = 'juegos-soga'
const COLOR = { r: '#ff5a5f', b: '#3d8cff' }
const POLL_MS = 6000
const PAID_WAIT_MS = 2900 // tras acabar de tirar, cuándo está ya repartido (el servidor reparte a los 2,4 s)
const SHOUT_MS = 250

const secs = (ms) => Math.max(0, Math.ceil(ms / 1000))
const fmt = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

function Soga({ onExit, juegos }) {
  const { request } = juegos
  const [sound, setSound] = useState(() => !isMuted())
  const [sending, setSending] = useState(false)
  const peers = useRef(new Map()) // lo que lleva tirado cada navegador en esta ronda: id → { r, team, n }
  const me = useRef(`${Math.random().toString(36).slice(2, 10)}`)
  const onPeer = useCallback((p) => {
    if (p && typeof p.id === 'string' && Number.isFinite(p.n)) peers.current.set(p.id, p)
  }, [])
  const { live, ready, ask, clock, shout } = useEnVivo(request, 'soga', TOPIC, onPeer)
  useTick(100)
  const shownBank = useCountUp(juegos.me?.balance ?? 0)

  const t = clock()
  const { round, phase, joinEnd, start, end, next } = phaseAt(t)
  const view = live?.round === round ? live : null
  const team = view?.team ?? null
  const pulling = phase === 'pull'
  const [n, tap, count] = useTaps(pulling && Boolean(team), start, clock, capAt)
  useEffect(() => {
    peers.current.clear()
  }, [round])

  // Respaldo del Realtime y peticiones en los momentos clave: al cerrar equipos y cuando ya está repartido.
  useEffect(() => {
    if (!ready) return
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    const at = [joinEnd + 300, end + PAID_WAIT_MS, next + 200]
    const timers = at.map((when) => when - clock() + Math.random() * 300).filter((wait) => wait > 0).map((wait) => setTimeout(sync, wait))
    const poll = setInterval(sync, POLL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, round, joinEnd, end, next, ask, clock])

  // Mientras se tira: lo que llevo se lo cuento a los demás cada poco, y al servidor a la mitad y al acabar.
  useEffect(() => {
    if (!team || !ready) return
    const now = clock()
    if (now >= end + 1500) return
    let last = -1
    const tell = setInterval(() => {
      if (clock() < start || count.current === last) return
      last = count.current
      shout({ r: round, id: me.current, team, n: last })
    }, SHOUT_MS)
    const send = () => count.current > 0 && ask({ a: 'pull', n: count.current })
    const timers = [start + PULL_MS / 2, end + 120].map((when) => setTimeout(send, Math.max(0, when - now)))
    return () => {
      clearInterval(tell)
      timers.forEach(clearTimeout)
    }
  }, [team, ready, round, start, end, ask, clock, shout, count])

  // Sonidos: la cuenta atrás, el pistoletazo y el resultado.
  const cue = useRef('')
  const left = phase === 'ready' ? secs(start - t) : 0
  const result = view?.result ?? null
  useEffect(() => {
    const key = `${round}:${phase}:${left}:${result ? 'r' : ''}`
    if (cue.current === key) return
    cue.current = key
    if (!team) return
    if (phase === 'ready') playBeep(1)
    else if (phase === 'pull') playGo()
    else if (phase === 'result' && result) (result.winner === team ? playWin : result.refund ? playBeep : playLose)()
  }, [round, phase, left, result, team])

  const join = async (which) => {
    if (sending) return
    setSending(true)
    await ask({ a: 'join', team: which })
    setSending(false)
  }

  const members = view?.members ?? []
  const of = (which) => members.filter((m) => m.team === which)
  // La media de cada equipo en directo: lo que cuenta cada navegador (y lo mío, al momento); al acabar, lo del servidor.
  const liveMean = (which) => {
    const list = of(which)
    if (!list.length) return 0
    if (result) return result.mean[which]
    if (phase === 'result') return list.reduce((sum, m) => sum + m.taps, 0) / list.length
    let sum = team === which ? n : 0
    for (const p of peers.current.values()) if (p.r === round && p.team === which && p.id !== me.current) sum += p.n
    return sum / list.length
  }
  const mean = { r: liveMean('r'), b: liveMean('b') }
  const side = (which) => ({ name: TEAM_NAME[which], color: COLOR[which], faces: of(which), score: phase === 'join' || phase === 'ready' ? of(which).length : fmt(mean[which]) })
  const winner = result ? (result.winner === 'r' ? 'left' : result.winner === 'b' ? 'right' : null) : null
  const pot = members.length * ENTRY
  const canJoin = phase === 'join' && !team
  const mine = result?.players.find((p) => p.me)

  let headline = 'Elige equipo'
  let sub = `Se cierra en ${secs(joinEnd - t)} s`
  if (phase === 'join' && team) headline = `Vas con el ${TEAM_NAME[team]}`
  if (phase === 'ready') {
    headline = `${left}`
    sub = team ? 'Preparados…' : 'Equipos cerrados'
  } else if (phase === 'pull') {
    headline = '¡Tira!'
    sub = `Quedan ${secs(end - t)} s`
  } else if (phase === 'result') {
    sub = `Siguiente ronda en ${secs(next - t)} s`
    if (!members.length) headline = 'Nadie ha tirado'
    else if (!result) headline = 'Contando tirones…'
    else if (result.refund) headline = result.count.r && result.count.b ? 'Empate: se devuelve' : 'Faltó un equipo: se devuelve'
    else headline = `Gana el ${TEAM_NAME[result.winner]}`
  }

  return (
    <main className="app sg-app">
      <header className="top">
        <h1>Tira y Afloja</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>Bote de la ronda</dt>
              <dd>{eur(pot)}</dd>
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
            <Help className="tg tg--help" title="Cómo se juega al Tira y Afloja">
              <p>
                Cada {ROUND_MS / 1000} s hay una ronda para todo el casino. Durante {JOIN_MS / 1000} s eliges equipo, <b>Rojo</b> o <b>Azul</b>, y pagas la
                entrada de <b>{eur(ENTRY)}</b>.
              </p>
              <p>
                Después se tira de la cuerda durante {PULL_MS / 1000} s: pulsa el botón (o la barra espaciadora) todo lo rápido que puedas. Cuentan hasta{' '}
                {TAP_RATE} tirones por segundo ({MAX_TAPS} en total).
              </p>
              <p>
                Gana el equipo que más tira <b>de media</b>, así que da igual que un equipo tenga más gente: lo que cuenta es que todos tiren. Los
                ganadores se reparten todas las entradas a partes iguales: cuanta menos gente en tu equipo, más te toca.
              </p>
              <p>Si un equipo se queda vacío o hay empate, se devuelve la entrada a todos.</p>
            </Help>
          </div>
        </div>
      </header>

      <section className="sg-stage">
        <div className={`sg-head sg-head--${phase}`} aria-live="polite">
          <b>{headline}</b>
          <span>{sub}</span>
        </div>
        <Cuerda pos={phase === 'join' || phase === 'ready' ? 0 : ropeAt(mean.r, mean.b)} left={side('r')} right={side('b')} pulling={pulling} winner={winner} />

        {canJoin ? (
          <div className="sg-pick">
            {['r', 'b'].map((which) => (
              <button key={which} type="button" className={`sg-team sg-team--${which}`} disabled={sending || !ready} onClick={() => join(which)}>
                <b>Equipo {TEAM_NAME[which]}</b>
                <span>Entrar · {eur(ENTRY)}</span>
              </button>
            ))}
          </div>
        ) : phase === 'result' ? (
          <div className="sg-result">
            {mine ? (
              <p className={mine.paid > ENTRY ? 'is-win' : mine.paid === ENTRY ? '' : 'is-lose'}>
                {mine.paid > ENTRY ? `Te llevas ${eur(mine.paid)}` : mine.paid === ENTRY ? `Recuperas tu entrada de ${eur(ENTRY)}` : `Pierdes la entrada de ${eur(ENTRY)}`}
                <small>
                  Tiraste {mine.taps} veces · Rojo {fmt(result.mean.r)} de media, Azul {fmt(result.mean.b)}
                </small>
              </p>
            ) : (
              <p>
                {result && !result.refund ? `Cada ganador se lleva ${eur(result.share)}` : 'Apúntate a la siguiente'}
                <small>Los equipos se abren al empezar la ronda</small>
              </p>
            )}
          </div>
        ) : team ? (
          <TapPad active={pulling} onTap={tap} n={n} idle={phase === 'ready' ? 'Preparados…' : `Con el ${TEAM_NAME[team]}`} />
        ) : (
          <div className="sg-result">
            <p>
              Mirando esta ronda
              <small>Podrás elegir equipo en la siguiente</small>
            </p>
          </div>
        )}
      </section>

      {live?.history?.length > 0 && (
        <section className="sg-history" aria-label="Últimas rondas">
          <h2>Últimas rondas</h2>
          <ul>
            {live.history.map((h) => (
              <li key={h.round} className={h.refund ? '' : `is-${h.winner}`}>
                <b>{h.refund ? 'Devuelto' : TEAM_NAME[h.winner]}</b>
                <span>
                  {h.count.r} contra {h.count.b}
                </span>
                <small>{h.refund ? '—' : eur(h.share)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {members.length > 0 && phase !== 'join' && (
        <ul className="sg-members" aria-label="Quién tira">
          {members.map((m, i) => (
            <li key={`${m.name}-${i}`} style={{ '--team': COLOR[m.team] }}>
              <Avatar name={m.name} src={m.avatar} size={26} />
              <span>{m.name}</span>
              {phase === 'result' && <b>{m.taps}</b>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default Soga
