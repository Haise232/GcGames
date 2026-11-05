// Rasca de las Fiestas (Season 4): eliges uno de los cartones (cada uno con su precio, su dibujo y su forma de ganar),
// lo compras, coges la moneda y frotas por encima de las casillas plateadas para ver qué te toca. La capa plateada es
// un <canvas>: la moneda la va borrando por donde pasa y, cuando una casilla está rascada más o menos a la mitad, se
// destapa entera. El cartón lo sortea el servidor al comprarlo (reglas en rasca.js) y ya está pagado; aquí solo se
// destapa.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { TYPES, TYPE_IDS, cellsOf, fmtMult, multOf, payout, topMult, winCells, winChance } from './rasca.js'
import { eur } from '../comun/money.js'
import { buzz, playCash, playChip, playLose, playReveal, playRustle, playStone, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import { FiestaHeader, History } from '../season4/FiestaParts.jsx'
import './Rasca.css'

const HISTORY = 14
const OPEN_AT = 0.5 // parte rascada de una casilla para destaparla entera
const COIN_R = 15 // radio de lo que borra la moneda (px de pantalla)

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
              const yy = y + 68 * t * (1 - t)
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

// La moneda de rascar (un euro dorado con su canto).
function Coin() {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="31" cy="32" r="26" fill="#a8740e" />
      <circle cx="29" cy="29" r="26" fill="#ffd25e" stroke="#8a5a06" strokeWidth="2.5" />
      <circle cx="29" cy="29" r="19" fill="none" stroke="#e0a21c" strokeWidth="2.5" />
      <path d="M34 21 A10 10 0 1 0 34 37 M19 26 H31 M19 32 H31" fill="none" stroke="#8a5a06" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M12 18 A20 20 0 0 1 24 8" stroke="#fff6c0" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// Lo que hay debajo de cada casilla, según el tipo de cartón. ticket: el comprado (o null, antes de comprar).
function TicketBody({ type, ticket, wins, done }) {
  const t = TYPES[type]
  const cls = (i) => `rs-cell ${wins.includes(i) ? 'is-win' : ''} ${done && wins.length && !wins.includes(i) ? 'is-dim' : ''}`
  if (t.kind === 'match')
    return (
      <div className="rs-grid" style={{ '--cols': t.cols }}>
        {Array.from({ length: t.cols * t.rows }, (_, i) => {
          const id = ticket?.card.cells[i]
          return (
            <div key={i} data-cell={i} className={cls(i)}>
              {id && (
                <span className="rs-symbol" aria-label={t.symbols[id].name}>
                  {t.symbols[id].icon}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  return (
    <div className="rs-numbers">
      <small>Números ganadores</small>
      <div className="rs-win-row">
        {Array.from({ length: t.winning }, (_, i) => (
          <div key={i} data-cell={i} className={`${cls(i)} rs-cell--winning`}>
            {ticket && <b>{ticket.card.winning[i]}</b>}
          </div>
        ))}
      </div>
      <small>Tus números</small>
      <div className="rs-mine">
        {Array.from({ length: t.mine }, (_, k) => {
          const m = ticket?.card.mine[k]
          return (
            <div key={k} data-cell={t.winning + k} className={cls(t.winning + k)}>
              {m && (
                <>
                  <b>{m.n}</b>
                  <span>{eur(payout(type, m.prize))}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Rasca({ onExit, juegos }) {
  const [type, setType] = useState('papas')
  const [ticket, setTicket] = useState(null) // el cartón comprado: { id, type, card, prize, bet, payout, net, balance }
  const [open, setOpen] = useState([]) // casillas destapadas (openRef: lo mismo, para el canvas)
  const openRef = useRef([])
  const [asking, setAsking] = useState(false)
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const [coin, setCoin] = useState(null) // { x, y } dentro del escenario mientras la llevas; null, en su platito
  const [nudge, setNudge] = useState(0) // para que la moneda dé un saltito si intentas rascar sin cogerla
  const stage = useRef(null)
  const body = useRef(null)
  const canvas = useRef(null)
  const rects = useRef([]) // dónde está cada casilla en el canvas (px de pantalla)
  const lastPt = useRef(null)
  const lastSound = useRef(0)
  const checkAt = useRef(0)
  const lock = useRef(false)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  const done = Boolean(ticket) && openRef.current.length >= cellsOf(ticket.type)
  const live = Boolean(ticket) && !done
  // El cartón que se ve: el comprado mientras se rasca, o el último si sigue elegido ese tipo; si eliges otro, uno nuevo sin comprar.
  const view = ticket && (live || ticket.type === type) ? ticket : null
  const shownType = view ? view.type : type
  const t = TYPES[shownType]
  const total = cellsOf(shownType)
  useEffect(() => {
    if (!asking && !live) setBalance(serverBalance)
  }, [serverBalance, asking, live])
  const shown = useCountUp(balance)

  // --- La capa plateada ---
  const paint = useCallback(() => {
    const cv = canvas.current
    const wrap = body.current
    if (!cv || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const box = wrap.getBoundingClientRect()
    cv.width = Math.round(box.width * dpr)
    cv.height = Math.round(box.height * dpr)
    cv.style.width = `${box.width}px`
    cv.style.height = `${box.height}px`
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    rects.current = [...wrap.querySelectorAll('[data-cell]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { i: Number(el.dataset.cell), x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }
    })
    const skip = view ? openRef.current : []
    for (const r of rects.current) {
      if (skip.includes(r.i)) continue
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h)
      g.addColorStop(0, '#d9dee4')
      g.addColorStop(0.5, '#b4bcc6')
      g.addColorStop(1, '#cfd5dc')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 10)
      ctx.fill()
      ctx.save()
      ctx.clip()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 3
      for (let k = -r.h; k < r.w; k += 9) {
        ctx.beginPath()
        ctx.moveTo(r.x + k, r.y + r.h)
        ctx.lineTo(r.x + k + r.h, r.y)
        ctx.stroke()
      }
      ctx.restore()
      ctx.fillStyle = 'rgba(70,80,92,0.55)'
      ctx.font = `800 ${Math.round(Math.min(r.w, r.h) * 0.42)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(t.kind === 'match' ? '?' : '€', r.x + r.w / 2, r.y + r.h / 2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownType, view?.id])
  useLayoutEffect(() => {
    paint()
  }, [paint])
  useEffect(() => {
    const onResize = () => paint()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [paint])

  const clearCell = (i) => {
    const r = rects.current.find((x) => x.i === i)
    const ctx = canvas.current?.getContext('2d')
    if (r && ctx) ctx.clearRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4)
  }
  const openCells = (list) => {
    if (!list.length) return
    list.forEach(clearCell)
    openRef.current = [...new Set([...openRef.current, ...list])]
    setOpen(openRef.current)
    playStone()
  }

  // Cuánto se ha rascado de cada casilla todavía tapada (mirando uno de cada pocos píxeles del canvas).
  function check() {
    const cv = canvas.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const ctx = cv.getContext('2d')
    const ready = []
    for (const r of rects.current) {
      if (openRef.current.includes(r.i)) continue
      const data = ctx.getImageData(Math.round(r.x * dpr), Math.round(r.y * dpr), Math.max(1, Math.round(r.w * dpr)), Math.max(1, Math.round(r.h * dpr))).data
      let solid = 0
      let seen = 0
      for (let k = 3; k < data.length; k += 4 * 7) {
        seen++
        if (data[k] > 40) solid++
      }
      if (seen && 1 - solid / seen >= OPEN_AT) ready.push(r.i)
    }
    openCells(ready)
  }

  function scratchTo(clientX, clientY) {
    const cv = canvas.current
    if (!cv || !live) return
    const box = cv.getBoundingClientRect()
    const x = clientX - box.left
    const y = clientY - box.top
    const inside = x > -COIN_R && y > -COIN_R && x < box.width + COIN_R && y < box.height + COIN_R
    if (!inside) {
      lastPt.current = null
      return
    }
    const ctx = cv.getContext('2d')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = COIN_R * 2
    ctx.beginPath()
    const from = lastPt.current ?? { x, y }
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(x + 0.01, y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    lastPt.current = { x, y }
    const now = performance.now()
    if (now - lastSound.current > 160) {
      lastSound.current = now
      playRustle()
      buzz(6)
    }
    if (now - checkAt.current > 110) {
      checkAt.current = now
      check()
    }
  }

  // --- La moneda: se coge del platito, se arrastra y rasca por donde pasa; al soltarla, vuelve a su sitio. ---
  const coinAt = (e) => {
    const box = stage.current.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  function grab(e) {
    if (!live) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    lastPt.current = null
    setCoin(coinAt(e))
  }
  function drag(e) {
    if (!coin) return
    setCoin(coinAt(e))
    scratchTo(e.clientX, e.clientY)
  }
  function drop() {
    if (!coin) return
    setCoin(null)
    lastPt.current = null
    check()
  }

  async function buy() {
    if (lock.current || live || TYPES[type].price > balance) return
    lock.current = true
    setAsking(true)
    playChip()
    setBurst(null)
    setBank(null)
    const res = await request({ t: 'solo_scratch', type })
    lock.current = false
    setAsking(false)
    const v = res?.solo
    if (!v) return
    openRef.current = []
    setOpen([])
    setTicket(v)
    setBalance(v.balance - v.payout) // hasta destaparlo, solo se ve lo que costó
    if (res.abuse) setBank(res.abuse)
  }

  // Al destapar la última casilla: el resultado.
  const finish = useEffectEvent(() => {
    const tk = ticket
    setBalance(tk.balance)
    const mult = multOf(tk.type, tk.prize)
    setHistory((list) => [{ id: tk.id, mult }, ...list].slice(0, HISTORY))
    const extra = bank?.extra ?? 0
    if (tk.net > 0) {
      playCash(Math.min(10, Math.round(mult)))
      playWin(mult >= 20)
      buzz([60, 40, 80])
      setBurst({ id: tk.id, amount: tk.net + extra, mult, type: tk.type, extra })
    } else if (tk.prize || extra > 0) playReveal()
    else playLose()
  })
  useEffect(() => {
    if (done) finish()
  }, [done])

  function revealAll() {
    if (!live) return
    const left = rects.current.map((r) => r.i).filter((i) => !openRef.current.includes(i))
    left.forEach((i, k) => setTimeout(() => openCells([i]), k * 110))
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'Space') return
    if (event.target instanceof Element && event.target.matches('input, select, textarea, button:focus-visible')) return
    event.preventDefault()
    if (!live) buy()
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const wins = done ? winCells(ticket.type, ticket.card, ticket.prize) : []
  const price = TYPES[type].price
  const canBuy = !asking && !live && balance >= price

  let status = 'Elige un cartón y cómpralo. Después coge la moneda y frota las casillas plateadas.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (asking) status = 'Imprimiendo tu cartón…'
  else if (live && open.length === 0) status = '¡Coge la moneda de abajo y frota por encima de las casillas!'
  else if (live) status = `Sigue frotando: te quedan ${total - open.length} casillas por destapar.`
  else if (done && ticket.net > 0) {
    status = `¡Premio! ${fmtMult(multOf(ticket.type, ticket.prize))}: ganas ${eur(ticket.net + (bank?.extra ?? 0))}.`
    tone = 'good'
  } else if (done && ticket.prize) status = `Premio de ${eur(ticket.payout)}: recuperas lo que costó el cartón.`
  else if (done && bank?.extra > 0) status = `Sin premio, pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (done) {
    status = 'Sin premio esta vez. ¡Otro cartón!'
    tone = 'bad'
  } else if (balance < TYPES.papas.price) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const help = (
    <>
      <p>
        Elige un cartón, cómpralo y <b>coge la moneda</b>: arrástrala por encima de las casillas plateadas para rascarlas. Cuando una está rascada más o
        menos a la mitad, se destapa entera. Si tienes prisa, <b>Destapar todo</b>.
      </p>
      <ul>
        {TYPE_IDS.map((id) => (
          <li key={id}>
            <b>
              {TYPES[id].name} ({eur(TYPES[id].price)}):
            </b>{' '}
            {TYPES[id].blurb} Premio máximo {fmtMult(topMult(id))}; uno de cada {Math.round((1 / winChance(id)) * 10) / 10} cartones lleva premio.
          </li>
        ))}
      </ul>
      <p>
        En los de <b>tres iguales</b> hay como mucho un trío; en los de <b>números</b>, si uno de tus números es ganador cobras el premio que lleva al lado.
        El cartón lo sortea el servidor al comprarlo, así que da igual cómo rasques: en todos, de media se recupera el 96 %.
      </p>
    </>
  )

  return (
    <main className="app fi-app rs-app">
      <FiestaHeader title="Rasca de las Fiestas" balance={shown} betLabel="Cartón" bet={t.price} onExit={onExit} help={help} helpTitle="Cómo se juega al Rasca" />

      <div className="fi fill">
        <section
          ref={stage}
          className={`fi-stage rs-stage ${tone === 'good' ? 'is-win' : ''} ${coin ? 'is-holding' : ''}`}
          aria-label="El cartón"
          onPointerMove={drag}
          onPointerUp={drop}
          onPointerCancel={drop}
        >
          <Verbena />
          <div className="fi-top">
            <span className="fi-chip">
              <small>{t.name}</small>
              <b>{eur(t.price)}</b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Premio máximo</small>
              <b>{eur(t.price * topMult(shownType))}</b>
            </span>
          </div>

          <div className={`rs-ticket rs-ticket--${shownType} ${live ? 'is-live' : ''} ${done ? 'is-done' : ''} ${!view ? 'is-empty' : ''}`} key={`${shownType}-${view?.id ?? 'none'}`}>
            <header className="rs-ticket__head">
              <small>Lotería de las Islas · {eur(t.price)}</small>
              <b>{t.name.toUpperCase()}</b>
              <span>{t.kind === 'match' ? 'Tres iguales, premio' : 'Si tu número es ganador, cobras su premio'}</span>
            </header>
            <div
              className="rs-body"
              ref={body}
              onPointerDown={() => {
                if (live && !coin) setNudge((n) => n + 1)
              }}
            >
              <TicketBody type={shownType} ticket={view} wins={view ? wins : []} done={Boolean(view) && done} />
              <canvas ref={canvas} className="rs-foil-canvas" aria-hidden="true" />
            </div>
            <footer className="rs-ticket__foot">{view ? `Nº ${String(view.id).slice(-7)}` : 'Compra el cartón para rascarlo'}</footer>
          </div>

          <div className={`rs-dish ${live ? 'is-ready' : ''}`}>
            {!coin && (
              <button
                type="button"
                className="rs-coin rs-coin--rest"
                key={nudge}
                disabled={!live}
                onPointerDown={grab}
                aria-label="Coger la moneda para rascar"
                title={live ? 'Coge la moneda y frota' : 'Primero compra un cartón'}
              >
                <Coin />
              </button>
            )}
            <small>{live ? (coin ? '¡Frota!' : 'Coge la moneda') : 'La moneda'}</small>
          </div>
          {coin && (
            <span className="rs-coin rs-coin--held" style={{ left: coin.x, top: coin.y }} aria-hidden="true">
              <Coin />
            </span>
          )}

          <p className={`fi-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>{done && ticket.payout > 0 ? 'Has cobrado' : `Premio máximo · ${TYPES[shownType].name}`}</small>
            <b>{eur(done && ticket.payout > 0 ? ticket.payout : t.price * topMult(shownType))}</b>
            <span className="fi-prize__tag">{done && ticket.prize ? fmtMult(multOf(ticket.type, ticket.prize)) : fmtMult(topMult(shownType))}</span>
          </div>

          <div className="fi-group">
            <h2>Elige tu cartón</h2>
            <div className="rs-types" role="radiogroup" aria-label="Cartón">
              {TYPE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={type === id}
                  className={`rs-type rs-type--${id}`}
                  disabled={live || asking || TYPES[id].price > balance}
                  onClick={() => setType(id)}
                >
                  <span className="rs-type__ico" aria-hidden="true">
                    {TYPES[id].kind === 'match' ? Object.values(TYPES[id].symbols).at(-1).icon : TYPES[id].icon}
                  </span>
                  <b>{TYPES[id].name}</b>
                  <em>{eur(TYPES[id].price)}</em>
                  <small>
                    {TYPES[id].kind === 'match' ? 'Tres iguales' : 'Números'} · hasta {eur(TYPES[id].price * topMult(id))}
                  </small>
                </button>
              ))}
            </div>
          </div>

          {live ? (
            <button type="button" className="fi-go rs-reveal" onClick={revealAll}>
              Destapar todo
            </button>
          ) : (
            <button type="button" className="fi-go" disabled={!canBuy} onClick={buy}>
              {asking ? 'Imprimiendo…' : `Comprar · ${eur(price)}`}
              <kbd>Espacio</kbd>
            </button>
          )}

          <div className="fi-group">
            <h2>Premios · {TYPES[shownType].name}</h2>
            <ol className="fi-table">
              {[...t.prizes].reverse().map(([id, m]) => (
                <li key={id} className={done && ticket.prize === id ? 'is-on' : undefined}>
                  <span aria-hidden="true">{t.kind === 'match' ? t.symbols[id].icon : '🎟️'}</span>
                  <span>{t.kind === 'match' ? `Tres ${t.symbols[id].name}` : `Número ganador ${fmtMult(m)}`}</span>
                  <b>{eur(payout(shownType, id))}</b>
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
          caption={`${TYPES[burst.type].name} · ${fmtMult(burst.mult)}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 2)}
          big={burst.mult >= 20}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Rasca
