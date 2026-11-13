// Feria de las Islas: la sala, el tablero (Tablero.jsx) con los dados, las fichas a saltitos, el boleto para comprar o
// mejorar y los duelos, y al lado la cabecera, tus perras y la clasificación. El servidor manda: los dados y los
// movimientos llegan en cur.steps al empezar la ronda y todo lo que se ve cuelga del reloj del servidor (rel = ahora −
// cur.at). Las animaciones nunca cambian el estado ni retrasan cuándo se puede decidir.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BOARD,
  CARDS,
  DECIDE_MS,
  DUEL_MS,
  ENTRY,
  FULL_LEVEL,
  GO_BONUS,
  GRACE_MS,
  ISLANDS,
  MAX_LEVEL,
  MAX_TAPS,
  MIN_PLAYERS,
  MOVE_MS,
  RENT_MULT,
  ROUNDS,
  ROUND_MODES,
  SEATS,
  SIZE,
  START_CASH,
  TAP_RATE,
  TAX,
  hasIsland,
  potOf,
  rentOf,
  stallsOf,
  upgradeCost,
} from './feria.js'
import { AwningArt, Casillas, IslandArt, Jar, Logo, SEAT_COLORS, SEAT_INK, TRACK, anchorOf, slotOf } from './Tablero.jsx'
import * as fx from './feriaFx.js'
import { ropeAt } from '../soga/soga.js'
import { Cuerda, TapPad, useTaps } from '../soga/Cuerda.jsx'
import { useEnVivo } from '../comun/useEnVivo.js'
import { eur } from '../comun/money.js'
import {
  isMuted,
  playAww,
  playBeep,
  playCard,
  playCash,
  playCheer,
  playChip,
  playClunk,
  playCoin,
  playDiceHit,
  playDoubles,
  playGo,
  playLand,
  playLose,
  playPass,
  playRattle,
  playStamp,
  playStep,
  playTick,
  playWin,
  setMuted,
} from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import './Feria.css'

const TOPIC = 'juegos-feria'
const DICE_MS = 1500 // los dados ruedan
const WALK_MS = MOVE_MS - DICE_MS - 500 // las fichas andan (acaban como tarde a OPEN_MS)
const OPEN_MS = MOVE_MS - GRACE_MS // desde aquí el servidor ya acepta comprar o pasar
const STAGGER = 45 // escalonado entre fichas: la tuya sale la primera
const MAX_LAG = 700 // si la ronda llega tarde (hasta esto), los dados empiezan al llegar y las fichas andan más deprisa
const POLL_MS = 5000
const IDLE_POLL_MS = 12000
const SHOUT_MS = 250
const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,400..900,0..100,0..1;1,9..144,400..900,0..100,0..1&family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap'

const perras = (n) => `${Math.round(n).toLocaleString('es-ES', { useGrouping: 'always' })} 🪙`
const num = (n) => Math.round(n).toLocaleString('es-ES', { useGrouping: 'always' })
const signed = (n) => `${n >= 0 ? '+' : '−'}${perras(Math.abs(n))}`
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000))
const ordinal = (n) => `${n}.º`
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
// Duración aproximada de una partida según las rondas (unos 12 s por ronda, contando duelos).
const minutesOf = (rounds) => Math.max(2, Math.round((rounds * 12) / 60))
const tapCap = (ms) => Math.max(0, Math.min(MAX_TAPS, Math.ceil((ms / 1000) * TAP_RATE)))
const initial = (name) => (name ?? '?').trim().charAt(0).toUpperCase() || '?'

// Las fuentes del tablero (Fraunces para los rótulos, Bricolage Grotesque para las casillas), de Google Fonts.
function useFonts() {
  useEffect(() => {
    if (document.getElementById('fe-fonts')) return
    const pre = document.createElement('link')
    pre.rel = 'preconnect'
    pre.href = 'https://fonts.gstatic.com'
    pre.crossOrigin = ''
    const link = document.createElement('link')
    link.id = 'fe-fonts'
    link.rel = 'stylesheet'
    link.href = FONTS
    document.head.append(pre, link)
  }, [])
}

// Repinta con cada cuadro mientras hay algo moviéndose (dados, fichas, duelo) y cada ms el resto del tiempo.
function useFrame(fast, ms) {
  const [, setFrame] = useState(0)
  useEffect(() => {
    let id
    if (fast) {
      const loop = () => {
        setFrame((n) => (n + 1) % 1000000)
        id = requestAnimationFrame(loop)
      }
      id = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(id)
    }
    id = setInterval(() => setFrame((n) => (n + 1) % 1000000), ms)
    return () => clearInterval(id)
  }, [fast, ms])
}

// ---------- Paso a paso ----------
// El orden de salida: tú primero, luego los demás por asiento.
const orderOf = (n, me) => [...(me >= 0 && me < n ? [me] : []), ...Array.from({ length: n }, (_, s) => s).filter((s) => s !== me)]
// Cuándo da cada paso una ficha (en ms desde cur.at + lag): cada paso, un salto de hasta 300 ms (más cortos si hay
// muchos); los dos últimos de tu ficha, un 20 % más largos (frena antes de llegar).
function planOf(step, o, mine, lag) {
  const n = step.dice[0] + step.dice[1]
  const delay = o * STAGGER
  const budget = WALK_MS - lag - delay
  const unit = Math.min(300, budget / (mine ? n + 0.4 : n))
  const starts = []
  const ends = []
  let at = DICE_MS + delay
  for (let k = 0; k < n; k++) {
    const dur = mine && k >= n - 2 ? unit * 1.2 : unit
    starts.push(at)
    at += dur
    ends.push(at)
  }
  return { n, unit, starts, ends, land: ends[n - 1], hop: mine ? 2.6 : 1.4 }
}
const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) ** 2)
// Dónde está una ficha en el instante vrel: quieta en una casilla o a medio salto entre dos.
function tokenState(step, plan, vrel) {
  if (vrel < plan.starts[0]) return { rest: step.from }
  if (vrel >= plan.land) return { rest: step.to }
  let k = 0
  while (k < plan.n - 1 && vrel >= plan.ends[k]) k++
  const f = clamp((vrel - plan.starts[k]) / (plan.ends[k] - plan.starts[k]), 0, 1)
  return { a: (step.from + k) % SIZE, b: (step.from + k + 1) % SIZE, f, k: k + 1 }
}
// Estirón en el aire y aplastón al caer.
function squash(f) {
  if (f < 0.5) return [1 - 0.16 * f, 1 + 0.24 * f]
  if (f < 0.9) {
    const g = (f - 0.5) / 0.4
    return [0.92 + 0.2 * g, 1.12 - 0.24 * g]
  }
  const g = (f - 0.9) / 0.1
  return [1.12 - 0.12 * g, 0.88 + 0.12 * g]
}

// ---------- Texto de lo que pasa ----------
const Amt = ({ n }) => <span className={n >= 0 ? 'is-plus' : 'is-minus'}>{signed(n)}</span>

// Qué le ha pasado a un jugador en esta ronda, en una frase.
function eventText(v, seat) {
  const step = v.cur.steps[seat]
  const ev = step.ev
  const sq = BOARD[step.to]
  const you = seat === v.seat
  const who = <b>{v.players[seat].name}</b>
  const offer = v.cur.offers[seat]
  switch (ev?.k) {
    case 'rent': {
      const owner = ev.to === v.seat ? 'ti' : <b>{v.players[ev.to].name}</b>
      return you ? (
        <>
          Pagas a {owner} por {sq.name} <Amt n={-ev.amount} />
        </>
      ) : (
        <>
          {who} paga a {owner} en {sq.name} <Amt n={-ev.amount} />
        </>
      )
    }
    case 'buy':
      if (offer?.done) return you ? <>Has comprado {sq.name} <Amt n={-offer.cost} /></> : <>{who} compra {sq.name} <Amt n={-offer.cost} /></>
      if (offer?.passed) return you ? `Dejas pasar ${sq.name}` : <>{who} deja pasar {sq.name}</>
      return you ? `${sq.name} está libre` : <>{who} cae en {sq.name}, libre</>
    case 'up':
      if (offer?.done) return you ? <>Has mejorado {sq.name} <Amt n={-offer.cost} /></> : <>{who} mejora {sq.name} <Amt n={-offer.cost} /></>
      return you ? `Estás en tu puesto: ${sq.name}` : <>{who} visita su puesto</>
    case 'home':
      if (you && ev.lock) return `${sq.name}: para el nivel ${FULL_LEVEL} te falta la isla entera`
      return you ? `Estás en tu puesto: ${sq.name}` : <>{who} visita su puesto</>
    case 'duel':
      return you ? `¡Duelo por ${sq.name}!` : <>{who} se juega {sq.name}</>
    case 'card':
      return (
        <>
          {you ? '' : <>{who}: </>}
          {CARDS[ev.card].text} <Amt n={ev.amount} />
        </>
      )
    case 'tax':
      return you ? <>Tasa de la feria <Amt n={-ev.amount} /></> : <>{who} paga la tasa <Amt n={-ev.amount} /></>
    case 'bote':
      return you ? <>¡Verbena! Te llevas el bote <Amt n={ev.amount} /></> : <>{who} se lleva el bote <Amt n={ev.amount} /></>
    default:
      return you ? 'Descansas en el Muelle' : <>{who} descansa en el Muelle</>
  }
}

