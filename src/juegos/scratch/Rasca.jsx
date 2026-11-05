// Rasca de las Fiestas (Season 4): compras un cartón de 3 × 3 y lo rascas arrastrando el dedo (o el ratón) por encima
// de las casillas plateadas. Si salen tres símbolos iguales, cobras su premio. El cartón entero lo sortea el servidor al
// comprarlo (reglas en rasca.js) y ya está pagado; aquí solo se destapa.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { CELLS, IDS, PRICES, SYMBOLS, fmtMult, winChance } from './rasca.js'
import { eur } from '../comun/money.js'
import { buzz, playCash, playChip, playLose, playReveal, playStone, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import { FiestaHeader, History } from '../season4/FiestaParts.jsx'
import './Rasca.css'

const RUBS = 5 // pasadas de dedo para destapar una casilla
const HISTORY = 14

// Fondo: guirnaldas de banderitas de colores y bombillas de verbena sobre la noche de fiestas.
function Verbena() {
  const flags = ['#e8443a', '#f2b632', '#2f8fd8', '#3fae5a', '#ffffff', '#d9479a']
  return (
    <svg className="rs-verbena" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="rs-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1446" />
          <stop offset="1" stopColor="#6a2a6a" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#rs-night)" />
      {[0, 1, 2].map((row) => {
        const y = 14 + row * 26
        return (
          <g key={row} className="rs-garland" style={{ '--d': `${row * -1.3}s` }}>
            <path d={`M-10 ${y} Q 200 ${y + 34} 410 ${y}`} stroke="#ffe7a8" strokeOpacity="0.5" fill="none" />
            {Array.from({ length: 16 }, (_, k) => {
              const t = (k + 0.5) / 16
              const x = -10 + 420 * t
              const yy = y + 34 * 2 * t * (1 - t) * 1
              return <path key={k} d={`M${x - 7} ${yy} L${x + 7} ${yy} L${x} ${yy + 13} Z`} fill={flags[(k + row) % flags.length]} opacity="0.9" />
            })}
          </g>
        )
      })}
      {Array.from({ length: 18 }, (_, k) => (
        <circle key={k} className="rs-bulb" cx={12 + k * 22.5} cy={292 - ((k * 7) % 3) * 4} r="3.4" style={{ '--d': `${(k % 5) * 0.3}s` }} />
      ))}
    </svg>
  )
}

function Rasca({ onExit, juegos }) {
  const [price, setPrice] = useState(50)
  const [ticket, setTicket] = useState(null) // el cartón comprado: { id, card, prize, bet, payout, net, balance }
  const [open, setOpen] = useState([]) // casillas destapadas
  const [rubs, setRubs] = useState({}) // pasadas en cada casilla todavía tapada
  const [asking, setAsking] = useState(false)
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const pressing = useRef(false)
  const lock = useRef(false)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  const done = ticket && open.length >= CELLS
  useEffect(() => {
    if (!asking && (!ticket || done)) setBalance(serverBalance)
  }, [serverBalance, asking, ticket, done])
  const shown = useCountUp(balance)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  async function buy() {
    if (lock.current || (ticket && !done) || price > balance) return
    lock.current = true
    setAsking(true)
    playChip()
    setBurst(null)
    setBank(null)
    const body = await request({ t: 'solo_scratch', bet: price })
    lock.current = false
    setAsking(false)
    const v = body?.solo
    if (!v) return
    setTicket(v)
    setOpen([])
    setRubs({})
    setBalance(v.balance - v.payout) // hasta destaparlo, solo se ve lo que costó
    if (body.abuse) setBank(body.abuse)
  }

  // Al destapar la última casilla: el resultado.
  const finish = useEffectEvent(() => {
    const t = ticket
    setBalance(t.balance)
    setHistory((list) => [{ id: t.id, mult: t.prize ? SYMBOLS[t.prize].mult : 0 }, ...list].slice(0, HISTORY))
    const extra = bank?.extra ?? 0
    if (t.net > 0 || extra > 0) {
      const mult = t.prize ? SYMBOLS[t.prize].mult : 0
      playCash(Math.min(10, mult))
      playWin(mult >= 20)
      buzz([60, 40, 80])
      if (t.net > 0) setBurst({ id: t.id, amount: t.net + extra, mult, prize: t.prize, extra })
    } else if (t.prize) playReveal()
    else playLose()
  })
  useEffect(() => {
    if (done) finish()
  }, [done])

  function reveal(i) {
    if (!ticket || open.includes(i)) return
    setOpen((list) => (list.includes(i) ? list : [...list, i]))
    playStone()
  }
  function rub(i) {
    if (!ticket || open.includes(i)) return
    setRubs((r) => {
      const n = (r[i] ?? 0) + 1
      if (n >= RUBS) reveal(i)
      return { ...r, [i]: n }
    })
  }
  function revealAll() {
    if (!ticket || done) return
    const left = Array.from({ length: CELLS }, (_, i) => i).filter((i) => !open.includes(i))
    if (reduced) return setOpen(Array.from({ length: CELLS }, (_, i) => i))
    left.forEach((i, k) => setTimeout(() => reveal(i), k * 90))
  }

  useEffect(() => {
    const up = () => (pressing.current = false)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'Space') return
    if (event.target instanceof Element && event.target.matches('input, select, textarea, button:focus-visible')) return
    event.preventDefault()
    if (ticket && !done) revealAll()
    else buy()
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const prize = done ? ticket.prize : null
  const winCells = prize ? ticket.card.map((id, i) => (id === prize ? i : -1)).filter((i) => i >= 0) : []
  const canBuy = !asking && (!ticket || done) && balance >= PRICES[0]

  let status = 'Elige el precio del cartón y cómpralo. Luego rasca: tres símbolos iguales, premio.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (asking) status = 'Imprimiendo tu cartón…'
  else if (ticket && !done) status = `Rasca las casillas plateadas (te quedan ${CELLS - open.length}) o pulsa «Rascar todo».`
  else if (done && ticket.net > 0) {
    status = `¡Tres ${SYMBOLS[prize].name.toLowerCase()}! ${fmtMult(SYMBOLS[prize].mult)}: ganas ${eur(ticket.net + (bank?.extra ?? 0))}.`
    tone = 'good'
  } else if (done && prize) status = `Tres ${SYMBOLS[prize].name.toLowerCase()}: recuperas lo que costó el cartón.`
  else if (done && bank?.extra > 0) status = `Sin premio, pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (done) {
    status = 'Sin premio esta vez. ¡Otro cartón!'
    tone = 'bad'
  } else if (balance < PRICES[0]) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const help = (
    <>
      <p>
        Compra un cartón y rasca sus nueve casillas arrastrando el dedo o el ratón por encima (o tócalas, o pulsa <b>Rascar todo</b>). Si salen{' '}
        <b>tres símbolos iguales</b>, cobras su premio multiplicado por lo que costó el cartón. En cada cartón hay como mucho un trío.
      </p>
      <ul>
        {IDS.map((id) => (
          <li key={id}>
            {SYMBOLS[id].icon} <b>{SYMBOLS[id].name}</b>: {fmtMult(SYMBOLS[id].mult)}
          </li>
        ))}
      </ul>
      <p>
        Uno de cada {Math.round(1 / winChance * 10) / 10} cartones lleva trío. El cartón lo sortea el servidor al comprarlo, así que da igual en qué
        orden rasques: de media se recupera el 96 %. Con el Admin Abuse, la banca multiplica lo que ganes o te devuelve lo que pierdas.
      </p>
    </>
  )

  return (
    <main className="app fi-app rs-app">
      <FiestaHeader title="Rasca de las Fiestas" balance={shown} betLabel="Cartón" bet={ticket && !done ? ticket.bet : price} onExit={onExit} help={help} helpTitle="Cómo se juega al Rasca" />

      <div className="fi fill">
        <section className={`fi-stage rs-stage ${tone === 'good' ? 'is-win' : ''}`} aria-label="El cartón">
          <Verbena />
          <div className="fi-top">
            <span className="fi-chip">
              <small>Cartón de</small>
              <b>{eur(ticket && !done ? ticket.bet : price)}</b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Premio gordo</small>
              <b>{eur((ticket && !done ? ticket.bet : price) * SYMBOLS.drago.mult)}</b>
            </span>
          </div>

          <div className={`rs-ticket ${ticket ? 'is-live' : 'is-empty'} ${done ? 'is-done' : ''}`} key={ticket?.id ?? 'none'}>
            <header className="rs-ticket__head">
              <small>Lotería de las Islas</small>
              <b>RASCA DE LAS FIESTAS</b>
              <span>Tres iguales, premio</span>
            </header>
            <div
              className="rs-grid"
              role="grid"
              aria-label="Casillas"
              onPointerDown={(e) => {
                pressing.current = true
                if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture?.(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (!pressing.current || !ticket) return
                const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell]')
                if (el) rub(Number(el.dataset.cell))
              }}
            >
              {Array.from({ length: CELLS }, (_, i) => {
                const id = ticket?.card[i]
                const isOpen = ticket && open.includes(i)
                const win = winCells.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    data-cell={i}
                    className={`rs-cell ${isOpen ? 'is-open' : ''} ${win ? 'is-win' : ''} ${done && !win ? 'is-dim' : ''}`}
                    disabled={!ticket || isOpen}
                    onClick={() => reveal(i)}
                    aria-label={isOpen ? SYMBOLS[id].name : `Rascar la casilla ${i + 1}`}
                    style={{ '--scr': Math.min(1, (rubs[i] ?? 0) / RUBS), '--k': i }}
                  >
                    {ticket && (
                      <span className="rs-symbol" aria-hidden="true">
                        {SYMBOLS[id].icon}
                      </span>
                    )}
                    {!isOpen && <span className="rs-foil" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <footer className="rs-ticket__foot">{ticket ? `Nº ${String(ticket.id).slice(-7)}` : 'Compra un cartón para jugar'}</footer>
          </div>

          <p className={`fi-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>{done && ticket.payout > 0 ? 'Has cobrado' : 'Premio gordo: tres dragos'}</small>
            <b>{eur(done && ticket.payout > 0 ? ticket.payout : price * SYMBOLS.drago.mult)}</b>
            <span className="fi-prize__tag">{done && prize ? `${SYMBOLS[prize].icon} ${fmtMult(SYMBOLS[prize].mult)}` : fmtMult(SYMBOLS.drago.mult)}</span>
          </div>

          <div className="fi-group">
            <h2>Precio del cartón</h2>
            <div className="fi-options" style={{ '--cols': 4 }} role="radiogroup" aria-label="Precio">
              {PRICES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={price === p}
                  className="fi-option fi-option--plain"
                  disabled={!canBuy || p > balance}
                  onClick={() => setPrice(p)}
                >
                  <b>{eur(p)}</b>
                </button>
              ))}
            </div>
          </div>

          {ticket && !done ? (
            <button type="button" className="fi-go fi-go--cash" onClick={revealAll}>
              Rascar todo <kbd>Espacio</kbd>
            </button>
          ) : (
            <button type="button" className="fi-go" disabled={!canBuy || price > balance} onClick={buy}>
              {asking ? 'Imprimiendo…' : `Comprar cartón · ${eur(price)}`}
              <kbd>Espacio</kbd>
            </button>
          )}

          <div className="fi-group">
            <h2>Premios (tres iguales)</h2>
            <ol className="fi-table">
              {[...IDS].reverse().map((id) => (
                <li key={id} className={prize === id ? 'is-on' : undefined}>
                  <span aria-hidden="true">{SYMBOLS[id].icon}</span>
                  <span>{SYMBOLS[id].name}</span>
                  <b>{eur((ticket && !done ? ticket.bet : price) * SYMBOLS[id].mult)}</b>
                </li>
              ))}
            </ol>
          </div>

          <History list={history} label="Tus últimos cartones" />
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`Tres ${SYMBOLS[burst.prize].name.toLowerCase()} · ${fmtMult(burst.mult)}`}
          coins={Math.min(70, 20 + burst.mult * 2)}
          big={burst.mult >= 20}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Rasca
