// Mesa en vivo de duelos de Criaturas de las Islas (engine/criaturas-room.mjs): dos jugadores, cada uno con las
// criaturas de su equipo en su forma final al mismo nivel. Se acuerda la apuesta, los dos se ponen listos y cada turno
// eligen a la vez qué hacen (atacar o cambiar); cuando eligen los dos, o se acaba el tiempo, el servidor lo resuelve y
// aquí se enseña paso a paso. Quien gana se lleva el bote menos el 4 % de la casa.
import { useEffect, useRef, useState } from 'react'
import Avatar from '../comun/Avatar.jsx'
import Help from '../comun/Help.jsx'
import { eur } from '../comun/money.js'
import Chat from '../table/Chat.jsx'
import Invite from '../table/Invite.jsx'
import { useCountdown } from '../table/useCountdown.js'
import WinBurst from '../comun/WinBurst.jsx'
import { buzz, playClunk, playLose, playTurn, playWin } from '../comun/sound.js'
import { MOVES, SPECIES, TYPES, alive, bestMove, effText, effectiveness, finalOf, movesOf } from './criaturas.js'
import CriaturaArt from './CriaturaArt.jsx'
import './Criaturas.css'
import './duelo.css'

const STAKES = [0, 100, 500, 1000, 2500, 5000, 10000]
const REASONS = { ko: 'Fuera de combate', rendicion: 'Se rinde', abandono: 'Dejó la mesa', ausente: 'No eligió en tres turnos', turnos: 'Demasiados turnos: empate' }
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))
const nameOf = (c) => SPECIES[c.sp].name

function Hp({ c, numbers }) {
  const pct = Math.max(0, (c.hp / c.max) * 100)
  return (
    <span className="cr-hp">
      <span className="cr-hp__bar">
        <i style={{ width: `${pct}%` }} className={pct < 25 ? 'is-low' : pct < 55 ? 'is-mid' : undefined} />
      </span>
      {numbers && (
        <small>
          {c.hp}/{c.max}
        </small>
      )}
    </span>
  )
}

// Un asiento en la espera: quién es, su equipo (en forma final) y si está listo.
function SeatCard({ seat, index, mine, canSit, send, level }) {
  if (!seat)
    return (
      <div className="du-seat is-empty">
        <b>Asiento libre</b>
        {canSit ? (
          <button type="button" className="du-btn du-btn--gold" onClick={() => send({ t: 'sit', seat: index })}>
            Sentarse
          </button>
        ) : (
          <small>Esperando rival…</small>
        )}
      </div>
    )
  return (
    <div className={`du-seat ${seat.ready ? 'is-ready' : ''} ${mine ? 'is-mine' : ''} ${seat.connected ? '' : 'is-away'}`}>
      <div className="du-seat__who">
        <Avatar name={seat.name} src={seat.avatar} size={40} />
        <span>
          <b>{seat.name}</b>
          <small>{seat.ready ? '✓ Listo' : mine ? 'Elige apuesta y ponte listo' : 'Pensándoselo…'}</small>
        </span>
      </div>
      <ul className="du-team">
        {(seat.team ?? []).length ? (
          seat.team.map((sp, i) => (
            <li key={i} title={`${SPECIES[finalOf(sp)].name} · nivel ${level}`}>
              <CriaturaArt sp={finalOf(sp)} />
            </li>
          ))
        ) : (
          <li className="du-team__none">El equipo se ve al ponerse listo</li>
        )}
      </ul>
    </div>
  )
}

