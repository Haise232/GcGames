// Bola Canaria (Season 4): una cancha de tierra vista desde arriba con el mingue al fondo. Eliges cómo tirar (arrimar,
// tiro medio o bochazo) y tiras tu bola: cuanto más cerca del mingue se queda, más cobras. Dónde para lo sortea el
// servidor al tirar (reglas en bola.js); aquí la bola rueda (o vuela, en el bochazo) hasta ese punto.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { BANDS, BAND_IDS, COURT, MIN_BET, STEP, STYLES, clampBet, fmtMult, maxBetFor, multOf, payout } from './bola.js'
import { eur } from '../comun/money.js'
import { buzz, playCash, playChip, playClunk, playLand, playLose, playRustle, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import { BetBox, FiestaHeader, History } from '../season4/FiestaParts.jsx'
import './Bola.css'

const ROLL_MS = { arrimar: 1500, medio: 1250, bochazo: 1100 }
const HISTORY = 14
const KEEP = 5 // bolas viejas que se quedan en la cancha
const ICONS = { arrimar: '🤏', medio: '🎯', bochazo: '💥' }
const START = { x: 0, y: COURT.throwY - 0.5 }

function Court({ style, balls, flying, done }) {
  const rings = BAND_IDS.filter((b) => b !== 'fuera')
  return (
    <svg className="bl-court" viewBox="-7.5 -6 15 20.5" aria-label="La cancha">
      <defs>
        <radialGradient id="bl-dirt" cx="0.5" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#d9a86a" />
          <stop offset="1" stopColor="#b07a40" />
        </radialGradient>
        <radialGradient id="bl-ball" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ff9a7a" />
          <stop offset="1" stopColor="#b5261c" />
        </radialGradient>
        <radialGradient id="bl-old" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#8ac4f0" />
          <stop offset="1" stopColor="#1e4a8a" />
        </radialGradient>
      </defs>
      {/* Fuera de la cancha: la grada de piedra y la arena. */}
      <rect x="-7.5" y="-6" width="15" height="20.5" fill="#6a4a2a" />
      <rect x={COURT.left - 0.3} y={COURT.back - 0.3} width={COURT.right - COURT.left + 0.6} height={COURT.throwY - COURT.back + 0.6} rx="0.3" fill="#e8dcc0" />
      <rect x={COURT.left} y={COURT.back} width={COURT.right - COURT.left} height={COURT.throwY - COURT.back} fill="url(#bl-dirt)" />
      {/* Rastrillado. */}
      <g stroke="#a06a34" strokeOpacity="0.35" strokeWidth="0.06">
        {Array.from({ length: 16 }, (_, k) => (
          <path key={k} d={`M${COURT.left} ${COURT.back + 0.6 + k * 1.06} Q 0 ${COURT.back + 0.9 + k * 1.06} ${COURT.right} ${COURT.back + 0.6 + k * 1.06}`} fill="none" />
        ))}
      </g>
      {/* Las franjas de premio alrededor del mingue, con lo que paga cada una con el tiro elegido. */}
      {[...rings].reverse().map((b) => {
        const m = multOf(style, b)
        return (
          <g key={b} className={`bl-ring bl-ring--${b} ${m >= 1 ? 'is-pay' : m > 0 ? 'is-part' : ''}`}>
            <circle r={BANDS[b].to} />
            <text y={-BANDS[b].to + 0.42} textAnchor="middle">
              {m > 0 ? fmtMult(m) : '×0'}
            </text>
          </g>
        )
      })}
      {/* Línea de tiro. */}
      <path d={`M${COURT.left} ${COURT.throwY - 1.6} H${COURT.right}`} stroke="#fff" strokeWidth="0.08" strokeDasharray="0.3 0.25" opacity="0.8" />
      <text x={COURT.right - 0.2} y={COURT.throwY - 1.8} textAnchor="end" className="bl-label">
        línea de tiro
      </text>
      {/* El mingue. */}
      <circle cx="0.06" cy="0.1" r="0.26" fill="#000" opacity="0.25" />
      <circle r="0.26" fill="#fffaf0" stroke="#9a8a6a" strokeWidth="0.05" className="bl-mingue" />
      {/* Bolas viejas. */}
      {balls.map((b) => (
        <g key={b.id} className="bl-old" transform={`translate(${b.at.x} ${b.at.y})`}>
          <circle r="0.45" fill="url(#bl-old)" />
          <text y="-0.6" textAnchor="middle">
            {b.mult > 0 ? fmtMult(b.mult) : '×0'}
          </text>
        </g>
      ))}
      {/* La bola que se tira. */}
      {flying && (
        <g className={`bl-ball bl-ball--${flying.style} ${done ? 'is-done' : ''}`} style={{ transform: `translate(${flying.pos.x}px, ${flying.pos.y}px)`, transitionDuration: `${flying.ms}ms` }}>
          <ellipse className="bl-ball__shadow" cx="0.1" cy="0.2" rx="0.45" ry="0.32" fill="#000" opacity="0.3" />
          <g className="bl-ball__hop" style={{ animationDuration: `${flying.ms}ms` }}>
            <circle r="0.45" fill="url(#bl-ball)" stroke="#6a120c" strokeWidth="0.05" />
            <path d="M-0.3 -0.1 Q0 -0.4 0.3 -0.1" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.06" fill="none" />
          </g>
        </g>
      )}
    </svg>
  )
}

function Bola({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [style, setStyle] = useState('medio')
  const [asking, setAsking] = useState(false)
  const [flying, setFlying] = useState(null) // { id, style, pos, ms }
  const [result, setResult] = useState(null) // la última tirada, cuando ya paró
  const [balls, setBalls] = useState([])
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const [shake, setShake] = useState(false)
  const lock = useRef(false)
  const timers = useRef([])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  const rolling = Boolean(flying && !result)
  useEffect(() => {
    if (!asking && !rolling) setBalance(serverBalance)
  }, [serverBalance, asking, rolling])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const shownBank = useCountUp(balance)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const maxBet = maxBetFor(balance)
  const shownBet = clampBet(bet, maxBet)
  const busy = asking || rolling
  const canBet = !busy && maxBet >= MIN_BET

  async function throwBall() {
    if (lock.current || busy || shownBet > balance) return
    lock.current = true
    setAsking(true)
    setBurst(null)
    playChip()
    const body = await request({ t: 'solo_bola', bet: shownBet, style })
    lock.current = false
    setAsking(false)
    const v = body?.solo
    if (!v) return
    if (body.abuse) v.abuse = body.abuse
    // Las bolas de antes se quedan en la cancha (las últimas KEEP).
    if (result) setBalls((list) => [{ id: result.id, at: result.at, mult: result.mult }, ...list].slice(0, KEEP - 1))
    setResult(null)
    setBalance(v.balance - v.payout)
    const ms = reduced ? 0 : ROLL_MS[v.style]
    playRustle()
    setFlying({ id: v.id, style: v.style, pos: START, ms })
    // Un instante después, a su sitio (así la transición arranca desde la línea de tiro).
    timers.current.push(setTimeout(() => setFlying({ id: v.id, style: v.style, pos: v.at, ms }), 30))
    timers.current.push(setTimeout(() => land(v), ms + 60))
  }

  function land(v) {
    setResult(v)
    setBalance(v.balance)
    setHistory((list) => [{ id: v.id, mult: v.mult }, ...list].slice(0, HISTORY))
    const extra = v.abuse?.extra ?? 0
    if (v.style === 'bochazo') playLand()
    else playClunk()
    if (v.net > 0) {
      playCash(Math.min(10, Math.round(v.mult * 2)))
      playWin(v.mult >= 6)
      buzz([60, 40, 80])
      setBurst({ id: v.id, amount: v.net + extra, mult: v.mult, band: v.band, extra })
    } else if (v.mult === 0) {
      playLose()
      if (v.band === 'fuera') {
        setShake(true)
        timers.current.push(setTimeout(() => setShake(false), 500))
      }
    }
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'Space') return
    if (event.target instanceof Element && event.target.matches('input, select, textarea, button:focus-visible')) return
    event.preventDefault()
    throwBall()
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const extra = result?.abuse?.extra ?? 0
  let status = 'Elige cómo tirar y tu apuesta. Cuanto más cerca del mingue (la bolita blanca), más cobras.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (asking) status = 'Preparando el tiro…'
  else if (rolling) status = flying.style === 'bochazo' ? '¡Bochazo! La bola va por el aire…' : 'La bola rueda hacia el mingue…'
  else if (result?.net > 0) {
    status = `${BANDS[result.band].name} ${fmtMult(result.mult)}: ganas ${eur(result.net + extra)}.`
    tone = 'good'
  } else if (result && result.mult > 0) status = `${BANDS[result.band].name}: recuperas ${eur(result.payout)} de ${eur(result.bet)}.`
  else if (result && extra > 0) status = `${BANDS[result.band].name}. Pero el Admin Abuse te devuelve ${eur(extra)}.`
  else if (result) {
    status = result.band === 'fuera' ? '¡Se fue fuera de la cancha! Pierdes la apuesta.' : 'Se quedó lejos del mingue. Pierdes la apuesta.'
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const bands = STYLES[style].bands
  const help = (
    <>
      <p>
        La bola canaria se juega en una cancha de tierra: se tira una bolita blanca, el <b>mingue</b>, y gana quien deja su bola más cerca. Aquí tiras tú
        contra la cancha: cuanto más cerca se queda tu bola, más cobras.
      </p>
      <ul>
        {Object.entries(STYLES).map(([id, s]) => (
          <li key={id}>
            <b>{s.name}:</b> {s.blurb} Una arrimada paga {fmtMult(s.bands.arrime[1])}.
          </li>
        ))}
      </ul>
      <p>
        Los círculos de la cancha dicen lo que paga cada distancia con el tiro elegido. Dónde para la bola lo sortea el servidor al tirar: con cualquier
        tiro, de media se recupera el 96 %. Con el Admin Abuse, la banca multiplica lo que ganes o te devuelve lo que pierdas, y tienes más suerte.
      </p>
    </>
  )

  return (
    <main className="app fi-app bl-app">
      <FiestaHeader title="Bola Canaria" balance={shownBank} betLabel="Apuesta" bet={shownBet} onExit={onExit} help={help} helpTitle="Cómo se juega a la Bola Canaria" />

      <div className="fi fill">
        <section className={`fi-stage bl-stage ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''}`} aria-label="La cancha">
          <div className="fi-top">
            <span className="fi-chip">
              <small>Tiro</small>
              <b>
                {ICONS[style]} {STYLES[style].name}
              </b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Arrimada</small>
              <b>{fmtMult(bands.arrime[1])}</b>
            </span>
          </div>
          <div className="bl-court-wrap">
            <Court style={result && !busy ? result.style : flying ? flying.style : style} balls={balls} flying={flying} done={Boolean(result)} />
            {result && !busy && (
              <span className={`bl-verdict ${result.net > 0 ? 'is-good' : result.mult > 0 ? '' : 'is-bad'}`} key={result.id}>
                {BANDS[result.band].name}
                <b>{result.mult > 0 ? fmtMult(result.mult) : '×0'}</b>
              </span>
            )}
          </div>
          <p className={`fi-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>Si la arrimas</small>
            <b>{eur(payout(shownBet, bands.arrime[1]))}</b>
            <span className="fi-prize__tag">
              {Math.round(bands.arrime[0] / 10000)} % de arrimada · {fmtMult(bands.arrime[1])}
            </span>
          </div>

          <div className="fi-group">
            <h2>Cómo tiras</h2>
            <div className="fi-options" style={{ '--cols': 1 }} role="radiogroup" aria-label="Tiro">
              {Object.entries(STYLES).map(([id, s]) => (
                <button key={id} type="button" role="radio" aria-checked={style === id} className="fi-option" disabled={busy} onClick={() => setStyle(id)}>
                  <span className="fi-option__ico" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <b>{s.name}</b>
                  <small>{s.blurb}</small>
                </button>
              ))}
            </div>
          </div>

          <BetBox bet={shownBet} setBet={setBet} min={MIN_BET} max={maxBet} step={STEP} disabled={!canBet} clamp={clampBet} />

          <button type="button" className="fi-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={throwBall}>
            {asking ? 'Preparando…' : rolling ? 'Rodando…' : `Tirar · ${eur(shownBet)}`}
            <kbd>Espacio</kbd>
          </button>

          <div className="fi-group">
            <h2>Qué paga cada distancia</h2>
            <ol className="fi-table">
              {BAND_IDS.map((b) => (
                <li key={b} className={result && !busy && result.band === b ? 'is-on' : undefined}>
                  <span>{Math.round(bands[b][0] / 10000)} %</span>
                  <span>{BANDS[b].name}</span>
                  <b>{bands[b][1] > 0 ? `${fmtMult(bands[b][1])} · ${eur(payout(shownBet, bands[b][1]))}` : '×0'}</b>
                </li>
              ))}
            </ol>
          </div>

          <History list={history} label="Tus últimos tiros" />
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`${BANDS[burst.band].name} · ${fmtMult(burst.mult)}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 4)}
          big={burst.mult >= 6}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Bola
