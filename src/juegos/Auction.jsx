import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BID_STEP, MAX_BID, MAX_CLOSE_MS, PRIZES, ROUND_MS, SNIPE_MS, TIERS, TIER_ORDER, maxPrize, minBid, roundOf } from './auction.js'
import { eur } from './money.js'
import {
  buzz,
  isMuted,
  playBeep,
  playCash,
  playChip,
  playLastLap,
  playLose,
  playOvation,
  playRegister,
  playReveal,
  playSiren,
  playStall,
  playTurn,
  playWin,
  setMuted,
} from './sound.js'
import { useCountUp } from './useCountUp.js'
import WinBurst from './WinBurst.jsx'
import Help from './Help.jsx'
import Avatar from './Avatar.jsx'
import './season3.css'
import './Auction.css'

const TOPIC = 'juegos-subasta' // canal público: el servidor avisa con cada puja (evento «cambio»)
const POLL_MS = 10000 // respaldo del Realtime mientras se puja
const REVEAL_WAIT_MS = 700 // tras el cierre, lo que se espera para pedir qué llevaba la caja
const COALESCE_MS = 250 // avisos seguidos del Realtime se juntan en una sola petición
const NOTICE_MS = 2600 // cuánto se ve el cartel de «¡PRÓRROGA!»
const GHOST_MS = 1500 // el líder destronado cae durante este tiempo
const MAX_PADDLES = 24 // paletas que se dibujan como mucho
const MAX_BARS = 7 // barras de la gráfica de pujas al revelar (se añade la tuya si quedara fuera)
const MAX_RANK = 6 // filas del ranking en directo (se añade la tuya si quedara fuera)
const WAR_MS = 20000 // las pujas de los últimos segundos calientan el medidor de guerra
const STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]

// Azar determinista por (índice, semilla): partículas y confeti sin Math.random en el render.
const rnd = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const SPARKS = Array.from({ length: 14 }, (_, i) => i)
const STARS = Array.from({ length: 16 }, (_, i) => i)
const CONFETTI = Array.from({ length: 36 }, (_, i) => i)
const JACKPOT_CONFETTI = Array.from({ length: 90 }, (_, i) => i)
const RAIN = Array.from({ length: 9 }, (_, i) => i)
const CONFETTI_COLORS = ['#ffd23f', '#ff6b6b', '#7fe7ff', '#9be37b', '#f5a3ff', '#ffffff']
const war = (n) => (n < 0.2 ? 'Calma' : n < 0.45 ? 'Calentando' : n < 0.75 ? 'Guerra abierta' : '¡GUERRA TOTAL!')
const short = (n) => (n >= 1000 ? `${n / 1000}k` : String(n))
const rarity = (w) => (w >= 20 ? 'Común' : w >= 14 ? 'Poco común' : w >= 9 ? 'Rara' : 'Muy rara')
const oneIn = (w) => `Sale ${w} de cada 100`

// Cuatro subidas rápidas a escala de la puja (≈ 10, 25, 50 y 100 %), siempre crecientes.
function raiseSteps(base) {
  const out = []
  let from = 0
  for (const f of [0.1, 0.25, 0.5, 1]) {
    const want = Math.max(100, base * f)
    let idx = STEPS.reduce((best, s, i) => (Math.abs(Math.log(s / want)) < Math.abs(Math.log(STEPS[best] / want)) ? i : best), 0)
    if (idx < from) idx = from
    if (idx >= STEPS.length) break
    out.push(STEPS[idx])
    from = idx + 1
  }
  return out
}

function Crown({ className = '' }) {
  return (
    <svg className={`au-crown ${className}`} viewBox="0 0 64 46" aria-hidden="true">
      <path d="M5 38 L8 12 L22 25 L32 5 L42 25 L56 12 L59 38 Z" />
      <rect x="5" y="38" width="54" height="6" rx="2" />
      <circle cx="8" cy="10" r="4" />
      <circle cx="32" cy="3.5" r="4" />
      <circle cx="56" cy="10" r="4" />
    </svg>
  )
}

// Mini caja del color del tipo (para la hilera de cajas y la lista de últimas subastas).
function Mini({ tier, className = '' }) {
  return (
    <span className={`au-mini au-t--${tier} ${className}`} aria-hidden="true">
      <i />
    </span>
  )
}

