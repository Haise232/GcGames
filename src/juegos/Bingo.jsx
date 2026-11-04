import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BALLS, BALL_MS, BINGO_PCT, BUY_MS, COLS, LINE_PCT, KINDS, MAX_CARDS, POT_BALL, POT_PCT, ROWS, ROUND_MS, colOf, drawStart, isPremium, marksOf, missing, phaseAt, positions, startOf } from './bingo.js'
import { eur } from './money.js'
import { isMuted, playCash, playChip, playWin, setMuted } from './sound.js'
import { useCountUp } from './useCountUp.js'
import BingoCage from './BingoCage.jsx'
import WinBurst from './WinBurst.jsx'
import WinToast from './WinToast.jsx'
import Help from './Help.jsx'
import './Bingo.css'

const POLL_MS = 5000 // la jaula y los cartones vendidos se refrescan solos mientras la pantalla está a la vista
const REVEAL_SYNC_MS = 1300 // al cerrarse la venta el servidor suelta el orden de las bolas (a los 1.000 ms)
const PAY_SYNC_MS = 1800 // y paga un poco después de la bola del bingo
const RECENT = 5
// Color de las bolas por decena, como en las salas de bingo.
const TONES = ['#e2463c', '#f08a24', '#e8c22c', '#4fb34a', '#1fa3a3', '#2f7be0', '#7a55d6', '#c94fb0', '#8a6a4a']
const CARD_TONES = ['#c2332c', '#2f6fd0', '#1e8a5a', '#8a4fd6']

const plural = (n, one, many) => `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`
const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : `${items[0] ?? ''}`)
const clockOf = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const namesOf = (list) => [...new Set(list.map((w) => (w.me ? 'tú' : w.name)))]

function Ball({ n, size = 'md', fresh = false, golden = false }) {
  return (
    <span className={`bball bball--${size} ${fresh ? 'bball--fresh' : ''} ${golden ? 'bball--golden' : ''}`} style={{ '--tone': TONES[colOf(n)] }}>
      <b>{n}</b>
    </span>
  )
}