// ---------- Dados 3D ----------
const DOTS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }
// Giro del cubo que deja la cara n de frente (las opuestas suman 7).
const ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] }
const Face = ({ n, me }) => (
  <span className={`fe-face fe-face--${n}`}>
    {Array.from({ length: 9 }, (_, i) => (
      <i key={i} className={DOTS[n].includes(i + 1) ? (me && n === 5 && i === 4 ? 'on is-red' : 'on') : ''} />
    ))}
  </span>
)
function Die({ value, me, dieRef, cubeRef, shaking }) {
  return (
    <span className={`fe-die3 ${shaking ? 'is-shaking' : ''}`} ref={dieRef}>
      <i className="fe-die3__shadow" />
      <span className="fe-cube" ref={cubeRef}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face key={n} n={n} me={me} />
        ))}
      </span>
    </span>
  )
}
// Los dos dados caen, rebotan y acaban exactamente en lo que ha salido. start: la hora (del servidor) a la que empiezan;
// si se llega tarde se salta lo ya pasado, y si ya han caído salen quietos.
const Dados = memo(function Dados({ dice, start, clock, me, reduce, shaking }) {
  const wa = useRef(null)
  const wb = useRef(null)
  const ca = useRef(null)
  const cb = useRef(null)
  useLayoutEffect(() => {
    if (!dice) return
    const els = [
      [wa.current, ca.current, dice[0], -1, 0],
      [wb.current, cb.current, dice[1], 1, 120],
    ]
    const elapsed = clock() - start
    const anims = []
    for (const [w, c, val, dir, delay] of els) {
      if (!w || !c) continue
      const [rx, ry] = ROT[val]
      c.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
      if (reduce || elapsed >= DICE_MS) {
        w.style.opacity = '1'
        continue
      }
      const size = w.offsetWidth || 60
      const toX = dir * size * 0.72
      const fromX = dir * size * 1.6
      const T = DICE_MS - 120
      const x = (f) => fromX + (toX - fromX) * f
      anims.push(
        w.animate(
          [
            { translate: `${fromX}px ${-size * 3.6}px`, scale: '1.5', opacity: 0, offset: 0, easing: fx.EASE.gravity },
            { opacity: 1, offset: 0.06 },
            { translate: `${x(0.5)}px 0px`, scale: '1', offset: 0.4, easing: fx.EASE.bounceUp },
            { translate: `${x(0.72)}px ${-size}px`, scale: '1.12', offset: 0.58, easing: 'cubic-bezier(.5,0,.8,.5)' },
            { translate: `${x(0.85)}px 0px`, scale: '1', offset: 0.7, easing: fx.EASE.bounceUp },
            { translate: `${x(0.93)}px ${-size * 0.3}px`, offset: 0.82, easing: 'cubic-bezier(.5,0,.8,.5)' },
            { translate: `${toX}px 0px`, scale: '1 .9', offset: 0.92 },
            { translate: `${toX}px 0px`, scale: '1', opacity: 1, offset: 1 },
          ],
          { duration: T, delay, fill: 'both' },
        ),
      )
      const turns = () => (2 + Math.floor(Math.random() * 3)) * 360
      anims.push(
        c.animate(
          [
            { transform: `rotateX(${rx - turns()}deg) rotateY(${ry - turns()}deg) rotateZ(-200deg)`, easing: 'cubic-bezier(.3,.6,.4,1)' },
            { transform: `rotateX(${rx - 180}deg) rotateY(${ry + 360}deg) rotateZ(0deg)`, offset: 0.6, easing: 'cubic-bezier(.2,.7,.4,1)' },
            { transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(0deg)` },
          ],
          { duration: T, delay, fill: 'both' },
        ),
      )
    }
    for (const a of anims) a.currentTime = Math.max(0, elapsed)
    return () => anims.forEach((a) => a.cancel())
    // Una vez por tirada: start identifica la ronda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, dice?.[0], dice?.[1], reduce])
  const shown = dice ?? [5, 2]
  return (
    <div className="fe-dice3" aria-hidden="true">
      <Die value={shown[0]} me={me} dieRef={wa} cubeRef={ca} shaking={shaking} />
      <Die value={shown[1]} me={me} dieRef={wb} cubeRef={cb} shaking={shaking} />
    </div>
  )
})

// ---------- El boleto del puesto ----------
// Un boleto de tómbola con la isla, el toldo, la escalera de alquileres y el precio. mode 'offer': con Comprar/Mejorar
// y Pasar (lo que te ha tocado); 'info': la ficha de la casilla que has tocado.
function Boleto({ sq, mode = 'info', kind = 'buy', cost, cash = 0, level = 0, owner, owners, bar, enabled = true, closing, stampColor, onTake, onPass, ticketRef, takeRef, me, players }) {
  const isl = ISLANDS[sq.island]
  const pos = stallsOf(sq.island).indexOf(sq.i) + 1
  const full = owner !== undefined && hasIsland(owners, owner, sq.island)
  const rents = [0, 1, 2, 3].map((l) => rentOf(sq.i, l, false))
  const max = rents[3]
  const next = mode === 'offer' && kind === 'up' ? level + 1 : -1
  const short = cost - cash
  const btn = useRef(null)
  useEffect(() => {
    if (mode === 'offer') playCard()
  }, [mode])
  const take = () => {
    if (!enabled) return
    if (short > 0) {
      fx.shake(btn.current)
      return
    }
    onTake?.()
  }
  return (
    <div className={`fe-ticket is-${mode} ${closing ? `is-closing-${closing}` : ''}`} ref={ticketRef} style={{ '--g': isl.color, '--gi': isl.ink }}>
      <div className="fe-ticket__flip">
        <div className="fe-ticket__back" />
        <div className="fe-ticket__front">
          <header className="fe-ticket__head">
            <IslandArt k={sq.island} className="fe-ticket__isl" />
            <small>
              {isl.name} · puesto {pos}/3
            </small>
            <b>{sq.name}</b>
          </header>
          <div className="fe-ticket__body">
            <AwningArt className="fe-ticket__art" c1={owner !== undefined ? SEAT_COLORS[owner] : '#efe3c4'} c2={owner !== undefined ? '#fff7e2' : '#d1bf92'} />
            {mode === 'info' && (
              <p className="fe-ticket__who">
                {owner === undefined ? 'Libre' : `De ${owner === me ? 'ti' : players[owner]?.name}`}
                {owner !== undefined && ` · nivel ${level}`}
                {full && ' · ★ isla entera'}
              </p>
            )}
          </div>
          <ol className="fe-ladder" aria-label="Alquiler por nivel">
            {rents.map((r, l) => (
              <li key={l} className={`${l === next ? 'is-next' : ''} ${owner !== undefined && l === level ? 'is-now' : ''}`} style={{ '--f': r / max, '--d': `${180 + l * 60}ms` }}>
                <span>{l === 0 ? 'Alquiler' : `Nivel ${l}`}</span>
                <i />
                <b>{r}</b>
                {l === 0 && <em title="Con los tres puestos de la isla, sin mejorar">★ ×2 {rentOf(sq.i, 0, true)}</em>}
                {l === FULL_LEVEL && <em title="Solo con los tres puestos de la isla">★ isla</em>}
              </li>
            ))}
          </ol>
          <div className="fe-ticket__foot">
            <p className="fe-ticket__price">
              <span className="fe-perra" />
              {num(mode === 'offer' ? cost : sq.price)}
              <small>{mode === 'offer' && kind === 'up' ? `nivel ${level} → ${level + 1}` : `Mejora: ${upgradeCost(sq.i)}`}</small>
            </p>
            {mode === 'offer' && (
              <>
                {bar !== null && (
                  <i className="fe-tbar" role="progressbar" aria-label="Tiempo para decidir" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar * 100)}>
                    <i style={{ transform: `scaleX(${bar})` }} className={bar < 0.3 ? 'is-low' : ''} />
                  </i>
                )}
                <button
                  type="button"
                  ref={(el) => {
                    btn.current = el
                    if (takeRef) takeRef.current = el
                  }}
                  className="fe-take"
                  aria-disabled={!enabled || short > 0}
                  title={short > 0 ? `Te faltan ${short}` : undefined}
                  onClick={take}
                >
                  {kind === 'buy' ? 'Comprar' : 'Mejorar'} · {num(cost)}
                </button>
                {short > 0 && <small className="fe-ticket__short">Te faltan {num(short)} perras</small>}
                <button type="button" className="fe-pass" onClick={() => enabled && onPass?.()}>
                  {short > 0 ? 'Vale' : 'Pasar'}
                </button>
              </>
            )}
          </div>
          <i className="fe-ticket__shine" />
        </div>
      </div>
      {closing === 'buy' && (
        <b className="fe-stamp" style={{ '--o': stampColor }}>
          {kind === 'buy' ? '¡TUYO!' : `NIVEL ${level + 1}`}
        </b>
      )}
    </div>
  )
}

// Un duelo: la cuerda si son dos, o una barra por cabeza si han caído más en el mismo puesto.
function Duelo({ v, duel, scoreOf, live, more }) {
  const cur = v.cur
  const face = (seat) => ({ name: v.players[seat].name, avatar: v.players[seat].avatar })
  const side = (seat) => ({ name: seat === v.seat ? 'Tú' : v.players[seat].name, color: SEAT_COLORS[seat], faces: [face(seat)], score: scoreOf(duel, seat) })
  const sq = BOARD[duel.sq]
  const winner = cur.resolved ? duel.winner : null
  const best = Math.max(1, ...duel.seats.map((s) => scoreOf(duel, s)))
  return (
    <div className="fe-duel">
      <p className="fe-duel__title">
        <b>{winner === null ? `Duelo por ${sq.name}` : `${winner === v.seat ? 'Te lo quedas' : `${v.players[winner].name} se queda`} ${winner === v.seat ? '' : 'con '}${sq.name}`}</b>
        <span>
          {ISLANDS[sq.island].name} · vale {perras(sq.price)} · el ganador se lo lleva gratis{more > 0 ? ` · y ${more} duelo${more > 1 ? 's' : ''} más` : ''}
        </span>
      </p>
      {duel.seats.length === 2 ? (
        <Cuerda
          pos={ropeAt(scoreOf(duel, duel.seats[0]), scoreOf(duel, duel.seats[1]))}
          left={side(duel.seats[0])}
          right={side(duel.seats[1])}
          pulling={live}
          winner={winner === null ? null : winner === duel.seats[0] ? 'left' : 'right'}
        />
      ) : (
        <ul className="fe-bars">
          {duel.seats.map((seat) => (
            <li key={seat} className={winner === seat ? 'is-win' : ''} style={{ '--c': SEAT_COLORS[seat], '--f': scoreOf(duel, seat) / best }}>
              <Avatar name={v.players[seat].name} src={v.players[seat].avatar} size={26} />
              <span>{seat === v.seat ? 'Tú' : v.players[seat].name}</span>
              <i />
              <b>{scoreOf(duel, seat)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// La clasificación final: puesto, perras en efectivo (lo que decide) y lo que se lleva cada uno.
function Podio({ players, pot }) {
  return (
    <ol className="fe-podio">
      {players.map((p, i) => (
        <li key={i} className={`${p.me ? 'is-me' : ''} ${p.prize > 0 ? 'is-paid' : ''}`}>
          <b>{ordinal(p.place)}</b>
          <Avatar name={p.name} src={p.avatar} size={30} />
          <span>
            {p.me ? 'Tú' : p.name}
            {p.bot && <small>feriante</small>}
          </span>
          <em title={p.cash === undefined ? 'Patrimonio' : `Patrimonio: ${perras(p.worth)}`}>{perras(p.cash ?? p.worth)}</em>
          <strong>{p.prize > 0 ? `+${eur(p.prize)}` : '—'}</strong>
        </li>
      ))}
      {pot > 0 && <li className="fe-podio__pot">Bote para el ganador: {eur(pot)}</li>}
    </ol>
  )
}

// Las islas enteras que tiene cada uno: «isla:asiento».
const fullSet = (owners, n) => {
  const out = new Set()
  for (let k = 0; k < ISLANDS.length; k++) for (let s = 0; s < n; s++) if (hasIsland(owners, s, k)) out.add(`${k}:${s}`)
  return out
}

function Feria({ onExit, juegos }) {
  const { request } = juegos
  useFonts()
  const reduce = fx.useReducedMotion()
  const [sound, setSound] = useState(() => !isMuted())
  const [sending, setSending] = useState(false)
  const [sel, setSel] = useState(null)
  const [pick, setPick] = useState(ROUNDS) // las rondas que pides si eres quien abre la sala
  const [opt, setOpt] = useState(null) // compra o mejora pulsada que aún no ha confirmado el servidor
  const [closing, setClosing] = useState(null) // { key, kind: 'buy' | 'pass' }: el boleto se va
  const [gone, setGone] = useState('') // ronda cuyo boleto ya se ha ido
  const [paper, setPaper] = useState(null) // papeleta de la Tómbola que se enseña: { key, card, amount }
  const [oops, setOops] = useState(null) // aviso si el servidor no acepta la compra
  const peers = useRef(new Map()) // tirones que cuentan los demás navegadores: «partida:ronda:asiento» → n
  const onPeer = useCallback((p) => {
    if (p && Number.isFinite(p.n) && Number.isFinite(p.s)) peers.current.set(`${p.m}:${p.r}:${p.s}`, p.n)
  }, [])
  const { live: v, ready, ask, clock, shout } = useEnVivo(request, 'feria', TOPIC, onPeer)
  const playing = v?.phase === 'play'
  const rootRef = useRef(null)
  const fxRef = useRef(null)
  const ticketRef = useRef(null)
  const takeRef = useRef(null)
  const shownBank = useCountUp(juegos.me?.balance ?? 0)

  const t = clock()
  const cur = playing ? v.cur : null
  const rel = cur ? t - cur.at : 0
  const seated = Boolean(v) && v.seat >= 0
  const me = seated ? v.seat : -1
  const roundKey = cur ? `${v.id}:${v.round}` : ''
  // Retraso con el que ha llegado esta ronda (se mide una vez): los dados empiezan al llegar y las fichas lo recuperan.
  const lagRef = useRef({ key: '', lag: 0 })
  if (cur && lagRef.current.key !== roundKey) lagRef.current = { key: roundKey, lag: rel >= 0 && rel <= MAX_LAG ? rel : 0 }
  const lag = cur ? lagRef.current.lag : 0
  const vrel = rel - lag
  const moving = Boolean(cur) && rel > -400 && rel < MOVE_MS + 400
  const myDuel = cur && seated ? (cur.duels.find((d) => d.seats.includes(v.seat)) ?? null) : null
  const duelLive = Boolean(cur?.duels.length) && t >= cur.duelAt && t < cur.duelEnd
  useFrame(moving || duelLive, playing ? 100 : 250)
  const [taps, tap, tapCount] = useTaps(Boolean(myDuel) && duelLive, cur?.duelAt ?? 0, clock, tapCap)

  // Peticiones en los momentos clave (empieza la partida, se resuelve el duelo, acaba la ronda) y un sondeo de respaldo.
  const startAt = v?.phase === 'lobby' ? v.startAt : null
  const resolveAt = cur && !cur.resolved ? cur.resolveAt : null
  const endAt = cur?.end ?? null
  const busy = playing || Boolean(startAt)
  useEffect(() => {
    if (!ready) return
    const sync = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    const timers = [startAt, resolveAt, endAt]
      .filter(Boolean)
      .map((when) => when - clock() + 120 + Math.random() * 350)
      .map((wait) => setTimeout(sync, Math.max(0, wait)))
    const poll = setInterval(sync, busy ? POLL_MS : IDLE_POLL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(poll)
    }
  }, [ready, startAt, resolveAt, endAt, busy, ask, clock])

  // Mi duelo: lo que llevo tirado se lo cuento a los demás cada poco, y al servidor a la mitad y al acabar.
  const duelKey = myDuel ? `${v.id}:${v.round}` : null
  const duelAt = cur?.duelAt ?? 0
  useEffect(() => {
    if (!duelKey) return
    const [m, r] = duelKey.split(':').map(Number)
    const now = clock()
    if (now >= duelAt + DUEL_MS + 1200) return
    let last = -1
    const tell = setInterval(() => {
      if (tapCount.current === last) return
      last = tapCount.current
      shout({ m, r, s: v.seat, n: last })
    }, SHOUT_MS)
    const send = () => tapCount.current > 0 && ask({ a: 'tug', r, n: tapCount.current })
    const timers = [duelAt + DUEL_MS / 2, duelAt + DUEL_MS + 120].map((when) => setTimeout(send, Math.max(0, when - now)))
    return () => {
      clearInterval(tell)
      timers.forEach(clearTimeout)
    }
    // v.seat no cambia dentro de una partida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelKey, duelAt, ask, clock, shout, tapCount])

  // Sonidos del duelo y del final (lo de los dados y las casillas va en la coreografía de la ronda, más abajo).
  const cue = useRef('')
  const stage = !cur ? (v?.phase ?? '') : duelLive ? 'duel' : cur.resolved && cur.duels.length && rel >= MOVE_MS ? 'shown' : 'play'
  useEffect(() => {
    const key = `${v?.id}:${v?.round}:${stage}`
    if (cue.current === key) return
    const first = cue.current === ''
    cue.current = key
    if (first || !seated) return
    if (stage === 'duel' && myDuel) playGo()
    else if (stage === 'shown' && myDuel) (myDuel.winner === v.seat ? playWin : playLose)()
    else if (stage === 'done') ((v.result.find((r) => r.seat === v.seat)?.prize ?? 0) > 0 ? playWin : playLose)()
  }, [v, stage, seated, myDuel])
  useEffect(() => {
    setSel(null)
    setOops(null)
    if (peers.current.size > 60) peers.current.clear()
  }, [v?.round])

  const act = async (message, done) => {
    if (sending) return null
    setSending(true)
    const body = await ask(message)
    setSending(false)
    if (body && !body.error) done?.()
    return body
  }

  // ---------- Lo que se enseña ----------
  // Mientras las fichas andan se enseña lo de antes de la tirada (nada de adelantar quién paga a quién), salvo tu propia
  // compra, que ya se ve en cuanto la confirma el servidor (y antes, en cuanto la pulsas: opt).
  const hidden = Boolean(cur) && rel < MOVE_MS
  const myOffer = cur && seated ? (cur.offers[me] ?? null) : null
  const confirmed = Boolean(myOffer?.done)
  const optOn = Boolean(opt && opt.key === roundKey && !confirmed)
  const base = useMemo(() => {
    if (!v || !playing) return { owners: v?.owners ?? {}, levels: v?.levels ?? {} }
    if (!hidden) return { owners: v.owners, levels: v.levels }
    const owners = { ...v.cur.before.owners }
    const levels = { ...v.cur.before.levels }
    if (confirmed) {
      owners[myOffer.sq] = me
      levels[myOffer.sq] = v.levels[myOffer.sq] ?? 0
    }
    return { owners, levels }
    // myOffer va con v.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, playing, hidden, confirmed, me])
  const shown = useMemo(() => {
    if (!optOn) return base
    const owners = { ...base.owners, [opt.sq]: me }
    const levels = { ...base.levels, [opt.sq]: opt.kind === 'buy' ? 0 : (base.levels[opt.sq] ?? 0) + 1 }
    return { owners, levels }
  }, [base, optOn, opt, me])
  const owners = shown.owners
  const levels = shown.levels
  const spent = (optOn ? opt.cost : 0) + (hidden && confirmed ? myOffer.cost : 0)
  const cashOf = (seat) => (hidden ? cur.before.cash[seat] : v.players[seat].cash) - (seat === me ? spent : 0)
  const myCash = useCountUp(playing && seated ? cashOf(me) : 0, 600)
  const bote = useCountUp(playing ? (hidden ? cur.before.bote : v.bote) : 0, 700)

  // ---------- Fichas ----------
  const n = playing ? v.players.length : 0
  const order = useMemo(() => orderOf(n, me), [n, me])
  const plans = useMemo(() => (cur ? cur.steps.map((st, seat) => planOf(st, order.indexOf(seat), seat === me, lag)) : []), [cur, order, me, lag])
  const states = cur ? cur.steps.map((st, seat) => tokenState(st, plans[seat], vrel)) : []
  const restGroups = new Map()
  states.forEach((s, seat) => {
    if (s.rest !== undefined) restGroups.set(s.rest, [...(restGroups.get(s.rest) ?? []), seat])
  })
  const occupied = `|${[...restGroups.keys()].sort((a, b) => a - b).join('|')}|`
  const myPlan = seated && cur ? plans[me] : null
  const myStep = seated && cur ? cur.steps[me] : null
  const myLand = myPlan ? myPlan.land + lag : Infinity // rel en el que llega mi ficha
  const landed = rel >= myLand
  const focus = Boolean(myPlan) && rel >= myLand - myPlan.unit * 2.4 && rel < OPEN_MS - 300
  const dest = focus || (landed && rel < OPEN_MS - 300) ? myStep.to : null
  const hit = seated && cur && landed && t < cur.end ? myStep.to : null

  // ---------- Coreografía de la ronda ----------
  // Sonidos y efectos colgados del reloj del servidor: se programan una vez por ronda y lo que ya ha pasado (más de
  // 300 ms) se salta. Nada de esto toca el estado.
  const $ = (q) => rootRef.current?.querySelector(q)
  const tok = (seat) => $(`[data-tok="${seat}"]`)
  const sqEl = (i) => $(`[data-sq="${i}"]`)
  const vRef = useRef(v)
  vRef.current = v
  useEffect(() => {
    if (!cur) return
    const now = clock()
    const timers = []
    const at = (abs, fn) => {
      if (abs < now - 300) return
      timers.push(setTimeout(fn, Math.max(0, abs - now)))
    }
    const vt = (ms) => cur.at + lag + ms // de tiempo de la animación a hora del servidor
    const layer = fxRef.current
    const steps = cur.steps
    // Antes de la siguiente ronda, los dados se agitan en el cubilete.
    if (seated) at(cur.end - 250, playRattle)
    // Los dados: rebotes, caída, dobles y tiradas grandes (los tuyos; los de los demás no suenan).
    if (seated) {
      const d = steps[me].dice
      const sum = d[0] + d[1]
      ;[0.4, 0.7, 0.9].forEach((o, i) => at(vt((DICE_MS - 120) * o), () => playDiceHit(1 - i * 0.25)))
      at(vt(DICE_MS), () => {
        playLand(3)
        if (d[0] === d[1]) {
          playDoubles()
          fx.confetti(layer, $('.fe-felt'), 24, SEAT_COLORS)
        }
        if (sum >= 10) fx.tremble($('.fe-track'))
        if (sum === 2) playAww()
      })
    }
    // Las fichas: tus pasos suenan subiendo; las de los demás casi mudas. Al pasar por el Muelle, +200.
    steps.forEach((st, seat) => {
      const p = plans[seat]
      const mine = seat === me
      for (let k = 0; k < p.n; k++) {
        if (mine) at(vt(p.starts[k]), () => playStep(k + 1))
        else if (order.indexOf(seat) <= 2 && (k + 1) % 3 === 0) at(vt(p.starts[k]), playTick)
        if ((st.from + k + 1) % SIZE === 0 && st.lap) {
          at(vt(p.ends[k]), () => {
            fx.floatText(layer, tok(seat), `+${GO_BONUS}`, { color: '#ffd25e', size: mine ? 24 : 16 })
            if (mine) {
              playCash(3)
              fx.coinsFly(layer, sqEl(0), tok(seat), 3)
            }
          })
        }
      }
      at(vt(p.land), () => {
        fx.landPulse(sqEl(st.to), { mine })
        if (mine) {
          playLand(2)
          playBeep(1)
        }
      })
    })
    // Al abrirse la ronda (MOVE_MS): alquileres, papeletas, tasas y el bote, de uno en uno (tú primero).
    if (now < cur.at + MOVE_MS + 1500) {
      let k = 0
      for (const seat of order) {
        const ev = steps[seat].ev
        if (!ev || !['rent', 'card', 'tax', 'bote'].includes(ev.k)) continue
        const mine = seat === me
        const when = cur.at + MOVE_MS + 180 * k++
        at(when, () => {
          const myCashEl = $('.fe-cash')
          const from = mine && myCashEl ? myCashEl : tok(seat)
          if (ev.k === 'rent' && ev.amount > 0) {
            const theirs = ev.to === me
            const coins = clamp(Math.round(ev.amount / 20), 3, 8)
            if (mine || theirs) {
              fx.coinsFly(layer, tok(seat), tok(ev.to), coins, { kind: mine ? 'out' : 'gold', onCoin: (c) => playCoin(c) })
              fx.floatText(layer, tok(seat), `−${num(ev.amount)}`, { color: '#ff8a8a' })
              fx.floatText(layer, tok(ev.to), `+${num(ev.amount)}`, { color: '#7dffb8', delay: 450 })
              if (mine) {
                playLose()
                fx.shake(sqEl(steps[seat].to), { px: 3, cycles: 1, duration: 200 })
                $('.fe-cash')?.classList.add('is-hurt')
                setTimeout(() => $('.fe-cash')?.classList.remove('is-hurt'), 400)
              } else {
                playCash(3)
                fx.pop(sqEl(steps[seat].to), { scale: 1.12 })
                fx.pop($('.fe-cash'), { scale: 1.15, duration: 300 })
              }
            } else {
              fx.coinsFly(layer, tok(seat), tok(ev.to), 2, { small: true })
              fx.floatText(layer, tok(seat), `−${num(ev.amount)}`, { color: '#ffb0b0', size: 13 })
              fx.floatText(layer, tok(ev.to), `+${num(ev.amount)}`, { color: '#b6ffd6', size: 13, delay: 300 })
            }
          } else if (ev.k === 'card') {
            if (mine) {
              setPaper({ key: `${vRef.current?.id}:${vRef.current?.round}`, card: ev.card, amount: ev.amount, until: cur.at + MOVE_MS + 3400 })
              if (ev.amount >= 0) {
                playCheer()
                setTimeout(() => fx.confetti(layer, $('.fe-deck'), 10, ['#ffd25e', '#ffe38a', '#e9b23c']), 450)
              } else {
                playLose()
                setTimeout(() => fx.shake($('.fe-deck__paper'), { px: 6, cycles: 2 }), 450)
              }
            } else fx.floatText(layer, tok(seat), `${ev.amount >= 0 ? '+' : '−'}${num(Math.abs(ev.amount))}`, { color: ev.amount >= 0 ? '#b6ffd6' : '#ffb0b0', size: 14 })
          } else if (ev.k === 'tax' && ev.amount > 0) {
            fx.coinsFly(layer, from, $('.fe-jar'), mine ? 5 : 2, { small: !mine, kind: 'out', onCoin: mine ? (c) => playCoin(c) : undefined })
            fx.floatText(layer, tok(seat), `−${num(ev.amount)}`, { color: mine ? '#ff8a8a' : '#ffb0b0', size: mine ? 22 : 13 })
            setTimeout(() => fx.pop($('.fe-jar'), { scale: 1.15, duration: 300 }), 700)
            if (mine) playLose()
          } else if (ev.k === 'bote') {
            const coins = clamp(Math.round(ev.amount / 40), 4, 16)
            fx.pop($('.fe-jar'), { scale: 1.15, duration: 300 })
            fx.coinsFly(layer, $('.fe-jar'), mine && myCashEl ? myCashEl : tok(seat), mine ? coins : 3, { small: !mine, onCoin: mine ? (c) => playCoin(c) : undefined })
            fx.floatText(layer, tok(seat), `+${num(ev.amount)}`, { color: '#7dffb8', size: mine ? 24 : 14 })
            if (mine) {
              playCash(5)
              fx.confetti(layer, $('.fe-jar'), 24, ['#ffd25e', '#e9b23c', ...SEAT_COLORS])
              setTimeout(() => playWin(false), 300)
            }
          }
        })
      }
    }
    return () => timers.forEach(clearTimeout)
    // Una vez por ronda (y si cambia el retraso medido).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, lag])

  // Cambios de dueños, niveles e islas que llegan del servidor (de los demás, duelos ganados, y las tuyas si no las has
  // celebrado ya al pulsar): onda, chapa de nivel, cartel de isla completa.
  const celebrated = useRef(new Set())
  const prev = useRef(null)
  useEffect(() => {
    if (!playing) {
      prev.current = null
      return
    }
    const layer = fxRef.current
    const snap = { id: v.id, owners: base.owners, levels: base.levels, full: fullSet(base.owners, v.players.length) }
    const old = prev.current
    prev.current = snap
    if (!old || old.id !== v.id) return
    let ticks = 0
    for (const sq of BOARD) {
      if (sq.kind !== 'puesto') continue
      const was = old.owners[sq.i]
      const now = snap.owners[sq.i]
      const el = sqEl(sq.i)
      if (now !== undefined && was !== now) {
        if (celebrated.current.has(`${v.id}:${sq.i}:${now}:0`)) continue
        celebrated.current.add(`${v.id}:${sq.i}:${now}:0`)
        const won = cur?.duels.some((d) => d.sq === sq.i)
        if (now === me) {
          fx.wave(layer, el, SEAT_COLORS[now])
          fx.pop(el)
          fx.badge(layer, el, '¡TUYO!', SEAT_COLORS[now], { size: 20 })
          playStamp()
        } else {
          fx.wave(layer, el, SEAT_COLORS[now], { big: false })
          fx.pop(el, { scale: 1.1 })
          fx.badge(layer, el, initial(v.players[now].name), SEAT_COLORS[now], { size: 14 })
          if (!won) fx.floatText(layer, $(`[data-rank="${now}"] b`), `−${num(sq.price)}`, { color: '#9fb0c8', size: 14 })
          if (ticks++ === 0) setTimeout(() => playTick(), 0)
        }
      } else if (now !== undefined && (snap.levels[sq.i] ?? 0) > (old.levels[sq.i] ?? 0)) {
        const lvl = snap.levels[sq.i]
        if (celebrated.current.has(`${v.id}:${sq.i}:${now}:${lvl}`)) continue
        celebrated.current.add(`${v.id}:${sq.i}:${now}:${lvl}`)
        if (now === me) upgradeFx(el, lvl)
        else {
          fx.flash(el)
          fx.badge(layer, el, `Nv ${lvl}`, SEAT_COLORS[now], { size: 13 })
        }
      }
    }
    for (const key of snap.full) {
      if (old.full.has(key)) continue
      const [k, seat] = key.split(':').map(Number)
      const els = stallsOf(k).map(sqEl)
      const isl = ISLANDS[k]
      if (seat === me) {
        els.forEach((el, i) => fx.pop(el, { scale: 1.15, delay: i * 120 }))
        setTimeout(() => fx.cord(layer, els, SEAT_COLORS[seat]), 200)
        setTimeout(() => {
          // El cartel, un poco hacia el centro del tablero para que no se salga por el borde.
          const a = els[1]?.getBoundingClientRect()
          const c = $('.fe-center')?.getBoundingClientRect()
          const spot = a && c ? { left: a.left + (c.left + c.width / 2 - a.left - a.width / 2) * 0.45, top: a.top + (c.top + c.height / 2 - a.top - a.height / 2) * 0.45, width: a.width, height: a.height } : els[1]
          fx.banner(layer, spot, `¡Isla de ${isl.name}!`, 'alquiler ×2', isl.color)
          fx.confetti(layer, els[1], 30, [isl.color, SEAT_COLORS[seat], '#ffd25e'])
          playDoubles()
          setTimeout(() => playWin(false), 280)
        }, 300)
      } else {
        els.forEach((el) => fx.flash(el, { strength: 1.4 }))
        fx.banner(layer, $('.fe-logo'), `${v.players[seat].name} completa ${isl.name}`, null, isl.color, { small: true, duration: 1600 })
        playBeep(2)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, playing])

  function upgradeFx(el, lvl) {
    const layer = fxRef.current
    fx.badge(layer, el, `NIVEL ${lvl}`, '#b97f10', { size: 15 })
    playCash(lvl * 2)
    const lamp = el?.querySelectorAll('.fe-lamp')[lvl - 1]
    if (lamp && !fx.reducedMotion()) lamp.animate([{ scale: '0' }, { scale: '1.4', offset: 0.6 }, { scale: '1' }], { duration: 350, delay: 250, easing: fx.EASE.outBack, fill: 'backwards' })
    if (lvl === 1) playClunk()
    else if (lvl === 2) {
      playStamp()
      fx.sparks(layer, el, 6)
    } else {
      playStamp()
      setTimeout(playCheer, 150)
      fx.rings(layer, el)
      fx.sparks(layer, el, 12)
    }
  }

  // ---------- Comprar, mejorar, pasar ----------
  const offerKey = myOffer ? roundKey : ''
  const decided = Boolean(myOffer && (myOffer.done || myOffer.passed))
  const canTake = Boolean(myOffer) && !decided && rel >= OPEN_MS && t < cur.end
  const ticketOn = Boolean(myOffer) && landed && rel >= OPEN_MS - 300 && gone !== offerKey && (closing?.key === offerKey || (!decided && t < cur.end))
  const takeOffer = async () => {
    if (!canTake || sending || closing?.key === offerKey) return
    const key = offerKey
    const sq = myOffer.sq
    const kind = myOffer.kind
    const lvl = (base.levels[sq] ?? 0) + 1
    celebrated.current.add(`${v.id}:${sq}:${me}:${kind === 'buy' ? 0 : lvl}`)
    setOpt({ key, sq, kind, cost: myOffer.cost })
    setClosing({ key, kind: 'buy' })
    const layer = fxRef.current
    playCash(2)
    setTimeout(playStamp, 170)
    setTimeout(() => fx.shake(ticketRef.current, { px: 2, cycles: 1, duration: 120 }), 170)
    const target = sqEl(sq)
    fx.coinsFly(layer, $('.fe-cash'), target, clamp(Math.round(myOffer.cost / 35), 4, 10), {
      kind: 'out',
      delay: 80,
      onCoin: (c) => {
        playCoin(c)
        if (c === 0) fx.pop($('.fe-cash'), { scale: 1.2, duration: 120 })
      },
    })
    fx.floatText(layer, $('.fe-cash'), `−${num(myOffer.cost)}`, { color: '#ff8a8a' })
    setTimeout(() => {
      if (kind === 'buy') {
        fx.wave(layer, target, SEAT_COLORS[me])
        fx.pop(target)
        ;[-1, 1, -2, 2].forEach((d) => fx.flash(sqEl((sq + d + SIZE) % SIZE), { delay: Math.abs(d) * 90 }))
      } else upgradeFx(target, lvl)
    }, 300)
    // El boleto se encoge hacia la casilla y se va.
    setTimeout(() => {
      const card = ticketRef.current
      const a = card?.getBoundingClientRect()
      const b = target?.getBoundingClientRect()
      const done = () => setGone(key)
      if (!card || !a || !b || fx.reducedMotion()) return done()
      const dx = b.left + b.width / 2 - (a.left + a.width / 2)
      const dy = b.top + b.height / 2 - (a.top + a.height / 2)
      card.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done)
    }, 700)
    const body = await act({ a: 'take', r: v.round })
    if (!body || body.error) {
      setOpt(null)
      setClosing(null)
      setGone('')
      setOops(body?.error?.code === 'FERIA_NO_CASH' ? 'No te llegan las perras' : 'No se ha podido: el tiempo se ha acabado')
      fx.shake(takeRef.current)
    }
  }
  const passOffer = async () => {
    if (!myOffer || decided || sending || closing?.key === offerKey) return
    const key = offerKey
    setClosing({ key, kind: 'pass' })
    playPass()
    setTimeout(() => setGone(key), fx.reducedMotion() ? 0 : 230)
    await act({ a: 'pass', r: v.round })
  }
  // Atajos de escritorio: C compra (o mejora), P pasa.
  const keys = useRef({})
  keys.current = { takeOffer, passOffer, canTake }
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (!keys.current.canTake || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'c' || e.key === 'C') keys.current.takeOffer()
      else if (e.key === 'p' || e.key === 'P') keys.current.passOffer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tirones de un asiento en un duelo: los oficiales cuando ya está resuelto; mientras, lo que se va viendo.
  const scoreOf = (duel, seat) => {
    if (cur.resolved) return duel.taps[seat] ?? 0
    if (seat === v.seat) return taps
    if (v.players[seat].bot) return Math.round((duel.taps[seat] ?? 0) * Math.max(0, Math.min(1, (t - cur.duelAt) / DUEL_MS)))
    return peers.current.get(`${v.id}:${v.round}:${seat}`) ?? duel.taps[seat] ?? 0
  }

  // El registro: lo de esta ronda en cuanto se sabe; mientras, lo de la anterior.
  const lastLog = useRef({ key: '', lines: [] })
  let logLines = lastLog.current.lines
  if (cur && rel >= MOVE_MS) {
    logLines = order
      .slice()
      .reverse()
      .map((seat) => ({ seat, text: eventText(v, seat) }))
    lastLog.current = { key: roundKey, lines: logLines }
  }

  const header = (
    <header className={`top ${playing ? 'fe-top' : ''}`}>
      <h1>Feria de las Islas</h1>
      <div className="hud">
        <dl className="money">
          <div>
            <dt>Saldo de la semana</dt>
            <dd>{eur(shownBank)}</dd>
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
          <Help className="tg tg--help" title="Cómo se juega a la Feria de las Islas" wide>
            <p>
              Una partida de tablero de <b>
                {MIN_PLAYERS} a {SEATS} personas
              </b>
              , sin bots: si sois dos, jugáis los dos solos. Entrar cuesta <b>{eur(ENTRY)}</b> y <b>el bote entero es para el ganador</b>: {eur(ENTRY)} por cada
              jugador, que se ingresan en su saldo de la semana. La cuenta atrás empieza cuando hay al menos {MIN_PLAYERS}; si sales antes de que empiece, te devolvemos
              la inscripción.
            </p>
            <p>
              Todos empezáis con {perras(START_CASH)} (las perras solo valen dentro de la partida) y jugáis <b>{ROUND_MODES.join(', ').replace(/, (\d+)$/, ' o $1')} rondas a la vez</b>{' '}
              (lo elige quien abre la sala): en cada una se tiran los dados para todos y cada ficha avanza por el tablero, que recorre las siete islas. Cada vez que pasas
              por el Muelle cobras {perras(GO_BONUS)}.
            </p>
            <p>
              <b>Puesto libre.</b> Si caes solo, tienes {DECIDE_MS / 1000} s para comprarlo o dejarlo pasar (la barra marca el tiempo; si todos habéis decidido, la ronda
              sigue sin esperar). Si caéis varios en el mismo, os lo jugáis al <b>Tira y Afloja</b>: {DUEL_MS / 1000} s pulsando sin parar, y quien más tire se lo queda
              gratis.
            </p>
            <p>
              <b>Puesto de otro.</b> Le pagas el alquiler (el 30 % de lo que vale; el doble si tiene los tres de la isla y aún no lo ha mejorado). <b>Tu puesto.</b>{' '}
              Puedes mejorarlo hasta {MAX_LEVEL} veces, cada vez por la mitad de su precio: el alquiler pasa a ×{String(RENT_MULT[1]).replace('.', ',')}, ×
              {String(RENT_MULT[2]).replace('.', ',')} y ×{String(RENT_MULT[3]).replace('.', ',')}. El nivel {FULL_LEVEL} solo se puede con los tres puestos de la isla.
            </p>
            <p>
              <b>Tómbola</b> 🎟️: una papeleta al azar, buena o mala. <b>Tasa</b> 💸: pagas {perras(TAX)} al bote de la feria. <b>Verbena</b> 🎉: te llevas ese bote.
            </p>
            <p>
              Al acabar <b>gana quien tenga más perras en efectivo</b>. Si empatan, el de más patrimonio (perras más lo que valen sus puestos y mejoras); si siguen
              empatados, el bote se reparte a partes iguales.
            </p>
          </Help>
        </div>
      </div>
    </header>
  )


  if (!v) {
    return (
      <main className="app fe-app">
        {header}
        <p className="status">Montando la feria…</p>
      </main>
    )
  }

  // ---------- Sala y final ----------
  if (!playing) {
    const done = v.phase === 'done'
    const lastGame = v.history[0]
    const count = v.players.length
    const left = startAt ? secs(startAt - t) : null
    const final = done ? v.result.map((r) => ({ ...v.players[r.seat], ...r, me: r.seat === v.seat })) : null
    const mine = final?.find((p) => p.me)
    const tied = final ? final.filter((p) => p.prize > 0).length > 1 : false
    // Quien abre la sala (o la siguiente, tras una partida) elige las rondas; luego solo puede cambiarlas el primer asiento.
    const opening = done || count === 0
    const host = !done && v.seat === 0
    const rounds = opening ? pick : (v.rounds ?? ROUNDS)
    const choose = (n) => (opening ? setPick(n) : act({ a: 'rounds', n }))
    // El bote que se enseña es el que se paga: 500 € por cada persona sentada.
    const pot = done ? v.pot : potOf(count)
    return (
      <main className="app fe-app">
        {header}
        <div className="fe-lobby">
          <section className="fe-card fe-room">
            {done ? (
              <>
                <h2>
                  {mine
                    ? mine.prize > 0
                      ? tied
                        ? `¡Empate en cabeza! Te llevas ${eur(mine.prize)}`
                        : `¡Ganas la feria! Te llevas ${eur(mine.prize)}`
                      : `Acabas en el ${ordinal(mine.place)} puesto`
                    : 'Partida terminada'}
                </h2>
                <Podio players={final} pot={v.pot} />
              </>
            ) : (
              <>
                <h2>{count ? (count < MIN_PLAYERS ? 'Esperando a otra persona' : left > 0 ? `Empieza en ${left} s` : 'Empezando…') : 'La sala está vacía'}</h2>
                <p className="fe-room__sub">
                  {count
                    ? count < MIN_PLAYERS
                      ? `${count} de ${SEATS} · la cuenta atrás empieza en cuanto entre alguien más`
                      : `${count} de ${SEATS} · con la sala llena empieza al momento`
                    : `De ${MIN_PLAYERS} a ${SEATS} personas. Quien entra primero elige las rondas.`}
                </p>
                <ul className="fe-seats">
                  {Array.from({ length: SEATS }, (_, i) => {
                    const p = v.players[i]
                    return (
                      <li key={i} className={p ? 'is-on' : ''} style={{ '--c': SEAT_COLORS[i] }}>
                        {p ? <Avatar name={p.name} src={p.avatar} size={44} /> : <i />}
                        <span>{p ? (i === v.seat ? 'Tú' : p.name) : 'Libre'}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            <div className="fe-modes" role="group" aria-label="Rondas de la partida">
              <span>Rondas</span>
              {opening || host ? (
                ROUND_MODES.map((n) => (
                  <button key={n} type="button" className={`fe-mode ${rounds === n ? 'is-on' : ''}`} aria-pressed={rounds === n} disabled={sending} onClick={() => choose(n)}>
                    {n}
                  </button>
                ))
              ) : (
                <b>{rounds}</b>
              )}
              <small>unos {minutesOf(rounds)} min</small>
            </div>
            <div className="fe-room__actions">
              {seated && !done ? (
                <button type="button" className="fe-btn" disabled={sending} onClick={() => act({ a: 'leave' })}>
                  Salir de la sala
                </button>
              ) : (
                <button
                  type="button"
                  className="fe-btn fe-btn--go"
                  disabled={sending || !ready || (!done && count >= SEATS)}
                  onClick={() => act(opening ? { a: 'join', rounds: pick } : { a: 'join' }, playChip)}
                >
                  {done ? 'Jugar otra' : 'Entrar'} · {eur(ENTRY)}
                </button>
              )}
              <span>
                {done ? (
                  <>Bote: {eur(ENTRY)} por jugador, todo para el ganador</>
                ) : (
                  <>
                    Bote para el ganador: <b>{eur(pot)}</b>
                    {count < SEATS ? ` (sube ${eur(ENTRY)} con cada jugador)` : ''}
                  </>
                )}
              </span>
            </div>
          </section>
          <section className="fe-card fe-how">
            <h2>La partida</h2>
            <ul>
              <li>
                De <b>
                  {MIN_PLAYERS} a {SEATS} personas
                </b>
                , sin bots. {ROUND_MODES.join(', ').replace(/, (\d+)$/, ' o $1')} rondas y todos tiráis a la vez.
              </li>
              <li>
                Compra puestos, mejóralos y cobra <b>alquiler</b> a quien caiga. El nivel {FULL_LEVEL}, solo con la isla entera.
              </li>
              <li>
                ¿Dos en el mismo puesto libre? <b>Tira y Afloja</b>: quien más pulse se lo lleva.
              </li>
              <li>
                Gana quien acabe con <b>más perras en efectivo</b> y se lleva <b>el bote entero</b>.
              </li>
            </ul>
            {!done && lastGame && (
              <>
                <h2>Última partida</h2>
                <Podio players={lastGame.players.slice(0, 3)} pot={0} />
              </>
            )}
          </section>
        </div>
      </main>
    )
  }


  // ---------- Partida ----------
  const shownDuel = cur.duels.length && rel >= MOVE_MS ? (myDuel ?? cur.duels[0]) : null
  const timeLeft = rel < 0 ? -rel : shownDuel && !cur.resolved ? (t < cur.duelAt ? cur.duelAt - t : Math.max(0, cur.duelEnd - t)) : Math.max(0, cur.end - t)
  // La barra de tiempo: lo que queda de la ventana para decidir (o del duelo). Si todos deciden, la ronda se acorta y la
  // barra salta al final.
  const span =
    rel < MOVE_MS ? 0 : shownDuel && !cur.resolved ? (t < cur.duelAt ? 0 : DUEL_MS) : Object.keys(cur.offers).length && !cur.duels.length ? cur.end - (cur.at + MOVE_MS) : 0
  const bar = span > 0 ? Math.max(0, Math.min(1, timeLeft / span)) : null
  const myBar = canTake ? clamp((cur.end - t) / Math.max(1, cur.end - (cur.at + OPEN_MS)), 0, 1) : null
  const rounds = v.rounds ?? ROUNDS
  // La clasificación va por perras en efectivo (lo que decide quién gana) y, si empatan, por patrimonio.
  const ranking = v.players
    .map((p, seat) => ({ ...p, seat, cash: cashOf(seat), stalls: Object.values(owners).filter((o) => o === seat).length }))
    .sort((a, b) => (hidden ? 0 : b.cash - a.cash || b.worth - a.worth) || a.seat - b.seat)
  const selSq = sel === null ? null : BOARD[sel]
  const dice = myStep?.dice ?? null
  const sum = dice ? dice[0] + dice[1] : 0
  const diceDone = vrel >= DICE_MS
  const waiting = t >= cur.end - 250 // a punto de empezar la siguiente: los dados se agitan
  const showPaper = paper && paper.key === roundKey && t < paper.until

  let message = null
  if (oops) message = <b>{oops}</b>
  else if (rel < 0) message = <b>¡Empieza la feria!</b>
  else if (rel < MOVE_MS) message = seated ? (diceDone ? <span>Has sacado {sum}: avanzas a {BOARD[myStep.to].name}</span> : <span>Tirando los dados…</span>) : <span>Tirando los dados…</span>
  else if (seated) message = <b>{eventText(v, v.seat)}</b>
  else message = <span>Estás mirando la partida</span>

  // Las fichas: quietas en la zona de fuera de su casilla (repartidas sin tapar el nombre) o a medio salto.
  const walkers = v.players.map((p, seat) => {
    const s = states[seat]
    const mine = seat === me
    let x
    let y
    let size
    let style
    let walking = false
    if (s.rest !== undefined) {
      const group = restGroups.get(s.rest)
      const slot = slotOf(s.rest, group.indexOf(seat), group.length)
      x = slot.x
      y = slot.y
      size = slot.s
    } else {
      walking = true
      const a = anchorOf(s.a)
      const b = anchorOf(s.b)
      const f = ease(s.f)
      x = a.x + (b.x - a.x) * f
      y = a.y + (b.y - a.y) * f
      size = mine ? 0.4 : 0.32
      const hop = Math.sin(s.f * Math.PI) * plans[seat].hop
      const [sx, sy] = reduce ? [1, 1] : squash(s.f)
      style = { transform: `translate(-50%, calc(-50% - ${reduce ? 0 : hop} * var(--u))) scale(${sx}, ${sy})` }
    }
    const left = (x / TRACK) * 100
    const top = (y / TRACK) * 100
    return (
      <span
        key={seat}
        data-tok={seat}
        className={`fe-tok ${mine ? 'is-me' : ''} ${walking ? 'is-walking' : ''}`}
        title={p.name}
        style={{ left: `${left}%`, top: `${top}%`, '--s': size, '--c': SEAT_COLORS[seat], '--ci': SEAT_INK[seat], ...style }}
      >
        {initial(p.name)}
        {mine && walking && (
          <small className="fe-tok__count">
            {s.k}/{plans[seat].n}
          </small>
        )}
        {mine && focus && <small className="fe-tok__dest">{BOARD[myStep.to].name}</small>}
      </span>
    )
  })

  const tray = (
    <div className="fe-tray">
      <p className="fe-tray__top">
        <span>
          Ronda <b>{v.round + 1}</b> / {rounds}
        </span>
        {seated && diceDone && rel >= 0 ? (
          <span>
            Tu tirada <b>{sum}</b>
          </span>
        ) : (
          <span>
            <b>{secs(timeLeft)}</b> s
          </span>
        )}
      </p>
      <div className="fe-felt">
        {rel < 0 ? (
          <>
            <Dados dice={null} start={0} clock={clock} me reduce={reduce} shaking />
            <b className="fe-felt__msg">¡Empieza la feria!</b>
          </>
        ) : seated ? (
          <>
            <Dados dice={dice} start={cur.at + lag} clock={clock} me reduce={reduce} shaking={waiting} />
            {diceDone && vrel < DICE_MS + (sum >= 10 ? 2200 : 1950) && (
              <b key={`sum${roundKey}`} className={`fe-sum ${sum >= 10 ? 'is-big' : ''} ${sum === 2 ? 'is-snake' : ''}`} aria-hidden="true">
                {sum}
              </b>
            )}
            {diceDone && dice[0] === dice[1] && vrel < DICE_MS + 1100 && (
              <b key={`dbl${roundKey}`} className="fe-doubles" aria-hidden="true">
                ¡Dobles!
              </b>
            )}
          </>
        ) : (
          <b className="fe-felt__msg">{rel < MOVE_MS ? 'Tirando los dados…' : 'Estás mirando'}</b>
        )}
      </div>
      <div className="fe-tray__foot">
        <i className="fe-tbar" role="progressbar" aria-label="Tiempo para decidir" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((bar ?? 0) * 100)}>
          <i style={{ transform: `scaleX(${bar ?? 0})` }} className={bar !== null && bar < 0.3 ? 'is-low' : ''} />
        </i>
        <p className="fe-rolls" aria-label="Tiradas de esta ronda">
          {diceDone &&
            cur.steps.map((st, seat) => (
              <span key={seat} className={seat === me ? 'is-me' : ''} title={v.players[seat].name}>
                <i style={{ '--c': SEAT_COLORS[seat] }} />
                {st.dice[0] + st.dice[1]}
              </span>
            ))}
        </p>
      </div>
    </div>
  )

  return (
    <main className="app fe-app fe-app--play" ref={rootRef}>
      <div className="fe-play">
        <div className="fe-boardwrap">
          <div className={`fe-board ${focus ? 'is-focus' : ''}`}>
            <div className="fe-track">
              <Casillas owners={owners} levels={levels} sel={sel} hit={hit} hitColor={seated ? SEAT_COLORS[me] : null} dest={dest} me={me} players={v.players} occupied={occupied} onSel={setSel} />
              <div className="fe-center">
                <Logo />
                <div className="fe-mid">
                  <figure className="fe-deck">
                    <div className={`fe-deck__stack ${showPaper ? 'is-open' : ''}`}>
                      <i />
                      <i />
                      <i className="fe-deck__top">
                        <span>Tómbola</span>
                      </i>
                      {showPaper && (
                        <div className="fe-deck__paper" role="status">
                          <small>Papeleta</small>
                          <p>{CARDS[paper.card].text}</p>
                          <b className={paper.amount >= 0 ? 'is-plus' : 'is-minus'}>{signed(paper.amount)}</b>
                        </div>
                      )}
                    </div>
                    <figcaption>Papeletas</figcaption>
                  </figure>
                  {tray}
                  <figure className="fe-pot">
                    <span className="fe-jar">
                      <Jar />
                    </span>
                    <output>
                      <span className="fe-perra" />
                      {num(bote)}
                    </output>
                    <figcaption>Bote de la feria</figcaption>
                  </figure>
                </div>
                <div className="fe-log" aria-label="Lo último que ha pasado">
                  {logLines.slice(-5).map((l) => (
                    <p key={l.seat} className={l.seat === me ? 'is-me' : ''}>
                      <i style={{ '--c': SEAT_COLORS[l.seat] }} />
                      <span>{l.text}</span>
                    </p>
                  ))}
                  {!logLines.length && <p className="is-empty">Aquí se apunta lo que pasa en cada ronda.</p>}
                </div>
              </div>
              {ticketOn && (
                <div className="fe-over">
                  <Boleto
                    sq={BOARD[myOffer.sq]}
                    mode="offer"
                    kind={myOffer.kind}
                    cost={myOffer.cost}
                    cash={cashOf(me) + (closing?.key === offerKey ? myOffer.cost : 0)}
                    level={base.levels[myOffer.sq] ?? 0}
                    owner={myOffer.kind === 'up' ? me : undefined}
                    owners={base.owners}
                    bar={myBar}
                    enabled={canTake && !sending}
                    closing={closing?.key === offerKey ? closing.kind : null}
                    stampColor={SEAT_COLORS[me]}
                    onTake={takeOffer}
                    onPass={passOffer}
                    ticketRef={ticketRef}
                    takeRef={takeRef}
                    me={me}
                    players={v.players}
                  />
                </div>
              )}
              {shownDuel && (
                <div className="fe-over">
                  <div className="fe-duelbox">
                    <Duelo v={v} duel={shownDuel} scoreOf={scoreOf} live={duelLive} more={cur.duels.length - 1} />
                    {myDuel && !cur.resolved && <TapPad active={duelLive} onTap={tap} n={taps} idle={t < cur.duelAt ? `${secs(cur.duelAt - t)}` : 'Contando…'} />}
                    <p className="fe-duelbox__time">{cur.resolved ? 'Resuelto' : `${secs(timeLeft)} s`}</p>
                  </div>
                </div>
              )}
              <div className="fe-walkers" aria-hidden="true">
                {walkers}
              </div>
            </div>
          </div>
        </div>

        <aside className="fe-side">
          {header}
          {seated && (
            <div className="fe-me" style={{ '--c': SEAT_COLORS[me] }}>
              <span className="fe-me__tok" style={{ '--ci': SEAT_INK[me] }}>
                {initial(v.players[me].name)}
              </span>
              <div>
                <small>Tus perras</small>
                <output className="fe-cash">
                  <span className="fe-perra" />
                  {num(myCash)}
                </output>
              </div>
            </div>
          )}
          <p className="fe-msg" aria-live="polite">
            {message}
            {myStep?.lap && rel >= MOVE_MS && <small>Pasas por el Muelle: {signed(GO_BONUS)}</small>}
          </p>
          <ol className="fe-rank" aria-label="Clasificación">
            {ranking.map((p) => (
              <li key={p.seat} data-rank={p.seat} className={p.seat === me ? 'is-me' : ''} style={{ '--c': SEAT_COLORS[p.seat], '--ci': SEAT_INK[p.seat] }}>
                <i>{initial(p.name)}</i>
                <span>
                  {p.seat === me ? `${p.name} (tú)` : p.name}
                  <small>
                    {p.stalls} puesto{p.stalls === 1 ? '' : 's'}
                  </small>
                </span>
                <b>{num(p.cash)}</b>
              </li>
            ))}
          </ol>
          {selSq ? (
            selSq.kind === 'puesto' ? (
              <div className="fe-info">
                <Boleto sq={selSq} level={levels[selSq.i] ?? 0} owner={owners[selSq.i]} owners={owners} me={me} players={v.players} />
                <button type="button" className="fe-info__close" onClick={() => setSel(null)}>
                  Cerrar ficha
                </button>
              </div>
            ) : (
              <p className="fe-hint">
                <b>{selSq.name}</b>{' '}
                {
                  {
                    salida: `cobras ${perras(GO_BONUS)} cada vez que pasas.`,
                    suerte: 'sacas una papeleta: buena o mala.',
                    tasa: `pagas ${perras(TAX)} al bote de la feria.`,
                    verbena: 'te llevas el bote de la feria.',
                  }[selSq.kind]
                }
              </p>
            )
          ) : (
            <p className="fe-hint">Toca una casilla para ver su boleto. Atajos: C compra, P pasa.</p>
          )}
        </aside>
      </div>
      <div className="fe-fxl" ref={fxRef} aria-hidden="true" />
    </main>
  )
}

export default Feria