// La subasta en vivo: el servidor guarda las pujas, abre la caja y paga; aquí se puja, se ve quién va primero y se anima.
function Auction({ onExit, juegos }) {
  const [live, setLive] = useState(null)
  const [amount, setAmount] = useState(0)
  const [sending, setSending] = useState(false)
  const [sound, setSound] = useState(() => !isMuted())
  const [burst, setBurst] = useState(null)
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const applied = useRef(0) // `now` de la última respuesta aplicada: una vieja que llega tarde no pisa a una nueva
  const seen = useRef(null) // última ronda cuyo resultado ya se celebró
  const [lead, setLead] = useState({ round: null, id: '', who: null, from: null, key: 0, at: 0 }) // quién va primero y a quién destronó
  const [ext, setExt] = useState({ round: null, closes: 0, key: 0, at: 0 }) // prórrogas de la ronda
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const shownBank = useCountUp(balance)

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'auction', ...message })
      const got = Date.now()
      if (body?.auction) {
        if (skew.current === null || got - sent < 1500) skew.current = body.auction.now - (sent + got) / 2
        if (body.auction.now >= applied.current) {
          applied.current = body.auction.now
          setLive(body.auction)
        }
      }
      return body
    },
    [request],
  )

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])

  const t = clock()
  const ready = skew.current !== null && live !== null
  const round = roundOf(t)
  const view = ready && live.round === round ? live : null
  const result = view?.result ?? null
  const closesAt = view?.closesAt ?? 0
  const phase = !view ? 'wait' : result ? 'reveal' : t >= closesAt ? 'closing' : 'bid'
  const bidding = phase === 'bid'
  const leftMs = !view ? 0 : phase === 'bid' ? closesAt - t : Math.max(0, view.nextRound - t)
  const left = Math.max(0, Math.ceil(leftMs / 1000))
  const extended = Boolean(view?.extended)
  const lastCall = bidding && leftMs <= SNIPE_MS // los últimos 10 s: cada puja alarga la subasta
  const maxed = extended && closesAt >= round * ROUND_MS + MAX_CLOSE_MS

  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])

  // En directo: cada puja avisa por Realtime y se pide el estado (los avisos seguidos se juntan en uno).
  useEffect(() => {
    let timer = null
    const channel = supabase
      .channel(TOPIC)
      .on('broadcast', { event: 'cambio' }, () => {
        if (timer) return
        timer = setTimeout(() => {
          timer = null
          if (document.visibilityState === 'visible') ask({ a: 'sync' })
        }, COALESCE_MS)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [ask])

  // Respaldo: sondeo cada poco durante la puja y peticiones justo al cerrar (para abrir la caja) y al empezar la ronda.
  useEffect(() => {
    if (!ready) return
    const timers = []
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    if (closesAt) {
      const wait = closesAt + REVEAL_WAIT_MS - clock()
      if (wait > 0) timers.push(setTimeout(sync, wait))
    }
    timers.push(setTimeout(() => ask({ a: 'sync' }), (round + 1) * ROUND_MS + 200 - clock()))
    const poll = setInterval(() => {
      const now = clock()
      if (document.visibilityState === 'visible' && (now < closesAt || !closesAt)) ask({ a: 'sync' })
    }, POLL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, round, closesAt, ask, clock])
  // Cerrada pero sin abrir: se insiste cada poco hasta que el servidor suelta lo que llevaba.
  useEffect(() => {
    if (phase !== 'closing') return
    const timer = setInterval(() => ask({ a: 'sync' }), 900)
    return () => clearInterval(timer)
  }, [phase, ask])

  const tier = view?.tier ?? null
  const min = view?.min ?? (tier ? minBid(tier) : 0)
  const next = view?.next ?? min
  const mine = view?.bid ?? 0
  const leader = view?.leader ?? null
  const iLead = Boolean(leader?.me)
  const outbid = mine > 0 && Boolean(leader) && !leader.me
  const target = Math.max(amount, next)
  const cost = target - mine
  const bidders = view?.bidders ?? 0
  const raises = view?.raises ?? 0
  const feed = view?.feed ?? []
  const ranking = view?.ranking ?? []
  const prize = result ? PRIZES[result.prize] : null
  const real = result?.amount ?? 0
  const jackpot = prize?.mult >= 20
  const sad = prize ? prize.mult <= 0.1 : false

  // Si cambia el líder (alguien supera a otro) se anota a quién destronó, para la caída del anterior y el sonido.
  const leadId = leader ? `${leader.name}|${leader.amount}` : ''
  if (view && (lead.round !== round || lead.id !== leadId)) {
    const swap = lead.round === round && lead.id !== '' && leadId !== '' ? lead.who : null
    setLead({ round, id: leadId, who: leader, from: swap, key: lead.key + (swap ? 1 : 0), at: swap ? clock() : 0 })
  }
  // Prórroga: la hora de cierre sube respecto a la última vista de esta ronda.
  if (view && !result) {
    if (ext.round !== round) setExt({ round, closes: closesAt, key: ext.key, at: 0 })
    else if (closesAt > ext.closes) setExt({ round, closes: closesAt, key: ext.key + 1, at: clock() })
  }
  const fresh = (at, ms) => at > 0 && t - at < ms

  useEffect(() => {
    if (!lead.from) return
    if (lead.who?.me) playRegister()
    else if (lead.from.me) {
      playSiren()
      buzz([80, 40, 80])
    } else playTurn()
  }, [lead])
  useEffect(() => {
    if (ext.key > 0) {
      playLastLap()
      buzz([40, 30, 40])
    }
  }, [ext.key])
  // Últimos 5 s: un pitido por segundo.
  const secs = bidding && left <= 5 ? left : 0
  useEffect(() => {
    if (secs > 0) playBeep(6 - secs)
  }, [secs])

  // Al empezar ronda nueva, al cambiar tu puja o al subir lo mínimo, la puja propuesta vuelve a lo mínimo.
  useEffect(() => {
    setAmount(0)
  }, [round, mine, next])

  // Se celebra el resultado (una vez por ronda): sonido para todos y, si te llevaste la caja, el aviso de premio.
  useEffect(() => {
    if (!result || seen.current === round) return
    seen.current = round
    const p = PRIZES[result.prize]
    playReveal()
    if (p.mult >= 20) setTimeout(playOvation, 450)
    else if (p.mult <= 0.1) setTimeout(playStall, 500)
    if (!result.winner?.me) return
    // Con el Admin Abuse, lo que puso la banca viene en tu última subasta.
    const last = live?.last?.round === round ? live.last : null
    const extra = last?.abuse ?? 0
    const net = result.amount - result.winner.bid + extra
    if (net > 0) {
      playCash(5)
      playWin(p.mult >= 4)
      buzz([60, 40, 120])
      setBurst({
        id: round,
        amount: net,
        caption: `${p.icon} ${p.name}`,
        tags: extra > 0 ? [`Admin Abuse: +${eur(extra)}`] : [],
      })
    } else {
      playLose()
    }
  }, [result, round, live])

  async function bid() {
    if (!bidding || sending || iLead || cost > balance) return
    setSending(true)
    playChip()
    await ask({ a: 'bid', amount: target })
    setSending(false)
  }

  // Guerra de pujas: cuántas pujas hubo en los últimos segundos (y se enfría sola con el reloj).
  const recent = feed.filter((f) => t - f.at < WAR_MS).length
  const heat = bidding ? Math.min(1, recent / 6 + (extended ? 0.25 : 0)) : 0
  // Temblor de la caja: crece en los últimos 12 s de puja.
  const amp = bidding ? Math.max(0, Math.min(1, (12 - left) / 12)) : 0
  // El más peleón: quien más pujas lleva en el historial en directo.
  const counts = feed.reduce((m, f) => m.set(f.name, (m.get(f.name) ?? 0) + 1), new Map())
  const [fighter, fights] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]

  // Ranking en barras: las mejores y, si hace falta, la tuya (con su puesto).
  const rank = ranking.map((r, i) => ({ ...r, pos: i + 1 }))
  let top = rank
  if (rank.length > MAX_RANK) {
    const at = rank.findIndex((r) => r.me)
    top = at >= MAX_RANK ? [...rank.slice(0, MAX_RANK - 1), rank[at]] : rank.slice(0, MAX_RANK)
  }
  const rankMax = Math.max(1, rank[0]?.amount ?? 1)

  // Gráfica de pujas al revelar: las mejores y, si hace falta, la tuya.
  let rows = result?.bids ?? []
  if (rows.length > MAX_BARS) {
    const mineRow = rows.findIndex((b) => b.me)
    rows = mineRow >= MAX_BARS ? [...rows.slice(0, MAX_BARS - 1), rows[mineRow]] : rows.slice(0, MAX_BARS)
  }
  const hidden = (result?.bids.length ?? 0) - rows.length
  const scale = Math.max(real, ...(result?.bids ?? []).map((b) => b.amount), 1) * 1.08
  const diff = result?.winner ? result.winner.bid - real : 0
  const history = live?.history ?? []
  const histMax = Math.max(1, ...history.flatMap((h) => [h.amount, h.winner.bid]))
  const steps = raiseSteps(next)

  let status = 'Conectando con la sala de subastas…'
  if (juegos.error) status = juegos.error
  else if (phase === 'bid') {
    status = !leader
      ? `Nadie ha pujado todavía: abre tú la subasta desde ${eur(min)}.`
      : iLead
        ? `Vas primero con ${eur(leader.amount)}. Si nadie te supera, la caja es tuya.`
        : `${leader.name} va primero con ${eur(leader.amount)}. Para superarle, ${eur(next)}.`
  } else if (phase === 'closing') status = 'Subasta cerrada. Abriendo la caja…'
  else if (phase === 'reveal') {
    status = result.winner
      ? `${result.winner.me ? '¡Te la llevas tú!' : `Se la lleva ${result.winner.name}`} por ${eur(result.winner.bid)}: dentro había ${prize.icon} ${prize.name.toLowerCase()} (${eur(result.amount)}).`
      : `Nadie pujó. Dentro había ${prize.icon} ${prize.name.toLowerCase()}.`
  }

  // Cartel del panel: te han superado, vas primero o todavía no has entrado.
  const mode = !bidding ? 'closed' : outbid ? 'out' : iLead ? 'lead' : 'idle'
  const poor = cost > balance
  let label = 'Pujar'
  if (sending) label = 'Pujando…'
  else if (!bidding) label = phase === 'wait' ? 'Un momento…' : 'Pujas cerradas'
  else if (iLead) label = 'Vas primero'
  else if (poor) label = 'No te llega el saldo'
  else if (target > next) label = `Pujar ${eur(target)}`
  else label = !leader ? `Abrir con ${eur(target)}` : `Superar por ${eur(target)}`

  return (
    <main className="app s3-app auction-app">
      <header className="top">
        <h1>La Subasta</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>Tu puja</dt>
              <dd>{eur(mine)}</dd>
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
                Cada {ROUND_MS / 1000} s la banca subasta una caja para todos. Ves de qué tipo es, pero no lo que lleva: eso es sorpresa hasta que se
                cierra. Las pujas son a la vista: todos ven quién va primero, cuánto ofrece y el historial de pujas en directo.
              </p>
              <p>
                Se puja desde el principio. La subasta cierra a los 45 s, pero si alguien puja en los últimos {SNIPE_MS / 1000} s hay{' '}
                <b>prórroga</b>: el cierre se retrasa a {SNIPE_MS / 1000} s después de esa puja, como mucho hasta los {MAX_CLOSE_MS / 1000} s.
                Después se abre la caja y se ve todo hasta que empieza la siguiente.
              </p>
              <p>
                Para pujar tienes que superar al que va primero en al menos un 5 % (mínimo {eur(BID_STEP)}); si nadie ha pujado, vale la puja mínima
                de la caja. Quien va primero no puede pujar: tiene que esperar a que le superen. Tu puja es total: si la subes pagas solo la
                diferencia, y si no ganas se te devuelve entera al cerrar. Si hay empate, gana el que pujó antes.
              </p>
              <ul>
                {TIER_ORDER.map((id) => (
                  <li key={id}>
                    <b>{TIERS[id].name}:</b> vale de media {eur(TIERS[id].value)} · puede llevar hasta {eur(maxPrize(id))} · puja mínima{' '}
                    {eur(minBid(id))} · {oneIn(TIERS[id].weight).toLowerCase()}
                  </li>
                ))}
              </ul>
              <p>
                Dentro puede haber: {PRIZES.map((p) => `${p.icon} ${p.name.toLowerCase()} (×${p.mult.toLocaleString('es-ES')})`).join(', ')}. Una de cada
                tres es una piedra; el jackpot sale una de cada doscientas.
              </p>
              <p>Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="s3 fill">
        <section className="s3__stage au" aria-label="La subasta">
          <p className={`status ${result?.winner?.me && result.amount > result.winner.bid ? 'status--win' : ''}`} aria-live="polite">
            {status}
          </p>
          <div
            className={`au-scene au-t--${tier ?? 'madera'} ${result ? 'is-open' : ''} ${sad ? 'is-sad' : ''} ${prize?.mult === 0 ? 'is-stone' : ''} ${jackpot ? 'is-jackpot' : ''} ${extended && bidding ? 'is-extended' : ''}`}
          >
            {/* Podio: foco de luz, caja sobre el atril, cuenta atrás y rótulo del lote */}
            <div className="au-stage">
              <i className="au-spot" aria-hidden="true" />
              <p className="au-lot">
                <small>Lote</small> nº {ready ? round % 1000 : '…'}
              </p>
              <div
                className={`au-clock ${lastCall ? 'is-call' : ''} ${(extended && bidding) || (lastCall && left <= 5) ? 'is-hot' : ''} ${!bidding ? 'is-reveal' : ''}`}
                style={{ '--left': bidding ? Math.min(1, leftMs / (extended ? SNIPE_MS : closesAt - view.startsAt)) : 0 }}
              >
                <span key={left}>{view ? left : '…'}</span>
                <small>{bidding ? 'para cerrar' : phase === 'closing' ? 'cerrada' : 'siguiente'}</small>
              </div>
              {bidding && extended && (
                <p className="au-ext-pill">
                  {maxed ? 'Último alargue' : 'Prórroga'}
                </p>
              )}
              {bidding && lastCall && !extended && <p className="au-ext-pill is-soft">Últimos {SNIPE_MS / 1000} s</p>}
              {fresh(ext.at, NOTICE_MS) && (
                <p key={ext.key} className="au-overtime" role="status">
                  ¡PRÓRROGA!<b>+{SNIPE_MS / 1000} s</b>
                </p>
              )}
              <div className="au-sparks" aria-hidden="true">
                {SPARKS.map((i) => (
                  <i key={i} style={{ '--x': `${8 + rnd(i, 1) * 84}%`, '--d': `${2.4 + rnd(i, 2) * 3}s`, '--w': `${-rnd(i, 3) * 5}s`, '--s': `${3 + rnd(i, 4) * 4}px` }} />
                ))}
              </div>
              <div className={`au-crate ${amp > 0 ? 'is-shaking' : ''}`} style={{ '--amp': amp }} aria-hidden="true">
                {result && prize.mult >= 4 && <i className="au-rays" />}
                {result && <i key={`f${round}`} className="au-flash" />}
                {jackpot && (
                  <div className="au-boom" key={`b${round}`}>
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {result && prize.mult >= 2 && (
                  <div className="au-confetti" key={`c${round}`}>
                    {(jackpot ? JACKPOT_CONFETTI : CONFETTI).map((i) => (
                      <i
                        key={i}
                        className={jackpot && i % 3 === 0 ? 'is-coin' : ''}
                        style={{
                          '--dx': `${(rnd(i, 5) - 0.5) * (jackpot ? 640 : 360)}px`,
                          '--dy': `${-90 - rnd(i, 6) * (jackpot ? 300 : 190)}px`,
                          '--r': `${rnd(i, 7) * 720 - 360}deg`,
                          '--c': jackpot && i % 3 === 0 ? '#ffd23f' : CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                          '--t': `${0.1 + rnd(i, 8) * (jackpot ? 0.9 : 0.4)}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
                {result && sad && (
                  <div className="au-rain" key={`r${round}`}>
                    {RAIN.map((i) => (
                      <i key={i} style={{ '--x': `${(i - 4) * 22}px`, '--w': `${rnd(i, 9) * 1.2}s` }} />
                    ))}
                  </div>
                )}
                {result && (
                  <span key={`p${round}`} className="au-prize">
                    {prize.icon}
                  </span>
                )}
                <span className="au-lid" />
                <span className="au-body">
                  <i className="au-deco" />
                  <b className="au-lock">{result ? '' : '?'}</b>
                </span>
                {tier === 'cosmica' && (
                  <span className="au-stars">
                    {STARS.map((i) => (
                      <i key={i} style={{ '--x': `${rnd(i, 11) * 100}%`, '--y': `${rnd(i, 12) * 100}%`, '--w': `${-rnd(i, 13) * 3}s`, '--s': `${1.5 + rnd(i, 14) * 2.5}px` }} />
                    ))}
                  </span>
                )}
              </div>
              <div className="au-pedestal" aria-hidden="true">
                <i />
              </div>
              <p className="au-name">
                {tier ? TIERS[tier].name : 'Caja misteriosa'}
                <small>{result ? `${prize.name} · ${eur(real)}` : tier ? `Vale de media ${eur(TIERS[tier].value)}` : ''}</small>
                {tier && (
                  <strong className="au-max">
                    Puede llevar hasta <b>{eur(maxPrize(tier))}</b>
                  </strong>
                )}
              </p>
              {jackpot && (
                <p key={`j${round}`} className="au-jackpot">
                  ¡¡JACKPOT!!
                </p>
              )}
            </div>

            {/* Lado de la sala: quién va primero, guerra de pujas, historial y ranking; al revelar, ganador y gráfica */}
            <div className="au-side">
              {result ? (
                <div className="au-reveal" key={round}>
                  <div className={`au-leader is-winner ${result.winner?.me ? 'is-me' : ''}`}>
                    <i className="au-leader__spot" aria-hidden="true" />
                    {result.winner ? (
                      <>
                        <Crown />
                        <Avatar name={result.winner.name} src={result.winner.avatar} size={64} />
                        <p className="au-leader__who">
                          <small>{result.winner.me ? '¡Te la llevas tú!' : 'Se la lleva'}</small>
                          <b>
                            {result.winner.name}
                            {result.winner.me && ' (tú)'}
                          </b>
                          <span>
                            por <em>{eur(result.winner.bid)}</em>
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="au-empty">Nadie pujó por esta caja.</p>
                    )}
                  </div>
                  <div className="au-chart">
                    <h2>Las pujas, cara a cara</h2>
                    {result.bids.length > 0 && (
                      <>
                        <p className={`au-verdict ${diff > 0 ? 'is-over' : 'is-under'}`}>
                          {diff > 0
                            ? `${result.winner.me ? 'Pagaste' : `${result.winner.name} pagó`} ${eur(diff)} de más`
                            : diff < 0
                              ? `${result.winner.me ? 'Ganaste' : `${result.winner.name} ganó`} ${eur(-diff)}`
                              : `${result.winner.me ? 'Pagaste' : `${result.winner.name} pagó`} justo lo que valía`}
                        </p>
                        <ol className="au-rows" style={{ '--x': Math.min(1, real / scale) }}>
                          {rows.map((b, i) => (
                            <li
                              key={`${b.name}-${i}`}
                              className={`${b.me ? 'is-me' : ''} ${b === result.bids[0] ? 'is-top' : ''} ${b.amount > real ? 'is-over' : 'is-under'}`}
                              style={{ '--i': i, '--w': b.amount / scale }}
                            >
                              <Avatar name={b.name} src={b.avatar} size={26} />
                              <span className="au-who">
                                {b === result.bids[0] && '🏆 '}
                                {b.name}
                                {b.me && ' (tú)'}
                                <em>{eur(b.amount)}</em>
                              </span>
                              <span className="au-track">
                                <i className="au-bar" />
                              </span>
                            </li>
                          ))}
                          <li className={`au-mark ${real / scale > 0.7 ? 'is-far' : ''}`} aria-hidden="true">
                            <span>Valía {eur(real)}</span>
                          </li>
                        </ol>
                        {hidden > 0 && (
                          <p className="au-more">
                            y {hidden} {hidden === 1 ? 'puja más' : 'pujas más'} por debajo
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="au-live">
                  {/* El líder: corona, avatar grande y su puja; al cambiar, el anterior cae y el nuevo sube */}
                  <div className={`au-leader ${leader ? '' : 'is-empty'} ${iLead ? 'is-me' : ''}`}>
                    <i className="au-leader__spot" aria-hidden="true" />
                    {leader ? (
                      <div className={`au-leader__now ${lead.from && lead.id === leadId && fresh(lead.at, 1400) ? 'is-new' : ''}`} key={`${leader.name}-${leader.amount}`}>
                        <Crown />
                        <Avatar name={leader.name} src={leader.avatar} size={64} />
                        <p className="au-leader__who">
                          <small>{iLead ? '¡Vas primero!' : 'Va primero'}</small>
                          <b>
                            {leader.name}
                            {leader.me && ' (tú)'}
                          </b>
                          <span>
                            <em>{eur(leader.amount)}</em>
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p className="au-leader__none">
                        <Crown className="is-ghost" />
                        <b>Nadie ha pujado</b>
                        <small>La corona está libre: abre desde {eur(min)}</small>
                      </p>
                    )}
                    {lead.from && fresh(lead.at, GHOST_MS) && (
                      <div className="au-leader__ghost" key={lead.key} aria-hidden="true">
                        <Avatar name={lead.from.name} src={lead.from.avatar} size={48} />
                        <b>{lead.from.name}</b>
                        <small>destronado</small>
                      </div>
                    )}
                    {lead.from && fresh(lead.at, 900) && <i key={`s${lead.key}`} className="au-leader__shock" aria-hidden="true" />}
                  </div>

                  <div className={`au-war ${heat > 0.75 ? 'is-max' : ''}`} style={{ '--heat': heat }}>
                    <div className="au-war__head">
                      <span>
                        Guerra de pujas <b>{war(heat)}</b>
                      </span>
                      <span className="au-war__nums">
                        <b>{bidders}</b> {bidders === 1 ? 'pujador' : 'pujadores'} · <b>{raises}</b> {raises === 1 ? 'puja' : 'pujas'}
                      </span>
                    </div>
                    <div className="au-war__bar">
                      <i />
                    </div>
                    {fights >= 2 && (
                      <p className="au-war__fighter">
                        El más peleón: <b>{fighter}</b> ({fights} pujas recientes)
                      </p>
                    )}
                  </div>

                  <div className="au-cols">
                    <div className="au-feed">
                      <h2>Pujas en directo</h2>
                      {feed.length === 0 ? (
                        <p className="au-empty">Todavía no hay pujas. ¡Rompe el hielo!</p>
                      ) : (
                        <ol>
                          {feed.map((f, i) => {
                            const before = feed[i + 1]
                            const secsAgo = Math.max(0, Math.round((t - f.at) / 1000))
                            return (
                              <li key={`${f.name}-${f.at}-${f.amount}`} className={`${f.me ? 'is-me' : ''} ${i === 0 ? 'is-newest' : ''}`}>
                                <Avatar name={f.name} src={f.avatar} size={22} />
                                <span className="au-feed__txt">
                                  <b>{f.me ? 'Tú' : f.name}</b> {before || f.amount > min ? (f.me ? 'subes a' : 'sube a') : f.me ? 'abres con' : 'abre con'}
                                  <small>
                                    {before ? `+${eur(f.amount - before.amount)} · ` : ''}
                                    {secsAgo < 60 ? `hace ${secsAgo} s` : `hace ${Math.round(secsAgo / 60)} min`}
                                  </small>
                                </span>
                                <em>{eur(f.amount)}</em>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </div>
                    <div className="au-rank">
                      <h2>Quién puja más</h2>
                      {rank.length === 0 ? (
                        <p className="au-empty">Sin pujadores.</p>
                      ) : (
                        <ol style={{ '--n': top.length }}>
                          {top.map((r, i) => (
                            <li
                              key={r.name}
                              className={`${r.me ? 'is-me' : ''} ${r.pos === 1 ? 'is-first' : ''}`}
                              style={{ '--pos': i, '--w': r.amount / rankMax }}
                            >
                              <i className="au-rank__bar" />
                              <em>{r.pos}</em>
                              <Avatar name={r.name} src={r.avatar} size={22} />
                              <span>
                                {r.name}
                                {r.me && ' (tú)'}
                              </span>
                              <b>{eur(r.amount)}</b>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>

                  <div className="au-room" role="img" aria-label={`${bidders} pujadores`}>
                    <div className="au-paddles">
                      {rank.slice(0, MAX_PADDLES).map((r, i) => (
                        <span key={`${round}-${r.name}`} className={`au-paddle ${r.me ? 'is-me' : ''} ${i === 0 ? 'is-first' : ''}`} style={{ '--k': i % 5 }}>
                          <i>{r.me ? 'TÚ' : ''}</i>
                        </span>
                      ))}
                      {bidders === 0 && <p className="au-empty">Ninguna paleta en alto todavía</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Las siete cajas: cada una con su aspecto, su premio máximo y lo rara que es */}
            <ul className="au-tiers" aria-label="Las cajas de la subasta">
              {TIER_ORDER.map((id) => (
                <li key={id} className={`au-t--${id} ${id === tier ? 'is-now' : ''}`} title={`${TIERS[id].name}: ${rarity(TIERS[id].weight)} · ${oneIn(TIERS[id].weight).toLowerCase()}`}>
                  <Mini tier={id} />
                  <span>
                    <b>{TIERS[id].name.replace('Caja de ', '').replace('Caja ', '').replace('Cofre ', '')}</b>
                    <small>hasta {maxPrize(id) / 1000}k €</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="s3__panel au-panel">
          {/* Mando de puja: en móvil va fijo abajo para tener siempre el botón a mano */}
          <div className={`au-dock is-${mode}`}>
            <div className="au-alert" key={`${mode}-${leader?.name ?? ''}`} aria-live="polite">
              {mode === 'out' && (
                <>
                  <b>¡Te han superado!</b>
                  <span>
                    {leader.name} va primero con {eur(leader.amount)}. Recupera el primer puesto.
                  </span>
                </>
              )}
              {mode === 'lead' && (
                <>
                  <b>¡Vas primero!</b>
                  <span>
                    {lastCall ? `Cierra en ${left} s si nadie te supera` : `La subasta cierra en ${left} s`}
                    {extended && ' · prórroga'}
                  </span>
                </>
              )}
              {mode === 'idle' && (
                <>
                  <b>{leader ? 'Entra en la subasta' : 'Sé el primero'}</b>
                  <span>
                    {lastCall ? `Quedan ${left} s: tu puja alarga la subasta ${SNIPE_MS / 1000} s.` : leader ? `${leader.name} va primero con ${eur(leader.amount)}.` : `Puja mínima ${eur(min)}.`}
                  </span>
                </>
              )}
              {mode === 'closed' && (
                <>
                  <b>{phase === 'wait' ? 'Un momento…' : 'Pujas cerradas'}</b>
                  <span>{phase === 'reveal' ? `La siguiente caja sale en ${left} s.` : 'Se abre la caja…'}</span>
                </>
              )}
            </div>
            <button type="button" className="au-go" disabled={!bidding || sending || iLead || poor} onClick={bid}>
              {label}
            </button>
            <div className="s3__quick au-raises" aria-label="Subir más">
              {steps.map((r) => (
                <button key={r} type="button" disabled={!bidding || iLead} onClick={() => setAmount(Math.min(MAX_BID, target + r))}>
                  +{short(r)}
                </button>
              ))}
              <button type="button" className="au-reset" disabled={!bidding || iLead || target === next} onClick={() => setAmount(0)}>
                Mín.
              </button>
            </div>
            <p className="au-pay">
              {bidding && !iLead ? (
                <>
                  {mine ? (
                    <>
                      Pagas <b>{eur(cost)}</b> más (ya tienes {eur(mine)}).
                    </>
                  ) : (
                    <>
                      Pagas <b>{eur(cost)}</b> ahora.
                    </>
                  )}{' '}
                  Si no ganas, te devuelven <b>{eur(target)}</b>.
                </>
              ) : bidding && iLead ? (
                <>
                  Tienes <b>{eur(mine)}</b> puestos: si te superan, te los devuelven al cerrar.
                </>
              ) : result && mine > 0 ? (
                result.winner?.me ? (
                  <>Pagaste {eur(mine)} por la caja.</>
                ) : (
                  <>Tu puja de {eur(mine)} se te ha devuelto entera.</>
                )
              ) : (
                <>Cuando se cierre se abre la caja delante de todos.</>
              )}
            </p>
          </div>

          <div className="s3__group au-hist-box">
            <h2>Últimas subastas</h2>
            {history.length === 0 ? (
              <p className="s3__hint">Todavía no se ha cerrado ninguna esta semana.</p>
            ) : (
              <>
                <div className="au-hist" role="img" aria-label="Puja ganadora contra valor real de las últimas subastas">
                  {[...history].reverse().map((h) => {
                    const win = h.amount - h.winner.bid > 0
                    return (
                      <div key={h.round} className={`${win ? 'is-win' : 'is-lose'} au-t--${h.tier}`} title={`${TIERS[h.tier].name}: pagó ${eur(h.winner.bid)} · valía ${eur(h.amount)}`}>
                        <span className="au-hist__bars">
                          <i className="is-bid" style={{ '--h': h.winner.bid / histMax }} />
                          <i className="is-real" style={{ '--h': h.amount / histMax }} />
                        </span>
                        <Mini tier={h.tier} />
                      </div>
                    )
                  })}
                </div>
                <p className="au-legend">
                  <span className="is-bid">Puja ganadora</span>
                  <span className="is-real">Valor real</span>
                </p>
                <ul className="auction__history au-last">
                  {history.map((h) => {
                    const p = PRIZES[h.prize]
                    const net = h.amount - h.winner.bid
                    return (
                      <li key={h.round} className={`${net > 0 ? 'is-win' : 'is-lose'} ${p.mult >= 8 ? 'is-big' : ''}`}>
                        <Mini tier={h.tier} />
                        <span>
                          <b>{h.winner.name}</b> pagó {eur(h.winner.bid)} por {p.icon} {p.name.toLowerCase()}
                          <small>
                            {TIERS[h.tier].name} · {net >= 0 ? `ganó ${eur(net)}` : `perdió ${eur(-net)}`} · {h.bids} {h.bids === 1 ? 'pujador' : 'pujadores'}, {h.raises} pujas
                          </small>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>

      {burst && <WinBurst key={burst.id} amount={burst.amount} caption={burst.caption} coins={50} big who={juegos.me?.name} tags={burst.tags} />}
    </main>
  )
}

export default Auction