function DueloTable({ room, me, error, send, onLeave, chat, pending }) {
  const { state, at } = room
  const mySeat = state.seats.findIndex((s) => s?.id === me?.id)
  const seated = mySeat >= 0
  const meSide = seated ? mySeat : 0
  const them = 1 - meSide
  const playing = state.phase === 'playing'
  const over = state.phase === 'over'
  const countdown = useCountdown(state.deadlineIn, state.deadlineTotal, at)

  // Lo que se ve del combate: va por detrás del servidor mientras se anima el último turno.
  const [shown, setShown] = useState(state.sides)
  const [line, setLine] = useState('')
  const [anim, setAnim] = useState({ atk: null, hit: null })
  const [switching, setSwitching] = useState(false)
  const lastTurn = useRef(state.lastLog?.turn ?? 0)
  const lastMatch = useRef(state.match)
  const alive_ = useRef(true)
  useEffect(() => () => (alive_.current = false), [])

  useEffect(() => {
    // Duelo nuevo: se empieza de cero.
    if (state.match !== lastMatch.current) {
      lastMatch.current = state.match
      lastTurn.current = 0
      setShown(state.sides)
      setLine('¡Empieza el duelo!')
      playTurn()
      return
    }
    const log = state.lastLog
    if (!log || log.turn <= lastTurn.current || !shown) {
      if (!shown && state.sides) setShown(state.sides)
      return
    }
    lastTurn.current = log.turn
    const target = state.sides
    let b = { sides: shown.map((s) => ({ ...s, team: s.team.map((c) => ({ ...c })) })) }
    const mineSide = (side) => seated && side === meSide
    ;(async () => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const pause = (ms) => (reduced ? Promise.resolve() : wait(ms))
      for (const e of log.log) {
        if (!alive_.current) return
        const act = (side) => b.sides[side].team[b.sides[side].a]
        if (e.t === 'move') {
          setLine(`${mineSide(e.side) ? '' : 'El rival: '}¡${nameOf(act(e.side))} usa ${MOVES[e.move].name}!`)
          setAnim({ atk: e.side, hit: null })
          await pause(420)
          if (e.miss) {
            setLine((l) => `${l} … pero falla.`)
          } else {
            const t = act(1 - e.side)
            t.hp = Math.max(0, t.hp - e.dmg)
            setShown(b.sides.map((s) => ({ ...s, team: [...s.team] })))
            setAnim({ atk: null, hit: 1 - e.side })
            playClunk()
            const extra = [e.crit ? '¡Golpe crítico!' : '', effText(e.eff)].filter(Boolean).join(' ')
            if (extra) setLine(extra)
          }
          await pause(650)
          setAnim({ atk: null, hit: null })
        } else if (e.t === 'faint') {
          setLine(`¡${nameOf(act(e.side))} se ha debilitado!`)
          await pause(750)
        } else if (e.t === 'send') {
          b.sides[e.side] = { ...b.sides[e.side], a: e.idx }
          setShown(b.sides.map((s) => ({ ...s, team: [...s.team] })))
          setLine(mineSide(e.side) ? `¡Adelante, ${nameOf(act(e.side))}!` : `El rival saca a ${nameOf(act(e.side))}.`)
          await pause(600)
        } else if (e.t === 'idle') {
          setLine(mineSide(e.side) ? 'No elegiste a tiempo: pierdes el turno.' : 'El rival no eligió a tiempo: pierde el turno.')
          await pause(600)
        }
      }
      if (!alive_.current) return
      if (target) setShown(target)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastLog?.turn, state.match])

  // Al acabar: celebración o derrota (una vez por duelo).
  const heard = useRef(null)
  useEffect(() => {
    if (!over || !state.result || heard.current === state.match) return
    heard.current = state.match
    if (!seated) return
    if (state.result.winner === mySeat) {
      playWin(true)
      buzz([60, 40, 80])
    } else if (state.result.winner !== null) playLose()
  }, [over, state.result, state.match, seated, mySeat])

  const mine = state.seats[mySeat] ?? null
  const rivalSeat = state.seats[them]
  const canSit = !seated && state.seats.some((s) => !s)
  const sides = playing || over ? (shown ?? state.sides) : null
  const myTurn = playing && seated && state.must[mySeat] && !state.chosen[mySeat]
  const needSwitch = playing && seated && state.sides?.[mySeat]?.need
  const iChose = playing && seated && state.chosen[mySeat]

  const act = (msg) => {
    setSwitching(false)
    send({ t: 'duel', ...msg })
  }

  let status
  if (state.phase === 'waiting') {
    if (countdown && state.deadlineIn !== null) status = `¡Empieza en ${countdown.seconds}…!`
    else if (!rivalSeat || !mine) status = seated ? 'Esperando a que se siente un rival. Invita a alguien con el enlace.' : 'Siéntate para retar a quien esté en la mesa.'
    else status = `Apuesta: ${state.stake ? eur(state.stake) : 'amistoso (sin dinero)'}. Cuando estéis listos los dos, empieza.`
  } else if (playing) {
    if (!seated) status = `Turno ${state.turn}: los dos están eligiendo…`
    else if (needSwitch && !iChose) status = '¡Tu criatura se ha debilitado! Elige cuál sale.'
    else if (myTurn) status = `Turno ${state.turn}: elige qué hace ${shown ? nameOf(shown[mySeat].team[shown[mySeat].a]) : 'tu criatura'}.`
    else if (iChose) status = `Elegido. Esperando a ${rivalSeat?.name ?? 'tu rival'}…`
    else status = `Esperando a que ${rivalSeat?.name ?? 'tu rival'} saque otra criatura…`
  } else if (over && state.result) {
    const r = state.result
    if (r.winner === null) status = `${REASONS[r.reason] ?? 'Empate'}: cada uno recupera su apuesta.`
    else status = `${REASONS[r.reason] ?? ''}: gana ${r.names[r.winner]}${r.pot ? ` y se lleva ${eur(r.won[r.winner])}` : ''}.`
  }

  const help = (
    <>
      <p>
        Retas a otra persona con tu equipo de Criaturas de las Islas. Cada uno lleva sus {state.limits.party} primeras criaturas (si uno lleva menos, los dos
        combatís con ese número) y <b>todas luchan en su forma final al nivel {state.limits.level}</b>: cuenta tu equipo y tu estrategia, no lo entrenado.
      </p>
      <p>
        Elegís la apuesta (o un duelo amistoso) y os ponéis listos. En cada turno elegís a la vez: atacar o cambiar de criatura. Los cambios van primero y
        después ataca la más rápida. Tenéis {Math.round(state.limits.turn / 1000)} s por turno: quien no elige pierde el turno, y a los tres seguidos, el
        duelo.
      </p>
      <p>Quien deja a la otra sin criaturas gana el bote, menos un {Math.round(state.limits.fee * 100)} % para la casa (va al bote del bingo).</p>
    </>
  )

  const renderSide = (side, where) => {
    const s = sides[side]
    const c = s.team[s.a]
    return (
      <>
        <div className={`cr-info cr-info--${where}`}>
          <b>
            {nameOf(c)} <small>Nv. {c.lvl}</small>
          </b>
          <Hp c={c} numbers={where === 'me'} />
          <small className="du-left">
            {state.seats[side]?.name ?? '—'} · le quedan {alive(s.team).length}/{s.team.length}
          </small>
        </div>
        <div
          key={`${side}-${s.a}-${state.match}`}
          className={`cr-mon cr-mon--${where === 'me' ? 'me' : 'rival'} ${anim.atk === side ? 'is-atk' : ''} ${anim.hit === side ? 'is-hit' : ''} ${c.hp <= 0 ? 'is-down' : ''}`}
        >
          <CriaturaArt sp={c.sp} flip={where === 'me'} />
        </div>
      </>
    )
  }

  const myActive = sides && seated ? sides[mySeat].team[sides[mySeat].a] : null
  const theirActive = sides ? sides[them].team[sides[them].a] : null

  return (
    <main className="app fi-app cr-app du-app">
      <header className="top">
        <h1>Duelo de Criaturas</h1>
        <p className="du-room">
          <span>Mesa pública</span> <b>{state.label ?? state.code}</b>
          {state.spectators > 0 && <small> · {state.spectators} mirando</small>}
        </p>
        <div className="toggles">
          <Help className="tg tg--help" title="Duelo de Criaturas">
            {help}
          </Help>
          <Invite game="criaturas" code={state.code} name="Duelo de Criaturas" />
          <button type="button" className="tg tg--back" onClick={onLeave}>
            Salir
          </button>
        </div>
      </header>

      <div className="fi fill">
        <section className="fi-stage cr-stage du-stage" aria-label="El duelo">
          {!sides ? (
            <div className="du-wait">
              <SeatCard seat={state.seats[0]} index={0} mine={mySeat === 0} canSit={canSit} send={send} level={state.limits.level} />
              <span className="du-vs">VS</span>
              <SeatCard seat={state.seats[1]} index={1} mine={mySeat === 1} canSit={canSit} send={send} level={state.limits.level} />
            </div>
          ) : (
            <div className="cr-arena">
              <div className="cr-field" aria-hidden="true">
                <span className="cr-pad cr-pad--rival" />
                <span className="cr-pad cr-pad--me" />
              </div>
              {renderSide(them, 'rival')}
              {renderSide(meSide, 'me')}
              <p className="cr-line" role="status" aria-live="polite">
                {line || status}
              </p>
              <div className="cr-actions">
                {playing && countdown && (
                  <div className="du-timer" aria-label={`Quedan ${countdown.seconds} s`}>
                    <i style={{ width: `${countdown.fraction * 100}%` }} />
                    <span>{countdown.seconds} s</span>
                  </div>
                )}
                {playing && seated && (needSwitch || switching) && !iChose && (
                  <div className="cr-swap">
                    <b>{needSwitch ? '¿A quién sacas?' : 'Cambiar de criatura (va antes que los ataques)'}</b>
                    <ul>
                      {state.sides[mySeat].team.map((c, i) => (
                        <li key={i}>
                          <button type="button" disabled={pending || c.hp <= 0 || i === state.sides[mySeat].a} onClick={() => act({ kind: 'switch', to: i })}>
                            <CriaturaArt sp={c.sp} flip />
                            <span>
                              {nameOf(c)} <small>Nv. {c.lvl}</small>
                              <Hp c={c} numbers />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {!needSwitch && (
                      <button type="button" className="cr-swap__back" onClick={() => setSwitching(false)}>
                        Volver
                      </button>
                    )}
                  </div>
                )}
                {playing && myTurn && !needSwitch && !switching && myActive && theirActive && (
                  <>
                    <div className="cr-moves">
                      {movesOf(myActive.sp, myActive.lvl).map((id) => {
                        const m = MOVES[id]
                        const eff = effectiveness(m.type, SPECIES[theirActive.sp].type)
                        return (
                          <button
                            key={id}
                            type="button"
                            className={`cr-move ${id === bestMove(myActive, theirActive) ? 'is-hint' : ''}`}
                            style={{ '--c': TYPES[m.type].color }}
                            disabled={pending}
                            onClick={() => act({ kind: 'move', move: id })}
                          >
                            <b>{m.name}</b>
                            <small>
                              {TYPES[m.type].name} · {m.power} · {m.acc} %{eff >= 2 ? ' · ¡muy eficaz!' : eff <= 0.5 ? ' · poco eficaz' : ''}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                    <div className="cr-extra">
                      <button type="button" disabled={pending || alive(state.sides[mySeat].team).length < 2} onClick={() => setSwitching(true)}>
                        🔁 Cambiar
                      </button>
                      <button type="button" disabled={pending} onClick={() => act({ kind: 'resign' })}>
                        🏳 Rendirse
                      </button>
                    </div>
                  </>
                )}
                {over && state.result && (
                  <div className={`cr-result ${seated && state.result.winner === mySeat ? 'is-win' : 'is-lose'}`}>
                    <b>{state.result.winner === null ? 'Empate' : seated ? (state.result.winner === mySeat ? '¡Victoria!' : 'Derrota') : `Gana ${state.result.names[state.result.winner]}`}</b>
                    <span>{status}</span>
                    <small>La revancha empieza en la mesa cuando os pongáis listos otra vez.</small>
                  </div>
                )}
              </div>
            </div>
          )}
          {(!sides || error) && (
            <p className={`fi-status ${error ? 'is-bad' : ''}`} role="status">
              {error || status}
            </p>
          )}
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>Bote</small>
            <b>{eur(state.stake * 2)}</b>
            <span className="fi-prize__tag">{state.stake ? `${eur(state.stake)} cada uno · la casa, ${Math.round(state.limits.fee * 100)} %` : 'Duelo amistoso'}</span>
          </div>

          {state.phase === 'waiting' && seated && (
            <>
              <div className="fi-group">
                <h2>Apuesta</h2>
                <div className="du-stakes">
                  {STAKES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={state.stake === n}
                      disabled={pending || (mine && n > mine.balance)}
                      onClick={() => send({ t: 'bet', amount: n })}
                    >
                      {n ? eur(n) : 'Amistoso'}
                    </button>
                  ))}
                </div>
                <p className="fi-hint">Al cambiarla quedas listo tú y el otro tiene que aceptarla.</p>
              </div>
              <button type="button" className={`fi-go ${mine?.ready ? 'fi-go--cash' : ''}`} disabled={pending} onClick={() => send({ t: 'ready' })}>
                {mine?.ready ? 'Ya no estoy listo' : '¡Listo!'}
              </button>
              <button type="button" className="du-btn" disabled={pending} onClick={() => send({ t: 'stand_up' })}>
                Levantarse
              </button>
            </>
          )}

          {sides && (
            <div className="fi-group">
              <h2>Equipos</h2>
              {[meSide, them].map((side) => (
                <div key={side} className="du-roster">
                  <b>{state.seats[side]?.name ?? '—'}</b>
                  <ul>
                    {sides[side].team.map((c, i) => (
                      <li key={i} className={c.hp <= 0 ? 'is-down' : i === sides[side].a ? 'is-out' : undefined} title={`${nameOf(c)} ${c.hp}/${c.max}`}>
                        <CriaturaArt sp={c.sp} />
                      </li>
                    ))}
                  </ul>
                  {playing && <small>{state.chosen[side] ? '✓ Ha elegido' : state.must[side] ? 'Eligiendo…' : 'Esperando'}</small>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {over && state.result && seated && state.result.winner === mySeat && state.result.won[mySeat] > 0 && (
        <WinBurst key={state.match} amount={state.result.won[mySeat] - state.stake} caption="Duelo ganado" coins={40} big={state.stake >= 2500} who={me?.name} />
      )}
      <Chat messages={chat ?? []} me={me} send={send} />
    </main>
  )
}

export default DueloTable
