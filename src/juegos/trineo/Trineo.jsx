// El Trineo de Papá Noel (Season 5): es Nochebuena y repartes regalos. En cada parada eliges edificio: la casita (casi
// siempre sale bien, sube poco), el bloque o el rascacielos (te pillan la mitad de las veces, pero el premio casi se
// dobla). Si entregas el regalo, el premio crece; si te pillan, pierdes la apuesta. Cobras cuando quieras. Cada parada
// la sortea el servidor al bajar (reglas en trineo.js); aquí el trineo vuela hasta la chimenea.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { HOUSES, HOUSE_IDS, MAX_MULT, MIN_BET, STEP, STOPS, clampBet, fmtMult, maxBetFor, multOf, payout } from './trineo.js'
import { eur } from '../comun/money.js'
import { buzz, playCash, playChip, playJingle, playLose, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Avatar from '../comun/Avatar.jsx'
import { BetBox, FiestaHeader, History } from '../season4/FiestaParts.jsx'
import './Trineo.css'

const HISTORY = 14
const FLY_MS = 950
const ICON = { casa: '🏠', bloque: '🏢', torre: '🏙️' }
const KEYS = { casa: '1', bloque: '2', torre: '3' }

// Ventanas de un edificio: columnas × filas, algunas encendidas (siempre las mismas).
function Windows({ x, y, cols, rows, w, h, gx, gy }) {
  const out = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const on = (r * 7 + c * 3) % 5 < 2
      out.push(<rect key={`${r}-${c}`} className={on ? 'tr-win is-on' : 'tr-win'} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx="1.5" />)
    }
  return out
}

function Building({ id }) {
  if (id === 'casa')
    return (
      <svg className="tr-bld" viewBox="0 0 120 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <rect x="74" y="34" width="12" height="26" fill="#5a2a22" />
        <rect className="tr-chimney" x="71" y="30" width="18" height="7" fill="#f4f9ff" />
        <rect x="18" y="62" width="84" height="58" fill="#7a3a30" />
        <path d="M8 66 L60 26 L112 66 Z" fill="#3a1a1a" />
        <path d="M6 66 L60 23 L114 66 L106 67 L60 33 L14 67 Z" fill="#f4f9ff" />
        <rect className="tr-win is-on" x="30" y="76" width="20" height="18" rx="2" />
        <rect className="tr-win" x="72" y="76" width="20" height="18" rx="2" />
        <rect x="50" y="94" width="20" height="26" rx="9" fill="#2a120e" />
        <circle cx="60" cy="88" r="5" fill="#2f7a4d" stroke="#d42a35" strokeWidth="2" />
      </svg>
    )
  if (id === 'bloque')
    return (
      <svg className="tr-bld" viewBox="0 0 120 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <rect x="82" y="8" width="12" height="20" fill="#3a3448" />
        <rect className="tr-chimney" x="79" y="4" width="18" height="7" fill="#f4f9ff" />
        <rect x="14" y="26" width="92" height="144" fill="#4a4258" />
        <rect x="10" y="22" width="100" height="8" rx="3" fill="#f4f9ff" />
        <Windows x={24} y={40} cols={4} rows={6} w={13} h={13} gx={7} gy={8} />
        <rect x="50" y="146" width="20" height="24" fill="#1e1a28" />
      </svg>
    )
  return (
    <svg className="tr-bld" viewBox="0 0 120 240" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <rect x="57" y="0" width="6" height="22" fill="#2a3450" />
      <circle className="tr-beacon" cx="60" cy="2" r="4" fill="#ff4b55" />
      <rect x="68" y="16" width="10" height="18" fill="#2a3450" />
      <rect className="tr-chimney" x="65" y="13" width="16" height="6" fill="#f4f9ff" />
      <rect x="28" y="30" width="64" height="210" fill="#26304a" />
      <rect x="24" y="26" width="72" height="7" rx="3" fill="#f4f9ff" />
      <Windows x={36} y={42} cols={4} rows={13} w={8} h={9} gx={6} gy={5} />
      <rect x="50" y="220" width="20" height="20" fill="#111828" />
    </svg>
  )
}

