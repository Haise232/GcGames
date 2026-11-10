// Lotería de Navidad (Season 5): compras un décimo con tu número y se canta el sorteo en el escenario, con los dos
// bombos: primero los quintos, luego los cuartos, el tercero, el segundo y, al final, el Gordo. Al acabar se mira la
// terminación y el reintegro. El premio y el sorteo los decide el servidor al comprar (reglas en loteria.js); aquí solo
// se cantan.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { CUARTOS, MIN_BET, NUMBERS, PRIZES, PRIZE_IDS, QUINTOS, STEP, cantos, clampBet, fmtMult, fmtNumber, maxBetFor, validNumber } from './loteria.js'
import { eur } from '../comun/money.js'
import { buzz, playBall, playCash, playChip, playHeartbeat, playJingle, playLose, playOvation, playReelTick, playReveal, playStamp, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import { BetBox, FiestaHeader, History } from '../season4/FiestaParts.jsx'
import { Bombos, Decimo, Ninos, enLetras } from './LoteriaArt.jsx'
import './Loteria.css'

const HISTORY = 14
const NUMBER_KEY = 'juegos-loteria-numero' // tu número de siempre
// Lo que tarda en cantarse cada premio (los quintos van rápido; el Gordo, con calma).
// Antes del Gordo hay un silencio largo con latidos: es el momento de más tensión.
const CANTO_MS = { quinto: 300, cuarto: 560, tercero: 950, segundo: 1100, gordo: 2900 }
const GORDO_DIGIT_MS = 300 // el Gordo se canta cifra a cifra
// Consuelos para cuando no toca; se elige uno según el número de compra para que no cambie al repintar.
const CONSUELOS = ['Lo importante es la salud… y el año que viene, más.', 'Dicen que la suerte llega cuando uno deja de esperarla.', 'Los niños han cantado, pero hoy no cantaban el tuyo.', 'Se queda para los calendarios: otro décimo, otra ilusión.', 'Por lo menos queda el turrón, que ese nunca falla.']
// Cuántas cifras seguidas, desde la izquierda, comparte tu número con el Gordo (para el «casi»).
const cifrasComunes = (a, b) => {
  const x = fmtNumber(a)
  const y = fmtNumber(b)
  let i = 0
  while (i < 5 && x[i] === y[i]) i++
  return i
}
const LUCKY = [22122, 0, 7, 13, 25012, 31122, 6011]

function savedNumber() {
  try {
    const n = Number(localStorage.getItem(NUMBER_KEY))
    if (localStorage.getItem(NUMBER_KEY) !== null && validNumber(n)) return n
  } catch {
    // sin almacenamiento: uno al azar
  }
  return Math.floor(Math.random() * NUMBERS)
}

const shortName = { gordo: 'Gordo', segundo: '2.º', tercero: '3.º', cuarto: '4.º', quinto: '5.º' }

function Loteria({ onExit, juegos }) {
  const [bet, setBet] = useState(20)
  const [number, setNumber] = useState(savedNumber)
  const [typed, setTyped] = useState(() => fmtNumber(number))
  const [asking, setAsking] = useState(false)
  const [draw, setDraw] = useState(null) // la respuesta del servidor que se está cantando (o la última)
  const [sung, setSung] = useState(0) // cuántos premios se han cantado ya
  const [finished, setFinished] = useState(true) // el canto (con la cifra a cifra del Gordo) ya acabó y se enseña el resultado
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const timers = useRef([])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  const singing = draw !== null && !finished
  useEffect(() => {
    if (!asking && !singing) setBalance(serverBalance)
  }, [serverBalance, asking, singing])
  const shownBank = useCountUp(balance)
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const busy = asking || singing
  const maxBet = maxBetFor(balance)
  const shownBet = clampBet(bet, maxBet)
  const list = draw ? cantos(draw.draw) : []
  const done = draw !== null && !singing

  const choose = (n) => {
    setNumber(n)
    setTyped(fmtNumber(n))
    try {
      localStorage.setItem(NUMBER_KEY, String(n))
    } catch {
      // sin almacenamiento: no se recuerda
    }
  }

  function finish(v) {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setSung(cantos(v.draw).length)
    setFinished(true)
    setBalance(v.balance)
    setHistory((h) => [{ id: v.id, mult: v.mult }, ...h].slice(0, HISTORY))
    const extra = v.abuse?.extra ?? 0
    if (v.net > 0) {
      playCash(Math.min(10, Math.round(v.mult)))
      playWin(v.mult >= 20)
      if (v.mult >= 50) playOvation()
      buzz([60, 40, 80])
      setBurst({ id: v.id, amount: v.net + extra, mult: v.mult, prize: v.prize, extra })
    } else if (v.prize === 'reintegro') playChip()
    else if (extra > 0) playChip()
    else {
      playLose()
      playStamp()
    }
  }

  async function buy() {
    if (busy || shownBet > balance || balance < MIN_BET) return
    let n = number
    const fromTyped = Number(typed)
    if (typed.trim() !== '' && validNumber(fromTyped)) n = fromTyped
    choose(n)
    playChip()
    setBurst(null)
    setAsking(true)
    const body = await request({ t: 'solo_loteria', bet: shownBet, number: n })
    setAsking(false)
    const v = body?.solo
    if (!v) return
    if (body.abuse) v.abuse = body.abuse
    setBalance(balance - shownBet)
    setDraw(v)
    setSung(0)
    setFinished(false)
    playJingle(4)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return finish(v)
    const steps = cantos(v.draw)
    let at = 400
    steps.forEach((c, i) => {
      at += CANTO_MS[c.prize]
      const t = (fn, ms) => timers.current.push(setTimeout(fn, ms))
      if (c.prize === 'gordo') {
        // Suspense: tres latidos mientras se hace el silencio, y la cifra a cifra con su tictac.
        ;[1500, 900, 350].forEach((back) => t(playHeartbeat, at - back))
        for (let k = 0; k < 5; k++) t(playReelTick, at + k * GORDO_DIGIT_MS + 60)
      }
      t(() => {
        setSung(i + 1)
        playBall()
        if (c.prize === 'gordo') playReveal()
        if (c.number === v.number) playJingle(8)
        if (i === steps.length - 1) t(() => finish(v), 5 * GORDO_DIGIT_MS + 500)
      }, at)
    })
  }

  const skip = () => draw && singing && finish(draw)

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    if (event.code === 'Space' && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      if (singing) skip()
      else buy()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  // Lo cantado hasta ahora, por premio.
  const shown = list.slice(0, sung)
  const of = (prize) => shown.filter((c) => c.prize === prize).map((c) => c.number)
  const current = shown.at(-1) ?? null
  const mine = draw?.number
  const gordoOut = done && draw
  const hit = current && current.number === mine // acaba de salir tu número
  const suspense = singing && sung === list.length - 1 // solo queda el Gordo
  const lost = done && !draw.prize && !(draw.abuse?.extra > 0)
  const comunes = done ? cifrasComunes(draw.number, draw.draw.gordo) : 0

  let status = 'Elige tu número, el precio del décimo, y que canten los niños.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (asking) status = 'Comprando el décimo…'
  else if (singing) status = current ? `♪ ${fmtNumber(current.number)}… ¡${current.prize === 'gordo' ? 'el Gordo' : PRIZES[current.prize].name.toLowerCase()}! ♪` : '♪ Empieza el sorteo… ♪'
  else if (done && draw.prize && draw.net > 0) {
    status = `¡Te ha tocado ${draw.prize === 'pedrea' ? 'la pedrea' : draw.prize === 'terminacion' ? 'la terminación' : draw.prize === 'gordo' ? 'el Gordo' : `el ${PRIZES[draw.prize].name.toLowerCase()}`}! ${fmtMult(draw.mult)}: ganas ${eur(draw.net + (draw.abuse?.extra ?? 0))}.`
    tone = 'good'
  } else if (done && draw.prize === 'reintegro') status = `Reintegro: el Gordo acaba en ${draw.draw.gordo % 10}, como tu número. Recuperas lo jugado.`
  else if (done && draw.abuse?.extra > 0) status = `No ha tocado, pero el Admin Abuse te devuelve ${eur(draw.abuse.extra)}.`
  else if (done) {
    status = 'No ha tocado esta vez. El año que viene, más.'
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const help = (
    <>
      <p>
        Eliges un número de <b>00000 a 99999</b> (o uno al azar) y el precio del décimo. Al comprarlo se canta el sorteo: {QUINTOS} quintos, {CUARTOS} cuartos,
        el tercero, el segundo y el Gordo. Si tu número sale, cobras ese premio.
      </p>
      <p>
        Además: la <b>pedrea</b> (si te toca, se dice al final), la <b>terminación</b> (tus dos últimas cifras son las del Gordo) y el <b>reintegro</b> (tu
        última cifra es la del Gordo: recuperas lo jugado). Te llevas solo el mejor premio que te toque.
      </p>
      <p>El premio lo sortea el servidor al comprar y el número que elijas no cambia nada: de media se recupera el 96 % de lo jugado.</p>
    </>
  )

  const row = (prize, nums, count) => (
    <li className={`lt-board__row lt-board__row--${prize}`}>
      <span>{shortName[prize]}</span>
      <span className="lt-board__nums">
        {Array.from({ length: count }, (_, i) => {
          const n = nums[i]
          return (
            <b key={i} className={n === undefined ? 'is-empty' : n === mine ? 'is-mine' : undefined}>
              {n === undefined ? '·····' : fmtNumber(n)}
            </b>
          )
        })}
      </span>
      <em>{fmtMult(PRIZES[prize].mult)}</em>
    </li>
  )

  return (
    <main className="app fi-app lt-app">
      <FiestaHeader title="Lotería de Navidad" balance={shownBank} betLabel="Décimo" bet={shownBet} onExit={onExit} help={help} helpTitle="Cómo se juega a la Lotería de Navidad" />

      <div className="fi fill">
        <section className={`fi-stage lt-stage ${tone === 'good' ? 'is-win' : ''} ${suspense ? 'is-suspense' : ''} ${lost ? 'is-lost' : ''}`} aria-label="El sorteo">
          <span className="lt-curtain lt-curtain--l" aria-hidden="true" />
          <span className="lt-curtain lt-curtain--r" aria-hidden="true" />
          <span className="lt-valance" aria-hidden="true" />
          <span className="lt-beams" aria-hidden="true" />
          <span className="lt-floor" aria-hidden="true" />
          {hit && <span className="lt-flash" key={`f${sung}`} aria-hidden="true" />}
          <div className="fi-top">
            <span className="fi-chip">
              <small>Tu número</small>
              <b>{fmtNumber(draw && (busy || done) ? draw.number : number)}</b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Premio</small>
              <b>{done && draw.prize ? fmtMult(draw.mult) : '—'}</b>
            </span>
          </div>

          <div className={`lt-show ${suspense ? 'is-suspense' : ''}`}>
            <Bombos spinning={busy} fast={suspense} />
            <div className="lt-canto" aria-live="polite">
              {suspense && (
                <div className="lt-suspense" key="suspense">
                  <span>Y ahora…</span>
                  <b>el Gordo</b>
                </div>
              )}
              {done ? (
                <div className={`lt-result ${draw.prize ? 'is-win' : 'is-lose'}`} key="result">
                  {draw.prize ? (
                    <>
                      <span className="lt-result__kicker">{draw.prize === 'reintegro' ? 'Reintegro' : '¡Te ha tocado!'}</span>
                      <b className="lt-result__title">{PRIZES[draw.prize].name}</b>
                      <span className="lt-result__sub">
                        {draw.prize === 'reintegro' ? 'Recuperas lo jugado' : `${fmtMult(draw.mult)} · ${eur(draw.payout)}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="lt-result__kicker">Esta vez no</span>
                      <b className="lt-result__title">No ha tocado</b>
                      <span className="lt-result__sub">{CONSUELOS[draw.id % CONSUELOS.length]}</span>
                      <span className="lt-result__near">
                        El Gordo fue <i>{fmtNumber(draw.draw.gordo)}</i>
                        {comunes >= 2 && ` · compartes las ${comunes} primeras cifras`}
                      </span>
                    </>
                  )}
                </div>
              ) : current ? (
                <div className={`lt-cantado ${hit ? 'is-hit' : ''} ${current.prize === 'gordo' ? 'is-gordo' : ''}`} key={`c${sung}`}>
                  <span className={`lt-ball ${hit ? 'is-mine' : ''}`}>
                    {current.prize === 'gordo'
                      ? fmtNumber(current.number)
                          .split('')
                          .map((d, i) => (
                            <i key={i} style={{ animationDelay: `${i * GORDO_DIGIT_MS}ms` }}>
                              {d}
                            </i>
                          ))
                      : fmtNumber(current.number)}
                  </span>
                  <span className={`lt-ball lt-ball--prize lt-ball--${current.prize}`}>{PRIZES[current.prize].name}</span>
                  <span className="lt-letras">{enLetras(current.number)}</span>
                  {hit && <span className="lt-hit">¡Es tu número!</span>}
                </div>
              ) : (
                <span className="lt-canto__wait">{busy ? '♪ ♪ ♪' : 'Los bombos esperan'}</span>
              )}
            </div>
            <Ninos singing={singing} />
          </div>

          <div className="lt-mid">
            <Decimo number={draw && (busy || done) ? draw.number : number} bet={draw && (busy || done) ? draw.bet : shownBet} prize={draw?.prize} done={done} hit={hit} />
            <ol className="lt-board" aria-label="Lista de premios">
              {row('gordo', of('gordo'), 1)}
              {row('segundo', of('segundo'), 1)}
              {row('tercero', of('tercero'), 1)}
              {row('cuarto', of('cuarto'), CUARTOS)}
              {row('quinto', of('quinto'), QUINTOS)}
              <li className="lt-board__row lt-board__row--extra">
                <span>Fin</span>
                <span className="lt-board__nums">
                  <b className={gordoOut && draw.prize === 'terminacion' ? 'is-mine' : gordoOut ? undefined : 'is-empty'}>
                    {gordoOut ? `…${String(draw.draw.gordo % 100).padStart(2, '0')}` : '…··'}
                  </b>
                  <b className={gordoOut && draw.prize === 'reintegro' ? 'is-mine' : gordoOut ? undefined : 'is-empty'}>
                    {gordoOut ? `R ${draw.draw.gordo % 10}` : 'R ·'}
                  </b>
                  {gordoOut && draw.prize === 'pedrea' && <b className="is-mine">Pedrea</b>}
                </span>
                <em>×3 · ×1</em>
              </li>
            </ol>
          </div>

          <p className={`fi-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>Si te toca el Gordo</small>
            <b>{eur(shownBet * PRIZES.gordo.mult)}</b>
            <span className="fi-prize__tag">{fmtMult(PRIZES.gordo.mult)} lo jugado</span>
          </div>

          <div className="fi-group">
            <h2>Tu número</h2>
            <div className="lt-pick">
              <input
                className="lt-pick__input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                value={typed}
                disabled={busy}
                aria-label="Número del décimo, de 00000 a 99999"
                onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 5))}
                onBlur={() => {
                  const n = Number(typed)
                  if (typed !== '' && validNumber(n)) choose(n)
                  else setTyped(fmtNumber(number))
                }}
              />
              <button type="button" disabled={busy} onClick={() => choose(Math.floor(Math.random() * NUMBERS))}>
                🎲 Al azar
              </button>
            </div>
            <div className="lt-lucky" aria-label="Números con historia">
              {LUCKY.map((n) => (
                <button key={n} type="button" disabled={busy} aria-pressed={n === number} onClick={() => choose(n)}>
                  {fmtNumber(n)}
                </button>
              ))}
            </div>
          </div>

          <BetBox bet={shownBet} setBet={setBet} min={MIN_BET} max={maxBet} step={STEP} disabled={busy || maxBet < MIN_BET} clamp={clampBet} />

          {singing ? (
            <button type="button" className="fi-go" onClick={skip}>
              Ver el resultado ya
              <kbd>Espacio</kbd>
            </button>
          ) : (
            <button type="button" className="fi-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={buy}>
              {asking ? 'Comprando…' : `Comprar décimo · ${eur(shownBet)}`}
              <kbd>Espacio</kbd>
            </button>
          )}

          <div className="fi-group">
            <h2>Premios</h2>
            <ol className="fi-table">
              {PRIZE_IDS.map((id) => (
                <li key={id} className={done && draw.prize === id ? 'is-on' : undefined}>
                  <span>{fmtMult(PRIZES[id].mult)}</span>
                  <span>{PRIZES[id].name}</span>
                  <b>{(PRIZES[id].p / 10000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %</b>
                </li>
              ))}
            </ol>
          </div>

          <History list={history} label="Tus últimos décimos" />
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`${PRIZES[burst.prize].name} · ${fmtMult(burst.mult)}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 2)}
          big={burst.mult >= 20}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Loteria