// Un cartón como los de papel: 3 filas de 9, con los números marcados con rotulador según salen.
function Card({ cells, drawn, index, latest, won, over, premium, golden, gift }) {
  const left = missing(cells, drawn)
  const serial = String(cells.reduce((a, n, i) => (a * 31 + n * (i + 7)) % 99991, 7)).padStart(5, '0')
  const rows = Array.from({ length: ROWS }, (_, r) => cells.slice(r * COLS, r * COLS + COLS))
  let hint = `Faltan ${left.bingo}`
  if (won) hint = won
  else if (over) hint = 'Partida terminada'
  else if (left.bingo === 1) hint = '¡Te falta 1 para bingo!'
  else if (left.line === 1) hint = '¡Te falta 1 para línea!'
  return (
    <figure
      className={`bcard ${premium ? 'bcard--premium' : ''} ${won ? 'bcard--won' : ''} ${left.bingo === 1 && !won && !over ? 'bcard--hot' : ''}`}
      style={{ '--card': premium ? '#a8761a' : CARD_TONES[index % CARD_TONES.length] }}
    >
      <figcaption>
        <span>
          {premium ? `★ Premium ${index + 1}` : `Cartón ${index + 1}`}
          {gift && ' · Regalo'}
        </span>
        <small>Nº {serial}</small>
        <em>{hint}</em>
      </figcaption>
      <div className="bcard__grid" role="table" aria-label={`Cartón ${index + 1}`}>
        {rows.map((row, r) => {
          const full = row.every((n) => n === 0 || drawn.has(n))
          return (
            <div key={r} role="row" className={`bcard__row ${full ? 'bcard__row--full' : ''}`}>
              {row.map((n, c) => (
                <span
                  key={c}
                  role="cell"
                  className={`bcard__cell ${n === 0 ? 'bcard__cell--blank' : ''} ${n && drawn.has(n) ? 'is-hit' : ''} ${n && n === latest ? 'is-latest' : ''} ${n && n === golden ? 'is-golden' : ''}`}
                >
                  {n || ''}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </figure>
  )
}

// El panel de la sala con los 90 números: los que ya han salido, encendidos.
function Board({ drawn, latest, golden }) {
  return (
    <div className="bboard" aria-label={`${drawn.size} de ${BALLS} bolas`}>
      {Array.from({ length: BALLS }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`bboard__n ${drawn.has(n) ? 'is-on' : ''} ${n === latest ? 'is-latest' : ''} ${n === golden ? 'is-golden' : ''}`}
          style={{ '--tone': TONES[colOf(n)] }}
        >
          {n}
        </span>
      ))}
    </div>
  )
}

// La barra de las 90 bolas, con la zona del bote (hasta la bola POT_BALL) en dorado.
function Track({ count, end, potOpen }) {
  return (
    <div className="btrack" aria-hidden="true">
      {potOpen && (
        <span className="btrack__pot" style={{ width: `${(POT_BALL / BALLS) * 100}%` }}>
          <em>Bote hasta la {POT_BALL}</em>
        </span>
      )}
      <span className={`btrack__fill ${count > POT_BALL ? 'is-late' : ''}`} style={{ width: `${(count / BALLS) * 100}%` }} />
      {end !== null && <span className="btrack__end" style={{ left: `${(end / BALLS) * 100}%` }} />}
    </div>
  )
}

function Bingo({ onExit, juegos }) {
  const { request } = juegos
  const [live, setLive] = useState(null) // última respuesta del servidor
  const [sound, setSound] = useState(() => !isMuted())
  const [buying, setBuying] = useState(false)
  const [want, setWant] = useState(1)
  const [kind, setKind] = useState('simple')
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])

  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'bingo', ...message })
      const got = Date.now()
      if (body?.bingo) {
        if (skew.current === null || got - sent < 1500) skew.current = body.bingo.now - (sent + got) / 2
        setLive(body.bingo)
      }
      return body
    },
    [request],
  )

  // Cuatro veces por segundo: cuenta atrás y bolas.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    ask({ a: 'sync' })
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') ask({ a: 'sync' })
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') ask({ a: 'sync' })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ask])

  const t = clock()
  const { round } = phaseAt(t)
  const ready = skew.current !== null && live !== null
  const view = live?.round === round ? live : null
  const draw = view?.draw ?? null
  const start = drawStart(round)
  const buyOpen = t < start
  const end = draw ? (draw.bingoBall ?? BALLS) : null
  const count = draw ? Math.max(0, Math.min(end, Math.floor((t - start) / BALL_MS))) : 0
  const order = draw?.order
  const drawnList = useMemo(() => (order ? order.slice(0, count) : []), [order, count])
  const drawn = useMemo(() => new Set(drawnList), [drawnList])
  const latest = drawnList.at(-1) ?? null
  const lineHit = Boolean(draw?.lineBall) && count >= draw.lineBall
  const bingoHit = Boolean(draw?.bingoBall) && count >= draw.bingoBall
  // La banca decide cuándo se puede llevar el bote: ¿lo da esta partida? (y si está abierto ahora mismo).
  const potOpen = view ? Boolean(view.potOpen) : Boolean(live?.bote?.abierto)
  const potNow = live?.bote ?? null
  const cards = view?.cards ?? []
  const prices = view?.prices ?? []
  const free = view?.free ?? []
  const bought = cards.filter((_, i) => !free[i]).length // los regalos del Admin Abuse no cuentan para el máximo
  // La bola dorada solo se enseña cuando sale (la pantalla ya la conoce, pero así hay sorpresa).
  const golden = draw?.golden && drawn.has(draw.golden) ? draw.golden : null
  const price = KINDS[kind].price
  const pot = live?.pot ?? juegos.lobby?.bingo?.pot ?? 0
  const shownPot = useCountUp(pot, 1200)
  const balance = juegos.me?.balance ?? 0
  const room = MAX_CARDS - (buyOpen ? bought : MAX_CARDS)
  const amount = Math.min(want, Math.max(1, room))

  // Pide al servidor justo cuando salen las bolas y cuando toca cobrar, sin esperar al siguiente refresco.
  useEffect(() => {
    if (!ready) return
    const at = draw ? (draw.bingoBall ? start + draw.bingoBall * BALL_MS + PAY_SYNC_MS : null) : start + REVEAL_SYNC_MS
    if (at === null) return
    const wait = at - clock()
    if (wait < 0 || wait > ROUND_MS) return
    const timer = setTimeout(() => ask({ a: 'sync' }), wait)
    return () => clearTimeout(timer)
  }, [ready, draw, start, ask, clock])

  // Sonidos: cada bola, la línea y el bingo.
  useEffect(() => {
    if (latest !== null) playChip()
  }, [latest])
  const lineKey = lineHit ? round : null
  useEffect(() => {
    if (lineKey !== null) playCash(2)
  }, [lineKey])
  const bingoKey = bingoHit ? round : null
  useEffect(() => {
    if (bingoKey !== null) playWin(Boolean(draw?.jackpot))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bingoKey])

  async function buy() {
    if (buying || !buyOpen || amount < 1) return
    setBuying(true)
    await ask({ a: 'buy', n: amount, kind })
    setBuying(false)
    setWant(1)
  }

  // La bola dorada, al salir.
  const goldenKey = golden !== null ? round : null
  useEffect(() => {
    if (goldenKey !== null) playCash(3)
  }, [goldenKey])

  // Lo que han ganado otros: se anuncia al salir su bola.
  const others = useMemo(() => {
    if (!draw) return []
    const out = []
    const add = (list, what) =>
      list
        .filter((w) => !w.me)
        .forEach((w, i) => out.push({ key: `${round}-${what}-${w.name}-${i}`, name: w.name, amount: w.amount, detail: `con ${what === 'line' ? 'una línea' : 'un bingo'}` }))
    if (lineHit) add(draw.line, 'line')
    if (bingoHit) add(draw.bingo, 'bingo')
    return out
  }, [draw, lineHit, bingoHit, round])

  const mine = view?.last?.round === round && bingoHit ? view.last : null
  const won = mine && mine.payout > 0

  // Qué cartón ganó qué (para marcarlo): con qué bola completó cada uno la línea y el bingo.
  const marks = useMemo(() => {
    if (!order) return []
    const pos = positions(order)
    return cards.map((cells) => marksOf(cells, pos))
  }, [order, cards])
  const cardWon = (i) => {
    const m = marks[i]
    if (!m) return null
    if (bingoHit && m.bingo === draw.bingoBall) return draw.jackpot ? (draw.goldenHit ? '¡Bola dorada: bote!' : '¡Bingo y bote!') : '¡Bingo!'
    if (lineHit && m.line === draw.lineBall) return '¡Línea!'
    return null
  }

  let call = 'Conectando con la sala…'
  let detail = ''
  if (ready) {
    if (buyOpen) {
      call = 'Venta de cartones'
      detail = `Empieza en ${clockOf(start - t)} · ${plural(view?.sold ?? 0, 'cartón vendido', 'cartones vendidos')}`
    } else if (!draw) {
      call = 'No va más'
      detail = 'Cerrando la venta…'
    } else if (draw.bingoBall === null) {
      call = count ? `Bola ${count}` : 'Sin cartones'
      detail = `Nadie compró cartones en esta partida. La siguiente empieza en ${clockOf(startOf(round + 1) - t)}.`
    } else if (bingoHit) {
      call = '¡Bingo!'
      const who = namesOf(draw.bingo)
      const how = draw.jackpot ? (draw.goldenHit ? ' ¡con la bola dorada! Se lleva el bote' : ' ¡y se lleva el bote!') : ''
      detail = `${listOf(who)} con la bola ${draw.bingoBall}${how} · Siguiente partida en ${clockOf(startOf(round + 1) - t)}`
    } else {
      call = count ? `Bola ${count}` : 'Sale la primera bola…'
      detail = lineHit
        ? `Línea para ${listOf(namesOf(draw.line))}. Ahora, a por el bingo${potOpen && count < POT_BALL ? ` (bote hasta la bola ${POT_BALL})` : ''}.`
        : 'Se juega la línea.'
      if (latest === golden && golden !== null && potOpen) detail = `¡Bola dorada: el ${golden}! Si cierra un bingo, se lleva el bote.`
    }
    if (juegos.error) detail = juegos.error
  }

  const history = live?.history ?? []

  return (
    <main className="app bingo-live">
      <header className="top">
        <h1>Bingo</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(balance)}</dd>
            </div>
            <div>
              <dt>Tus cartones</dt>
              <dd>
                {bought}
                <small>de {MAX_CARDS}{cards.length > bought ? ` +${cards.length - bought} de regalo` : ''}</small>
              </dd>
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
                Bingo de 90 bolas en vivo: una partida para todos cada {ROUND_MS / 60000} minutos. Durante la venta ({BUY_MS / 1000} s) compras
                hasta {MAX_CARDS} cartones; luego sale una bola cada {BALL_MS / 1000} s y tus cartones se marcan solos.
              </p>
              <p>
                <b>Simple ({eur(KINDS.simple.price)}) y Premium ({eur(KINDS.premium.price)}):</b> el premium cobra los premios enteros. Si en la
                partida hay algún premium, el simple cobra la quinta parte de lo que gane (lo que vale en proporción) y el resto va a la jaula.
                Si solo hay simples, cobran entero.
              </p>
              <p>
                <b>Línea:</b> el primer cartón que completa una fila se lleva el {LINE_PCT}% de lo vendido. <b>Bingo:</b> el primero que completa el
                cartón entero se lleva el {BINGO_PCT}%. Si hay empate se reparte.
              </p>
              <p>
                <b>El bote:</b> el {POT_PCT}% de cada cartón y todo lo que se pierde en el resto del casino (Plinko, Cohete, Rana, Pez Gordo,
                Carrera y Blackjack) va a la jaula, y también lo que cobra Hacienda a quien pasa de 100.000 €. Se la lleva quien cante bingo con la bola {POT_BALL} o antes, o justo con la{' '}
                <b>bola dorada</b>: una de las 90, distinta en cada partida, que brilla al salir (~1 partida de cada 90).
              </p>
              <p>
                La banca decide cuándo está abierto el bote. Mientras está cerrado nadie se lo lleva y la jaula sigue creciendo; lo
                verás arriba, junto al bote. La jaula se vacía con el reinicio del domingo, como los saldos.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className={`bingo fill ${buyOpen ? 'bingo--buying' : ''}`}>
        <section className="bingo__pot" aria-labelledby="bingo-pot">
          <BingoCage pot={pot} className="bingo__cage" />
          <p className="bingo__potline">
            <small id="bingo-pot">Bote en la jaula</small>
            <strong>{eur(shownPot)}</strong>
            <span>
              {potNow?.abierto
                ? `Bote abierto${potNow.una ? ' hasta que alguien se lo lleve' : ''}: para quien cante bingo con la bola ${POT_BALL} o antes, o con la bola dorada`
                : 'Bote cerrado ahora: la jaula sigue creciendo hasta que la banca lo abra'}
            </span>
          </p>
          {history.length > 0 && (
            <ol className="bingo__history" aria-label="Últimas partidas">
              {history.slice(0, 4).map((h) => (
                <li key={h.round} className={h.jackpot > 0 ? 'is-jackpot' : ''}>
                  <b>{h.bingo.length ? listOf(h.bingo) : 'Sin cartones'}</b>
                  <span>{h.bingoBall ? `bingo con la ${h.bingoBall}` : '—'}</span>
                  {h.jackpot > 0 && <em>{h.golden ? 'Bola dorada · ' : ''}Bote: {eur(h.jackpot)}</em>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="bingo__hall">
          <div className="bingo__caller">
            <div className={`bingo__ball ${buyOpen ? 'is-waiting' : ''}`}>
              {latest !== null ? <Ball key={latest} n={latest} size="xl" fresh golden={latest === golden} /> : <span className="bball bball--xl bball--empty">{buyOpen ? clockOf(start - t) : '…'}</span>}
            </div>
            <div className="bingo__call" aria-live="polite">
              <strong className={bingoHit ? 'is-bingo' : ''}>{call}</strong>
              <span>{detail}</span>
              <ol className="bingo__recent" aria-label="Últimas bolas">
                {drawnList
                  .slice(-RECENT - 1, -1)
                  .reverse()
                  .map((n) => (
                    <li key={n}>
                      <Ball n={n} size="sm" golden={n === golden} />
                    </li>
                  ))}
              </ol>
            </div>
          </div>
          <Track count={count} end={bingoHit ? draw.bingoBall : null} potOpen={potOpen} />
          <div className="bingo__boardwrap">
            <Board drawn={drawn} latest={latest} golden={golden} />
          </div>
          <p className="bingo__players">
            {view ? `${plural(view.players ?? 0, 'jugador', 'jugadores')} · ${plural(view.sold ?? 0, 'cartón', 'cartones')} en juego` : 'Sala en vivo'}
          </p>
        </section>

        <section className="bingo__mine" aria-label="Tus cartones">
          <div className={`bingo__buy ${buyOpen ? '' : 'is-closed'}`}>
            {buyOpen ? (
              <>
                <div className="bingo__kinds" role="radiogroup" aria-label="Tipo de cartón">
                  {Object.entries(KINDS).map(([id, k]) => (
                    <button key={id} type="button" role="radio" aria-checked={kind === id} className={`bingo__kind bingo__kind--${id}`} onClick={() => setKind(id)}>
                      <b>{k.name}</b>
                      <small>{eur(k.price)}</small>
                    </button>
                  ))}
                </div>
                <div className="bingo__stepper" role="group" aria-label="Cartones a comprar">
                  <button type="button" disabled={amount <= 1} onClick={() => setWant(amount - 1)} aria-label="Uno menos">
                    −
                  </button>
                  <output>{room > 0 ? amount : 0}</output>
                  <button type="button" disabled={amount >= room} onClick={() => setWant(amount + 1)} aria-label="Uno más">
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={!ready || buying || room < 1 || balance < amount * price}
                  onClick={buy}
                >
                  {room < 1
                    ? 'Ya tienes los 4 cartones'
                    : balance < amount * price
                      ? 'Saldo insuficiente'
                      : `Comprar ${amount === 1 ? '1' : amount} · ${eur(amount * price)}`}
                </button>
              </>
            ) : (
              <p>{cards.length ? 'Venta cerrada: tus cartones se marcan solos.' : `Venta cerrada. La próxima partida empieza en ${clockOf(startOf(round + 1) - t)}.`}</p>
            )}
          </div>
          {cards.length === 0 ? (
            <div className="bingo__empty">
              <span className="bcard__ghost" aria-hidden="true" />
              <p>{buyOpen ? 'Compra un cartón para jugar esta partida.' : 'Sin cartones en esta partida.'}</p>
            </div>
          ) : (
            <div className={`bingo__cards bingo__cards--${cards.length}`}>
              {cards.map((cells, i) => (
                <Card
                  key={i}
                  cells={cells}
                  drawn={drawn}
                  index={i}
                  latest={latest}
                  won={cardWon(i)}
                  over={bingoHit}
                  premium={isPremium(prices[i] ?? 0)}
                  golden={golden}
                  gift={free[i]}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {won && (
        <WinBurst
          key={round}
          amount={mine.payout + (mine.abuse ?? 0)}
          caption={mine.pot > 0 ? (draw?.goldenHit ? '¡Bola dorada! Te llevas el bote' : '¡Te llevas el bote del bingo!') : mine.bingo > 0 ? `Bingo con la bola ${mine.bingoBall}` : 'Has cantado línea'}
          coins={Math.min(70, mine.pot > 0 ? 70 : 30)}
          big={mine.pot > 0}
          who={juegos.me?.name}
          tags={[mine.line > 0 && `Línea: ${eur(mine.line)}`, mine.bingo > 0 && `Bingo: ${eur(mine.bingo)}`, mine.pot > 0 && `Bote: ${eur(mine.pot)}`, mine.abuse > 0 && `Admin Abuse: +${eur(mine.abuse)}`].filter(Boolean)}
        />
      )}
      <WinToast wins={others} />
    </main>
  )
}

export default Bingo