// El trineo con dos renos (el de delante, con la nariz roja).
function Sleigh() {
  return (
    <svg className="tr-sleigh__svg" viewBox="0 0 220 90" aria-hidden="true">
      <g className="tr-deer">
        {[0, 52].map((x, i) => (
          <g key={x} transform={`translate(${x} 0)`}>
            <path d="M8 46 Q4 30 18 28 L40 30 Q50 30 50 40 L48 52 L44 52 L42 44 L22 44 L18 54 L14 54 Z" fill="#8a5a32" />
            <path d="M44 32 L52 18 L60 20 L56 32 Z" fill="#8a5a32" />
            <path d="M54 18 L50 6 M54 18 L58 6 M50 10 L46 6 M58 10 L62 6" stroke="#5a3418" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="61" cy="22" r={i ? 4 : 2.6} fill={i ? '#ff3b48' : '#2a1408'} className={i ? 'tr-nose' : undefined} />
          </g>
        ))}
        <path d="M60 40 Q90 36 120 46" stroke="#f8c54e" strokeWidth="2" fill="none" />
      </g>
      <g transform="translate(118 18)">
        <path d="M6 22 L84 22 Q92 22 90 32 L86 48 L14 48 Q4 48 6 38 Z" fill="#d42a35" stroke="#7a0f18" strokeWidth="2.5" />
        <path d="M2 58 L92 58 Q100 58 100 50" stroke="#f8c54e" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M18 48 L16 58 M74 48 L76 58" stroke="#f8c54e" strokeWidth="3" />
        <path d="M50 22 Q46 0 66 2 Q86 4 82 22 Z" fill="#8a6a3a" />
        <circle cx="34" cy="14" r="9" fill="#f2c9a0" />
        <path d="M24 12 Q30 -4 44 6 L48 4" fill="#d42a35" />
        <circle cx="48" cy="4" r="3" fill="#fff" />
        <path d="M26 16 Q34 30 42 16 Z" fill="#fff" />
      </g>
    </svg>
  )
}

