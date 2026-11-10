// El Taller de Papá Noel (Season 5): un idle tycoon con su propia moneda, las galletas (🍪). Las plantas fabrican
// juguetes, el montacargas los sube al almacén y el trineo los reparte y los cambia por galletas. Tocas cada parte para
// que trabaje un rato hasta que contratas a su encargado, que la hace trabajar sola (también sin ti). Mejoras con
// galletas, abres plantas nuevas y canjeas galletas por € del casino. Las cuentas las hace el servidor (taller.js); aquí
// se avanza con las mismas reglas entre respuesta y respuesta para que los números suban en directo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import {
  AWAY_MAX_S,
  CARRIERS,
  DAILY_CAP,
  MAX_BUY,
  PACK,
  PLANTAS,
  TAP_S,
  advance,
  bottleneck,
  bulk,
  carrierCost,
  carrierRate,
  flow,
  fmtCookies,
  nextMilestone,
  packCost,
  packsFor,
  plantaCost,
  plantaRate,
} from './taller.js'
import { eur } from '../comun/money.js'
import { buzz, playCash, playChip, playJingle, playTurn } from '../comun/sound.js'
import { FiestaHeader } from '../season4/FiestaParts.jsx'
import './Taller.css'

const SYNC_MS = 15000
const BUYS = [1, 10, 100, 'max']
const perSec = (n) => `${fmtCookies(n)}/s`
const fmtTime = (s) => (s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`)

// Botón de mejora: compra 1, 10, 100 o los que se puedan (hasta MAX_BUY) y dice cuánto cuesta.
function UpButton({ part, i, lvl, cookies, mode, busy, onUp }) {
  const want = mode === 'max' ? MAX_BUY : mode
  const can = bulk(part, i, lvl, want, cookies)
  const show = mode === 'max' ? can : bulk(part, i, lvl, want, Infinity)
  const n = mode === 'max' ? Math.max(1, can.n) : want
  const cost = mode === 'max' && can.n === 0 ? (part === 'p' ? plantaCost(i, lvl) : carrierCost(part, lvl)) : show.total
  const ok = mode === 'max' ? can.n > 0 : can.n >= want
  return (
    <button type="button" className="ta-up" disabled={busy || !ok} onClick={() => onUp(part, i, n)}>
      <b>⬆ ×{mode === 'max' ? Math.max(can.n, 1) : want}</b>
      <small>🍪 {fmtCookies(cost)}</small>
    </button>
  )
}

// Encargado: el elfo con su gorro si ya está; si no, lo que cuesta contratarlo.
function Boss({ hired, cost, cookies, busy, onHire }) {
  if (hired)
    return (
      <span className="ta-boss is-hired" title="Encargado: trabaja solo">
        <i aria-hidden="true">🧝</i>
        <small>Encargado</small>
      </span>
    )
  return (
    <button type="button" className="ta-boss" disabled={busy || cookies < cost} onClick={onHire} title="Contratar encargado: trabaja solo, también cuando no estás">
      <i aria-hidden="true">🧝</i>
      <small>🍪 {fmtCookies(cost)}</small>
    </button>
  )
}

// Anillo de «trabajando» de un toque (lo que queda de los TAP_S segundos).
function Ring({ until, now }) {
  const left = Math.max(0, until - now)
  const frac = left / (TAP_S * 1000)
  return (
    <svg className="ta-ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
      <circle cx="18" cy="18" r="15" fill="none" stroke="#f8c54e" strokeWidth="4" strokeDasharray={`${frac * 94.2} 94.2`} transform="rotate(-90 18 18)" />
    </svg>
  )
}

function Taller({ onExit, juegos }) {
  const [v, setV] = useState(null) // la última vista del servidor
  const [got, setGot] = useState(0) // Date.now() de cuando llegó
  const [, setTick] = useState(0)
  const [mode, setMode] = useState(1)
  const [busy, setBusy] = useState(false)
  const [away, setAway] = useState(null) // { secs, earned } al volver
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const first = useRef(true)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!busy) setBalance(serverBalance)
  }, [serverBalance, busy])

  const take = (nv) => {
    setV(nv)
    setGot(Date.now())
    setBalance(nv.balance)
    if (first.current) {
      first.current = false
      if (nv.away > 0 && nv.earned > 0) setAway({ secs: nv.away, earned: nv.earned })
    }
  }
  const sync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_taller', a: 'sync' })
    if (body?.solo) take(body.solo)
  })
  useEffect(() => {
    sync()
    const tick = setInterval(() => setTick((n) => n + 1), 250)
    const poll = setInterval(() => sync(), SYNC_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [])

  async function act(message, note) {
    if (lock.current) return null
    lock.current = true
    setBusy(true)
    setError('')
    const body = await request({ t: 'solo_taller', ...message })
    lock.current = false
    setBusy(false)
    if (body?.error) setError(body.error.message)
    const nv = body?.solo ?? null
    if (nv) {
      take(nv)
      if (note) {
        setFlash(note)
        setTimeout(() => setFlash((f) => (f === note ? null : f)), 700)
      }
    } else if (!body?.error) await sync()
    return nv
  }

  // El taller ahora mismo: lo del servidor avanzado con las mismas reglas hasta este instante.
  const now = v ? v.now + (Date.now() - got) : 0
  const st = useMemo(() => (v ? advance({ ...v, at: v.now }, now).st : null), [v, now])

  const tap = (part, i) => {
    if (!st) return
    const until = part === 'p' ? st.work.p[i] : st.work[part]
    const boss = part === 'p' ? st.boss.p[i] : st.boss[part]
    if (boss || until > now) return
    playTurn()
    act({ a: 'tap', part, i })
  }
  const up = (part, i, n) => {
    playChip()
    act({ a: 'up', part, i, n }, `${part}${i ?? ''}`)
  }
  const hire = (part, i) => {
    playJingle(4)
    act({ a: 'boss', part, i }, `${part}${i ?? ''}`)
  }
  const unlock = () => {
    playJingle(6)
    act({ a: 'unlock' }, 'unlock')
  }
  async function swap(packs) {
    const nv = await act({ a: 'swap', packs })
    if (!nv) return
    playCash(Math.min(10, Math.max(2, Math.round(nv.got / 300))))
    buzz([40, 30, 60])
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !st) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea, button:focus-visible')) return
    // Espacio: pone a trabajar todo lo que no tiene encargado y está parado.
    if (event.code === 'Space') {
      event.preventDefault()
      const idle = [...st.plantas.map((_, i) => ['p', i]), ['e'], ['s']].find(([part, i]) =>
        part === 'p' ? !st.boss.p[i] && st.work.p[i] <= now : !st.boss[part] && st.work[part] <= now,
      )
      if (idle) tap(idle[0], idle[1])
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const help = (
    <>
      <p>
        Tu taller tiene tres partes: las <b>plantas</b> fabrican juguetes, el <b>montacargas</b> los sube al almacén y el <b>trineo</b> los reparte y los
        cambia por <b>galletas</b> 🍪. La parte más lenta es la que manda: mejora siempre el cuello de botella (sale marcado).
      </p>
      <p>
        Sin encargado, cada parte trabaja {TAP_S} segundos cada vez que la tocas (o con la barra espaciadora). Con su <b>encargado</b> 🧝 trabaja sola, también
        cuando no estás (hasta {AWAY_MAX_S / 3600} horas seguidas: pásate de vez en cuando).
      </p>
      <p>
        Mejorar cuesta cada vez más; en los niveles 25, 50, 100, 150… la producción se dobla. Abre plantas nuevas: cada una fabrica juguetes que valen mucho
        más.
      </p>
      <p>
        Las galletas se <b>canjean por €</b> en paquetes de {eur(PACK)}. El primero del día cuesta {fmtCookies(packCost(0))} 🍪 y cada uno más, ese día,
        cuesta más que el anterior; como mucho {eur(DAILY_CAP)} al día. El taller dura toda la temporada: no se reinicia el domingo.
      </p>
    </>
  )

  if (!st)
    return (
      <main className="app fi-app ta-app">
        <FiestaHeader title="Taller de Papá Noel" balance={balance} betLabel="Canjeado hoy" bet={0} onExit={onExit} help={help} helpTitle="Cómo funciona el Taller" />
        <p className="fi-status">Abriendo el taller…</p>
      </main>
    )

  const make = st.plantas.reduce((sum, lvl, i) => sum + plantaRate(i, lvl), 0)
  const lift = carrierRate('e', st.e)
  const sell = carrierRate('s', st.s)
  const neck = bottleneck(st)
  const doneToday = Math.round(st.swapped / PACK)
  const capLeft = DAILY_CAP - st.swapped
  const canSwap = packsFor(st.cookies, doneToday)
  const next = st.plantas.length
  const working = (part, i) => (part === 'p' ? st.boss.p[i] || st.work.p[i] > now : st.boss[part] || st.work[part] > now)

  // El montacargas o el trineo (una función, no un componente: se pinta 4 veces por segundo y no debe montarse de nuevo).
  const carrier = (k) => {
    const lvl = st[k]
    const rate = carrierRate(k, lvl)
    const ms = nextMilestone(lvl)
    return (
      <div className={`ta-carrier ta-carrier--${k} ${neck === k ? 'is-neck' : ''} ${flash === k ? 'is-flash' : ''} ${working(k) ? 'is-working' : ''}`}>
        <button type="button" className="ta-carrier__main" onClick={() => tap(k)} disabled={st.boss[k] || st.work[k] > now}>
          <span className="ta-carrier__ico" aria-hidden="true">
            {CARRIERS[k].icon}
          </span>
          {!st.boss[k] && (st.work[k] > now ? <Ring until={st.work[k]} now={now} /> : <em className="ta-tapme">¡Toca!</em>)}
        </button>
        <span className="ta-carrier__info">
          <b>
            {CARRIERS[k].name} <small>Nv. {lvl}</small>
          </b>
          <small>
            {k === 'e' ? 'Sube' : 'Reparte'} {perSec(rate)}
            {ms ? ` · ×2 al nivel ${ms}` : ''}
          </small>
          {neck === k && <em className="ta-neck">Cuello de botella</em>}
        </span>
        <UpButton part={k} lvl={lvl} cookies={st.cookies} mode={mode} busy={busy} onUp={up} />
        <Boss hired={st.boss[k]} cost={CARRIERS[k].boss} cookies={st.cookies} busy={busy} onHire={() => hire(k)} />
      </div>
    )
  }

  return (
    <main className="app fi-app ta-app">
      <FiestaHeader title="Taller de Papá Noel" balance={balance} betLabel="Canjeado hoy" bet={st.swapped} onExit={onExit} help={help} helpTitle="Cómo funciona el Taller" />

      <div className="fi fill">
        <section className="fi-stage ta-stage" aria-label="El taller">
          <div className="ta-bank">
            <span className="ta-bank__cookies">
              🍪 <b>{fmtCookies(st.cookies)}</b>
            </span>
            <span className="ta-bank__rate">
              {perSec(flow(st))} con todo trabajando
              <small>
                Plantas {perSec(make)} · Montacargas {perSec(lift)} · Trineo {perSec(sell)}
              </small>
            </span>
            <div className="ta-buy" role="radiogroup" aria-label="Cuántos niveles mejorar">
              {BUYS.map((b) => (
                <button key={b} type="button" role="radio" aria-checked={mode === b} onClick={() => setMode(b)}>
                  {b === 'max' ? 'Máx' : `×${b}`}
                </button>
              ))}
            </div>
          </div>

          <div className="ta-building">
            {/* Tejado con el trineo y el almacén. */}
            <div className="ta-roof">
              {carrier('s')}
              <div className="ta-store" title="Juguetes en el almacén">
                📦 <b>{fmtCookies(st.store)}</b>
                <small>en el almacén</small>
              </div>
            </div>

            <div className="ta-body">
              <div className="ta-floors">
                {st.plantas.map((lvl, i) => {
                  const ms = nextMilestone(lvl)
                  const on = working('p', i)
                  return (
                    <div key={i} className={`ta-floor ${on ? 'is-working' : ''} ${neck === 'p' ? 'is-neck' : ''} ${flash === `p${i}` ? 'is-flash' : ''}`}>
                      <button
                        type="button"
                        className="ta-floor__main"
                        onClick={() => tap('p', i)}
                        disabled={st.boss.p[i] || st.work.p[i] > now}
                        aria-label={`Planta de ${PLANTAS[i].name}: ${st.boss.p[i] ? 'trabaja sola' : 'toca para trabajar'}`}
                      >
                        <span className="ta-floor__crew" aria-hidden="true">
                          {Array.from({ length: Math.min(3, 1 + Math.floor(lvl / 20)) }, (_, k) => (
                            <i key={k} style={{ animationDelay: `${k * -0.2}s` }}>
                              🧝
                            </i>
                          ))}
                          <b>{PLANTAS[i].icon}</b>
                        </span>
                        {!st.boss.p[i] && (st.work.p[i] > now ? <Ring until={st.work.p[i]} now={now} /> : <em className="ta-tapme">¡Toca!</em>)}
                      </button>
                      <span className="ta-floor__info">
                        <b>
                          {PLANTAS[i].name} <small>Nv. {lvl}</small>
                        </b>
                        <small>
                          {perSec(plantaRate(i, lvl))}
                          {ms ? ` · ×2 al nivel ${ms}` : ''}
                        </small>
                      </span>
                      <UpButton part="p" i={i} lvl={lvl} cookies={st.cookies} mode={mode} busy={busy} onUp={up} />
                      <Boss hired={st.boss.p[i]} cost={PLANTAS[i].boss} cookies={st.cookies} busy={busy} onHire={() => hire('p', i)} />
                    </div>
                  )
                })}
                {next < PLANTAS.length && (
                  <div className={`ta-floor is-locked ${flash === 'unlock' ? 'is-flash' : ''}`}>
                    <span className="ta-floor__lock" aria-hidden="true">
                      🔒 {PLANTAS[next].icon}
                    </span>
                    <span className="ta-floor__info">
                      <b>{PLANTAS[next].name}</b>
                      <small>Fabrica {perSec(plantaRate(next, 1))} a nivel 1</small>
                    </span>
                    <button type="button" className="ta-up ta-up--unlock" disabled={busy || st.cookies < PLANTAS[next].unlock} onClick={unlock}>
                      <b>Abrir</b>
                      <small>🍪 {fmtCookies(PLANTAS[next].unlock)}</small>
                    </button>
                  </div>
                )}
                <div className="ta-pile" title="Juguetes esperando al montacargas">
                  🧺 <b>{fmtCookies(st.pile)}</b> esperando al montacargas
                </div>
              </div>

              {/* El hueco del montacargas, a la derecha de las plantas. */}
              <div className={`ta-shaft ${working('e') ? 'is-working' : ''}`} aria-hidden="true">
                <span className="ta-shaft__car">🛗</span>
              </div>
            </div>

            <div className="ta-lift">
              {carrier('e')}
            </div>
          </div>

          <p className={`fi-status ${error ? 'is-bad' : ''}`} role="status">
            {error || (neck === 'p' ? 'Las plantas son lo más lento: mejóralas o abre otra.' : `El ${neck === 'e' ? 'montacargas' : 'trineo'} frena la cadena: mejóralo.`)}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>Canjear galletas</small>
            <b>{eur(PACK)}</b>
            <span className="fi-prize__tag">{capLeft > 0 ? `por 🍪 ${fmtCookies(packCost(doneToday))}` : 'Tope de hoy alcanzado'}</span>
          </div>
          <div className="fi-group">
            <h2>Hoy</h2>
            <div className="ta-cap" role="progressbar" aria-valuemin={0} aria-valuemax={DAILY_CAP} aria-valuenow={st.swapped} aria-label="Canjeado hoy">
              <i style={{ width: `${(st.swapped / DAILY_CAP) * 100}%` }} />
              <span>
                {eur(st.swapped)} de {eur(DAILY_CAP)}
              </span>
            </div>
            <p className="fi-hint">Cada paquete del día cuesta más galletas que el anterior. Mañana vuelve a empezar.</p>
          </div>
          <button type="button" className="fi-go" disabled={busy || capLeft <= 0 || canSwap.n < 1} onClick={() => swap(1)}>
            Canjear {eur(PACK)}
            <small className="ta-go-sub">🍪 {fmtCookies(packCost(doneToday))}</small>
          </button>
          {canSwap.n > 1 && (
            <button type="button" className="ta-swapall" disabled={busy} onClick={() => swap(canSwap.n)}>
              Canjear {eur(canSwap.n * PACK)} (🍪 {fmtCookies(canSwap.total)})
            </button>
          )}
          <div className="fi-group">
            <h2>Tu taller</h2>
            <ol className="fi-table">
              <li>
                <span>🍪</span>
                <span>Galletas ganadas</span>
                <b>{fmtCookies(st.made ?? 0)}</b>
              </li>
              <li>
                <span>🏭</span>
                <span>Plantas abiertas</span>
                <b>
                  {st.plantas.length}/{PLANTAS.length}
                </b>
              </li>
              <li>
                <span>🧝</span>
                <span>Encargados</span>
                <b>{st.boss.p.filter(Boolean).length + (st.boss.e ? 1 : 0) + (st.boss.s ? 1 : 0)}</b>
              </li>
            </ol>
            <p className="fi-hint">Espacio pone a trabajar lo que esté parado. El taller dura toda la temporada.</p>
          </div>
        </aside>
      </div>

      {away && (
        <div className="ta-away" role="dialog" aria-label="Mientras no estabas">
          <div>
            <b>¡Bienvenido de vuelta!</b>
            <p>
              En {fmtTime(Math.min(away.secs, AWAY_MAX_S))} tus encargados han ganado <strong>🍪 {fmtCookies(away.earned)}</strong>
              {away.secs > AWAY_MAX_S ? ` (trabajan como mucho ${AWAY_MAX_S / 3600} horas seguidas sin ti)` : ''}.
            </p>
            <button type="button" className="fi-go" onClick={() => setAway(null)}>
              ¡A trabajar!
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default Taller
