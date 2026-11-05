import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { HOUSE, MAX_MULT, MIN_BET, STEP, chance, clampBet, maxBetFor, payout, tension, toneOf } from './frog.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playCash, playChip, playHop, playLand, playSplash, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import { Cheer, FrogShape, Pad, Pond } from './FrogArt.jsx'
import './Frog.css'

// Cantidad corta para las etiquetas de los nenúfares: «150 €», «1.200 €», «25k €».
const short = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k\u00a0€` : eur(n))

// Estanque (viewBox W × H): un nenúfar por multiplicador, de ×1 a ×MAX_MULT, en dos filas en zigzag (la de abajo se
// recorre de derecha a izquierda). Nenúfares, rana y efectos se dibujan en coordenadas «lógicas» y se amplían SCALE veces.
const W = 1000
const H = 540
const SCALE = 1.55
const PER_ROW = Math.ceil(MAX_MULT / 2)
const GAP = (W / SCALE - 124) / (PER_ROW - 1)
const HOP_MS = 520
const SINK_MS = 1100
const GUARD_MS = 350 // tras un salto, un clic accidental (doble clic) no cuenta
const AUTO_MS = 450 // pausa entre saltos del auto-cobro
const HISTORY = 40
const pads = Array.from({ length: MAX_MULT }, (_, i) => i + 1)
const padPos = (mult) => {
  const i = mult - 1
  const row = i < PER_ROW ? 0 : 1
  const col = row === 0 ? i : MAX_MULT - 1 - i
  return { x: 62 + col * GAP, y: (row === 0 ? 108 : 250) + Math.sin(mult * 1.1) * 12 }
}
const framePos = (mult) => {
  const { x, y } = padPos(mult)
  return `translate(${x}px, ${y - 22}px)`
}

// La rana la sortea el servidor con el saldo semanal (cuenta en el Score): cada salto lo pide el jugador y aquí solo se anima.
function Frog({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, mult } mientras hay una rana en marcha
  const [at, setAt] = useState(1) // nenúfar donde está dibujada la rana
  const [hop, setHop] = useState(null) // salto en el aire: { from, to, after }
  const [sunk, setSunk] = useState(null) // nenúfar donde cayó al agua
  const [asking, setAsking] = useState(false)
  const [last, setLast] = useState(null) // última partida liquidada
  const [history, setHistory] = useState([]) // últimas partidas: { id, mult (0 = cayó), stake }
  const [auto, setAuto] = useState(0) // auto-cobrar al llegar a ×N (0 = a mano)
  const [burst, setBurst] = useState(null)
  const [cheer, setCheer] = useState(null) // destello de victoria sobre el nenúfar donde se cobró
  const [ready, setReady] = useState(false)
  const frogRef = useRef(null)
  const lock = useRef(false) // una petición a la vez, aunque se pulse dos veces en el mismo instante
  const guardUntil = useRef(0) // hasta cuándo se ignoran los clics manuales tras un salto
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  // Se enseña el saldo que ya vio la pantalla: el premio no aparece hasta que acaba el salto.
  const [balance, setBalance] = useState(serverBalance)
  const animating = hop !== null || sunk !== null
  useEffect(() => {
    if (!animating && !asking) setBalance(serverBalance)
  }, [serverBalance, animating, asking])
  const shownBank = useCountUp(balance)

  // Anota una partida liquidada en el historial (sin repetirla).
  const record = (result) => {
    setLast(result)
    setHistory((list) => {
      if (list.some((h) => h.id === result.round)) return list
      return [{ id: result.round, mult: result.net >= 0 ? result.mult : 0, stake: result.stake }, ...list].slice(0, HISTORY)
    })
  }

  // Pone la pantalla al día con el servidor (al entrar, o si una petición falló a mitad de partida).
  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_frog', a: 'sync' })
    const view = body?.solo
    if (!view) return false
    if (view.bet > 0) {
      setRun({ bet: view.bet, mult: view.mult })
      setAt(view.mult)
      setBet(view.bet)
    } else {
      setRun(null)
      setAt(1)
    }
    if (view.last) record(view.last)
    setBalance(view.balance)
    return true
  })
  // Al entrar: si había una rana en marcha (recarga de la página), se recupera.
  useEffect(() => {
    let alive = true
    resync().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const mult = run?.mult ?? 1
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const broke = !run && !animating && balance < MIN_BET
  const busy = asking || animating || !ready
  const worth = run ? payout(run.bet, mult) : 0
  const nextWorth = run ? payout(run.bet, mult + 1) : 0
  // Hacia dónde miran las pupilas: el siguiente nenúfar.
  const look = run ? { dx: padPos(Math.min(mult + 1, MAX_MULT)).x - padPos(at).x, dy: padPos(Math.min(mult + 1, MAX_MULT)).y - padPos(at).y } : null
  const level = run ? tension(mult) : 0
  const best = history.reduce((top, h) => Math.max(top, h.mult), 0)
  let streak = 0
  for (const h of history) {
    if (h.mult <= 0) break
    streak += 1
  }

  // Salto animado: arco hasta el siguiente nenúfar. Al acabar se ejecuta hop.after.
  const finishHop = useEffectEvent(() => {
    const { to, after } = hop
    setAt(to)
    setHop(null)
    guardUntil.current = Date.now() + GUARD_MS
    after()
  })
  useEffect(() => {
    if (!hop) return
    const el = frogRef.current
    const a = padPos(hop.from)
    const b = padPos(hop.to)
    const frames = [
      { transform: framePos(hop.from) },
      { transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - 70}px)`, offset: 0.5 },
      { transform: framePos(hop.to) },
    ]
    const animation = el.animate(frames, { duration: reduced ? 120 : HOP_MS, easing: 'ease-in-out', fill: 'forwards' })
    animation.onfinish = () => finishHop()
    return () => {
      animation.onfinish = null
      animation.cancel()
    }
  }, [hop, reduced])

  // La rana cae al agua: se hunde un momento y vuelve al primer nenúfar para la partida siguiente.
  useEffect(() => {
    if (sunk === null) return
    const timer = setTimeout(
      () => {
        setSunk(null)
        setAt(1)
      },
      reduced ? 400 : SINK_MS,
    )
    return () => clearTimeout(timer)
  }, [sunk, reduced])

  // Tras cobrar, la rana vuelve de un salto al ×1 mientras se celebra.
  useEffect(() => {
    if (run || animating || at === 1) return
    const timer = setTimeout(() => setHop({ from: at, to: 1, after: () => {} }), reduced ? 200 : 900)
    return () => clearTimeout(timer)
  }, [run, animating, at, reduced])

  // El destello dura ~1,4 s.
  useEffect(() => {
    if (!cheer) return
    const timer = setTimeout(() => setCheer(null), 1400)
    return () => clearTimeout(timer)
  }, [cheer])

  // Una petición al servidor. Devuelve la vista, o null si falló (entonces se vuelve a sincronizar).
  // Si sale bien, el llamador debe llamar a release() cuando ya haya puesto el nuevo estado.
  async function act(message) {
    if (busy || lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_frog', ...message })
    const view = body?.solo ?? null
    if (!view) {
      setAuto(0)
      await resync()
      release()
    }
    return view
  }
  function release() {
    lock.current = false
    setAsking(false)
  }

  async function start() {
    if (busy || run || shownBet < MIN_BET || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    const view = await act({ a: 'start', bet: shownBet })
    if (!view) return
    setBalance(view.balance)
    setRun({ bet: view.bet, mult: 1 })
    setAt(1)
    release()
  }

  async function jump() {
    if (busy || !run) return
    const view = await act({ a: 'jump' })
    if (!view) return
    const from = at
    const to = view.to
    playHop(to)
    if (view.ev === 'jump') {
      setHop({
        from,
        to,
        after: () => {
          playLand(to)
          setRun({ bet: view.bet, mult: view.mult })
        },
      })
    } else {
      // 'fall' (cae al agua) o 'top' (llegó al último nenúfar y cobra solo).
      setHop({
        from,
        to,
        after: () => {
          setRun(null)
          record(view.last)
          setBalance(view.balance)
          if (view.ev === 'fall') {
            setSunk(to)
            playSplash()
            buzz([40, 40, 120])
          } else {
            playLand(to)
            finish(view.last)
          }
        },
      })
    }
    release()
  }

  async function cash() {
    if (busy || !run) return
    const view = await act({ a: 'cash' })
    if (!view) return
    setRun(null)
    record(view.last)
    setBalance(view.balance)
    finish(view.last)
    release()
  }

  function finish(result) {
    if (result.net > 0) {
      playCash(result.mult)
      playWin(result.mult >= 5)
      buzz(result.mult >= 5 ? [60, 40, 60, 40, 160] : [60, 40, 80])
      setCheer({ id: result.round, ...padPos(result.mult) })
      setBurst({ id: result.round, amount: result.net, mult: result.mult, stake: result.stake })
    }
  }

  // Acciones del jugador: ignoran el clic accidental justo tras un salto y paran el auto-cobro.
  const manual = (fn) => () => {
    if (Date.now() < guardUntil.current) return
    setAuto(0)
    fn()
  }
  const onJump = manual(jump)
  const onCash = manual(cash)

  // Auto-cobro: salta uno a uno con las mismas peticiones y cobra al llegar al objetivo. Cualquier fallo lo apaga.
  const step = useEffectEvent(() => (mult >= auto ? cash() : jump()))
  useEffect(() => {
    if (!run || !auto || busy) return
    const timer = setTimeout(step, reduced ? 150 : AUTO_MS)
    return () => clearTimeout(timer)
  }, [run, auto, busy, reduced])

  const nudge = (delta) => setBet(clampBet(shownBet + delta, maxBet))
  const canBet = !run && !animating && !asking && maxBet > MIN_BET

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (event.code === 'Space') {
      if (target?.matches('button:focus-visible, input, select')) return
      event.preventDefault()
      if (run) onJump()
      else start()
    } else if (event.code === 'KeyC' || event.code === 'Enter') {
      if (target?.matches('button, input, select, a')) return
      if (!run) return
      event.preventDefault()
      onCash()
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      if (target?.matches('input, select')) return
      if (!canBet) return
      event.preventDefault()
      nudge((event.code === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1) * STEP)
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  let status = 'Elige tu apuesta con la barra y deja a la rana en el nenúfar.'
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Conectando con el estanque…'
  else if (broke) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
  else if (sunk !== null) status = '¡Splash! La rana cayó al agua. Pierdes la apuesta.'
  else if (asking && run) status = `Saltando a ×${mult + 1}…`
  else if (run)
    status = `Estás en ×${mult}: ¿saltas a ×${mult + 1} o cobras?${auto ? ` Cobro automático en ×${auto}.` : ''}`
  else if (last?.net > 0) status = `¡Cobraste ×${last.mult}! Ganaste ${eur(last.net)}.`
  else if (last?.net === 0) status = '¡Cobraste ×1! Recuperas tu apuesta.'
  else if (last) status = `La rana no llegó a ×${last.mult}. Perdiste ${eur(last.stake)}.`
  else if (balance < MIN_BET) status = 'No te alcanza para la apuesta mínima.'
  const lastWon = !run && last?.net > 0

  return (
    <main className="app frog-app" data-tension={level}>
      <header className="top">
        <h1>Rana</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={lastWon ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>{run ? 'En juego' : 'Apuesta'}</dt>
              <dd>{eur(shownBet)}</dd>
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
                Pon tu apuesta con la barra y deja a la rana en el nenúfar ×1. Después decides en cada salto: <b>saltar</b> al
                siguiente nenúfar (×2, ×3, ×4…) o <b>cobrar</b> lo que llevas.
              </p>
              <p>
                Si la rana acierta, tu premio sube: a ×3 cobras el triple de lo apostado. Si falla, cae al agua y pierdes la
                apuesta. Cuanto más lejos, más difícil es el siguiente salto: el primero sale {chance(1)} de cada 100 veces.
              </p>
              <p>
                Al llegar a ×{MAX_MULT} cobras solo. Con <b>Cobrar en</b> eliges un objetivo antes de lanzar: la rana salta sola y
                cobra al llegar a él (si pulsas algo, vuelves a mandar tú).
              </p>
              <p>
                Teclado: <kbd>Espacio</kbd> lanza y salta, <kbd>C</kbd> o <kbd>Intro</kbd> cobra, <kbd>←</kbd> <kbd>→</kbd> cambian
                la apuesta de 10 en 10 (con <kbd>Mayús</kbd>, de 100 en 100).
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="frog fill">
        <section className="frog__machine" aria-label="Estanque">
          <p className={`status ${lastWon ? 'status--win' : ''}`} aria-live="polite">
            {status}
          </p>
          <div className="frog__pond">
            <Pond
              w={W}
              h={H}
              key={last?.round ?? 'idle'}
              label={`Estanque con ${MAX_MULT} nenúfares; la rana está en el ×${at}`}
              tone={run ? '' : lastWon ? 'won' : last ? 'lost' : ''}
            >
              <g transform={`scale(${SCALE})`}>
                {pads.map((m) => {
                  const { x, y } = padPos(m)
                  const state = sunk === m ? 'is-splash' : m < at ? 'is-past' : m === at ? 'is-here' : m === mult + 1 && run ? 'is-next' : ''
                  return <Pad key={m} m={m} x={x} y={y} state={state} value={m > at ? short(payout(shownBet, m)) : null} />
                })}
                <g ref={frogRef} className="frog__sprite" style={{ transform: framePos(at) }}>
                  <FrogShape
                    sunk={sunk !== null}
                    mood={lastWon && !run ? 'happy' : sunk !== null ? 'scared' : 'idle'}
                    pose={hop !== null ? 'air' : asking ? 'crouch' : 'sit'}
                    look={look}
                    puffed={Boolean(run)}
                  />
                </g>
                {cheer && <Cheer key={cheer.id} x={cheer.x} y={cheer.y} />}
              </g>
            </Pond>
          </div>
        </section>

        <aside className="frog__panel">
          {/* Siempre ocupa su sitio: si el panel crece y encoge en cada salto, el juego se mueve con él. */}
          <div className="frog__group frog__now">
            <h2>Ahora</h2>
            {run ? (
              <>
                <span className="frog__amount" aria-hidden="true">
                  ×{mult} · {eur(worth)}
                </span>
                <p className="frog__odds">
                  Si saltas: <b>{eur(nextWorth)}</b> (×{mult + 1}) con <b>{chance(mult)} %</b> de acertar
                  <span className="frog__odds-bar" style={{ '--p': chance(mult) / 100 }} />
                </p>
              </>
            ) : (
              <div className="frog__idle">
                <p>
                  <small>Premio máximo</small>
                  <b>{eur(payout(shownBet, MAX_MULT))}</b>
                  <span>al llegar a ×{MAX_MULT}</span>
                </p>
                <p>
                  <small>Primer salto</small>
                  <b>{chance(1)} %</b>
                  <span>de acertar</span>
                </p>
              </div>
            )}
          </div>

          <div className="frog__group">
            <h2>Apuesta</h2>
            <label className="frog__slider">
              <span className="frog__amount">{eur(shownBet)}</span>
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
              <span className="frog__scale">
                <span>{eur(MIN_BET)}</span>
                <span>{eur(Math.max(maxBet, MIN_BET))}</span>
              </span>
            </label>
            <div className="frog__quick" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
              <button type="button" disabled={!canBet} onClick={() => setBet(MIN_BET)} aria-label="Apuesta mínima">
                Mín
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet / 2, maxBet))} aria-label="Mitad de la apuesta">
                ½
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet * 2, maxBet))} aria-label="Doblar la apuesta">
                ×2
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(maxBet)} aria-label="Apuesta máxima">
                Máx
              </button>
            </div>
            <p className={`frog__hint ${run ? '' : 'is-off'}`}>La apuesta no se cambia mientras la rana está en marcha.</p>
          </div>

          <div className="frog__group">
            <label className="frog__hint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              Cobrar en
              <select value={auto} disabled={Boolean(run) || animating || asking} onChange={(event) => setAuto(Number(event.target.value))}>
                <option value={0}>A mano</option>
                {pads.slice(1).map((m) => (
                  <option key={m} value={m}>
                    ×{m} ({Math.round((HOUSE / m) * 100)} % de llegar)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="actions frog__actions">
            {!run && !broke && (
              <button type="button" className="primary" disabled={busy || shownBet > balance} onClick={start}>
                {asking ? 'Lanzando…' : 'Lanzar rana'} <kbd>Espacio</kbd>
              </button>
            )}
            {run && (
              <>
                <button type="button" className="primary" disabled={busy} onClick={onJump}>
                  {asking ? 'Saltando…' : `Saltar a ×${mult + 1}`} <kbd>Espacio</kbd>
                </button>
                <button type="button" className={`frog__cash ${run ? 'is-ready' : ''}`} disabled={busy} onClick={onCash}>
                  Cobrar {eur(worth)} <kbd>C</kbd>
                </button>
              </>
            )}
          </div>

          <div className="frog__group">
            <h2>Últimas partidas</h2>
            {history.length === 0 ? (
              <p className="frog__hint">Todavía no has jugado ninguna.</p>
            ) : (
              <>
                <ol className="plinko__history" aria-label="Últimas partidas">
                  {history.slice(0, 10).map((h) => (
                    <li key={h.id} className={`plinko__chip plinko__chip--${toneOf(h.mult)}`}>
                      {h.mult > 0 ? `×${h.mult}` : 'Agua'}
                    </li>
                  ))}
                </ol>
                <p className="frog__hint">
                  Mejor: ×{best || '–'} · Racha: {streak}
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
          caption={`×${burst.mult} con ${eur(burst.stake)}`}
          coins={Math.min(70, 20 + burst.mult * 5)}
          big={burst.mult >= 8}
          who={juegos.me?.name}
        />
      )}
    </main>
  )
}

export default Frog