function Trineo({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [run, setRun] = useState(null) // { bet, steps, route, prod, mult }
  const [asking, setAsking] = useState(false)
  const [ready, setReady] = useState(false)
  const [last, setLast] = useState(null)
  const [best, setBest] = useState(null)
  const [ranking, setRanking] = useState([])
  const [target, setTarget] = useState(null) // edificio al que vuela el trineo
  const [outcome, setOutcome] = useState(null) // { house, ok } de la última parada
  const [shake, setShake] = useState(false)
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const [street, setStreet] = useState(0)
  const lock = useRef(false)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking) setBalance(serverBalance)
  }, [serverBalance, asking])
  const shownBank = useCountUp(balance)

  const apply = (v) => {
    setRun(v.bet > 0 ? { bet: v.bet, steps: v.steps, route: v.route, prod: v.prod, mult: v.mult } : null)
    if (v.best !== undefined) setBest(v.best)
    if (v.ranking) setRanking(v.ranking)
  }
  const record = (l) => setHistory((list) => (list.some((h) => h.id === l.round) ? list : [{ id: l.round, mult: l.mult }, ...list].slice(0, HISTORY)))

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_trineo', a: 'sync' })
    const v = body?.solo
    if (!v) return
    apply(v)
    if (v.last) setLast(v.last)
    setBalance(v.balance)
  })
  useEffect(() => {
    let alive = true
    resync().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  async function act(message, wait = 0) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const [body] = await Promise.all([request({ t: 'solo_trineo', ...message }), new Promise((ok) => setTimeout(ok, wait))])
    lock.current = false
    setAsking(false)
    const v = body?.solo ?? null
    if (!v) await resync()
    else if (body.abuse) v.abuse = body.abuse
    return v
  }

  const busy = asking || !ready
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const canBet = !run && !busy && maxBet >= MIN_BET
  const worth = run && run.steps > 0 ? payout(run.bet, run.mult) : 0
  const liveWorth = useCountUp(worth, 400)

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setBank(null)
    setLast(null)
    setOutcome(null)
    const v = await act({ a: 'start', bet: shownBet })
    if (!v) return
    playJingle(8)
    setStreet((s) => s + 1)
    setBalance(v.balance)
    apply(v)
  }

  async function stop(house) {
    if (busy || !run) return
    setOutcome(null)
    setTarget(house)
    playJingle(5)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const v = await act({ a: 'stop', house }, reduced ? 0 : FLY_MS)
    setTarget(null)
    if (!v) return
    if (v.ev === 'caught') {
      setOutcome({ house, ok: false })
      setTimeout(playLose, 80)
      buzz([40, 40, 160])
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
      setLast(v.last)
      record(v.last)
      apply(v)
      setBalance(v.balance)
      return
    }
    setOutcome({ house, ok: true })
    playJingle(3)
    apply(v)
    // Calle nueva para la siguiente parada (cuando se ha visto el regalo).
    setTimeout(
      () => {
        setStreet((s) => s + 1)
        setOutcome(null)
      },
      reduced ? 0 : 900,
    )
    if (v.ev === 'end') finish(v)
  }

  async function cash() {
    if (busy || !run || run.steps < 1) return
    const v = await act({ a: 'cash' })
    if (!v) return
    finish(v)
  }

  function finish(v) {
    apply(v)
    setLast(v.last)
    record(v.last)
    setBalance(v.balance)
    const extra = v.abuse?.extra ?? 0
    if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
    if (v.last.net <= 0) return
    playCash(Math.min(10, Math.round(v.last.mult)))
    playWin(v.last.mult >= 10)
    buzz([60, 40, 80])
    setBurst({ id: v.last.round, amount: v.last.net + extra, mult: v.last.mult, steps: v.last.steps, extra })
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    const house = HOUSE_IDS.find((h) => event.key === KEYS[h])
    if (run && house) {
      event.preventDefault()
      stop(house)
    } else if (run && event.code === 'KeyC') cash()
    else if (event.code === 'Space' && !run && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      start()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const prod = run?.prod ?? 1
  const option = (h) => (run ? { p: HOUSES[h].p, mult: multOf(prod / HOUSES[h].p, run.steps + 1) } : { p: HOUSES[h].p, mult: multOf(1 / HOUSES[h].p, 1) })
  const route = run ? run.route : (last?.route ?? [])
  const steps = run ? run.steps : (last?.steps ?? 0)

  let status = 'Elige la apuesta y sal a repartir. En cada parada, tú decides dónde bajas.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Cargando el saco…'
  else if (target) status = `Volando hacia ${target === 'casa' ? 'la casita' : target === 'bloque' ? 'el bloque' : 'el rascacielos'}…`
  else if (run && run.steps === 0) status = '¡Ho, ho, ho! Primera parada: ¿dónde bajas?'
  else if (run) status = `¡Regalo entregado! Llevas ${eur(worth)} (${fmtMult(run.mult)}). ¿Otra casa o vuelves al Polo Norte?`
  else if (last?.net > 0) {
    status = `Noche completada con ${last.steps} regalo${last.steps === 1 ? '' : 's'}: ${fmtMult(last.mult)}, ganas ${eur(last.net + (bank?.round === last.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (last?.caught && bank?.round === last.round && bank.extra > 0) status = `Te pillaron, pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last?.caught) {
    status = `${HOUSES[last.caught].fail} Pierdes ${eur(last.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const help = (
    <>
      <p>
        Es Nochebuena y repartes regalos. En cada parada eliges dónde bajas: la <b>casita</b> ({Math.round(HOUSES.casa.p * 100)} % de que salga bien), el{' '}
        <b>bloque</b> ({Math.round(HOUSES.bloque.p * 100)} %) o el <b>rascacielos</b> ({Math.round(HOUSES.torre.p * 100)} %). Teclas <kbd>1</kbd>,{' '}
        <kbd>2</kbd> y <kbd>3</kbd>.
      </p>
      <p>
        Si entregas el regalo, el premio se multiplica: cuanto más difícil la parada, más sube. Si te pillan, pierdes la apuesta. Vuelves al Polo Norte
        (cobras) cuando quieras con <b>Cobrar</b> (<kbd>C</kbd>); a las {STOPS} paradas o al llegar a {fmtMult(MAX_MULT)} se acaba la noche y cobras solo.
      </p>
      <p>Cada parada la sortea el servidor al bajar: cobres cuando cobres, de media se recupera el 96 %.</p>
    </>
  )

  return (
    <main className="app fi-app tr-app">
      <FiestaHeader title="El Trineo de Papá Noel" balance={shownBank} betLabel={run ? 'En juego' : 'Apuesta'} bet={shownBet} onExit={onExit} help={help} helpTitle="Cómo se juega al Trineo" />

      <div className="fi fill">
        <section className={`fi-stage tr-stage ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''}`} aria-label="La noche de reparto">
          <div className="tr-sky" aria-hidden="true">
            <span className="tr-moon" />
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 41.3) % 100}%`, top: `${(i * 23.7) % 46}%`, animationDelay: `${(i % 6) * -0.5}s` }} />
            ))}
          </div>
          <div className="fi-top">
            <span className="fi-chip">
              <small>Regalos</small>
              <b>
                {steps}/{STOPS}
              </b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Premio</small>
              <b>{run && run.steps ? fmtMult(run.mult) : '—'}</b>
            </span>
          </div>

          <div className="tr-town">
            <div className={`tr-sleigh ${target ? `is-to-${target}` : run ? 'is-wait' : 'is-idle'} ${outcome?.ok === false ? 'is-caught' : ''}`}>
              <Sleigh />
            </div>
            <div className="tr-street" key={street}>
              {HOUSE_IDS.map((h) => {
                const o = option(h)
                const state = outcome?.house === h ? (outcome.ok ? 'is-ok' : 'is-caught') : ''
                return (
                  <button key={h} type="button" className={`tr-house tr-house--${h} ${state} ${target === h ? 'is-target' : ''}`} disabled={busy || !run} onClick={() => stop(h)}>
                    <Building id={h} />
                    {outcome?.house === h && (
                      <span className="tr-house__pop" aria-hidden="true">
                        {outcome.ok ? '🎁' : '🚨'}
                      </span>
                    )}
                    <span className="tr-house__label">
                      <b>
                        <kbd>{KEYS[h]}</kbd> {HOUSES[h].name}
                      </b>
                      <small>
                        {Math.round(o.p * 100)} % · {fmtMult(o.mult)}
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>
            <span className="tr-snow" aria-hidden="true" />
          </div>

          <ol className="tr-route" aria-label="Paradas de esta noche">
            {route.slice(-12).map(([h, ok], k) => (
              <li key={k} className={ok ? 'is-ok' : 'is-caught'} title={`${HOUSES[h].name}: ${ok ? 'entregado' : 'te pillaron'}`}>
                {ICON[h]}
                <i>{ok ? '✓' : '✕'}</i>
              </li>
            ))}
          </ol>

          <p className={`fi-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>{run && run.steps ? 'Si vuelves ahora' : 'Reparte y el premio crece'}</small>
            <b>{eur(run && run.steps ? liveWorth : 0)}</b>
            <span className="fi-prize__tag">{run && run.steps ? fmtMult(run.mult) : `Hasta ${fmtMult(MAX_MULT)}`}</span>
          </div>

          {!run && <BetBox bet={shownBet} setBet={setBet} min={MIN_BET} max={maxBet} step={STEP} disabled={!canBet} clamp={clampBet} />}

          {!run ? (
            <button type="button" className="fi-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={start}>
              {asking ? 'Enganchando los renos…' : '¡A repartir!'}
              <kbd>Espacio</kbd>
            </button>
          ) : (
            <button type="button" className="fi-go fi-go--cash" disabled={busy || run.steps < 1} onClick={cash}>
              {run.steps < 1 ? (
                'Entrega al menos un regalo'
              ) : (
                <span className="fi-go__two">
                  <small>Volver al Polo Norte</small>
                  <b>{eur(liveWorth)}</b>
                </span>
              )}
              <kbd>C</kbd>
            </button>
          )}

          <div className="fi-group">
            <h2>Las paradas</h2>
            <ol className="fi-table">
              {HOUSE_IDS.map((h) => (
                <li key={h}>
                  <span>{ICON[h]}</span>
                  <span>{HOUSES[h].name}</span>
                  <b>
                    {Math.round(HOUSES[h].p * 100)} % · ×{(1 / HOUSES[h].p).toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                  </b>
                </li>
              ))}
            </ol>
            <p className="fi-hint">El premio de cada parada se multiplica; la casa se queda el 4 % al cobrar.</p>
          </div>

          {(ranking.length > 0 || best) && (
            <div className="fi-group">
              <h2>Récord del día</h2>
              <ol className="tr-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : undefined}>
                    <span>{i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={24} />
                    <span>{r.name}</span>
                    <b>{fmtMult(r.mult)}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <History list={history} label="Tus últimas noches" />
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`${fmtMult(burst.mult)} con ${burst.steps} regalo${burst.steps === 1 ? '' : 's'}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Trineo
