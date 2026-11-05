// Pez Gordo (Season 4): eres un pez en el mar de las islas. Come plancton y peces más pequeños para crecer, huye de los
// grandes y sal del agua cuando quieras: cuanto más pesas, más cobras. Si te comen, pierdes la apuesta.
// La partida se juega aquí con la semilla que da el servidor (reglas en pez.js) y al acabar se mandan los movimientos:
// el servidor la repite y paga lo que salga allí.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import * as pez from './pez.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playChip, playLose, playPeg, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import { PLANKTON, burst, draw, newLook } from './pezDraw.js'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import './Pez.css'

const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }

// El mar de fondo antes de empezar: un mundo de verdad con sus peces, pero sin ti.
function demoGame() {
  const w = pez.createWorld(Math.floor(Math.random() * 4294967296))
  w.me.alive = false
  return { w, demo: true, prev: new Map(), acc: 0, ...newLook() }
}

// Guarda dónde estaba cada pez antes del paso, para interpolar al dibujar.
function stepWorld(g, dir) {
  g.prev = new Map([[-1, { x: g.w.me.x, y: g.w.me.y }], ...g.w.bots.map((b) => [b.id, { x: b.x, y: b.y }])])
  pez.step(g.w, dir)
}

// Lo que pasó en el último paso, en partículas, textos y sonido. mine: solo suena lo de una partida de verdad.
function effects(g, now, mine) {
  for (const ev of g.w.events) {
    if (ev.kind === 'eat') {
      g.popups.push({ x: ev.x, y: ev.y, text: `+${Math.round(ev.mass)} ¡${ev.name}!`, at: now, big: true })
      burst(g, ev.x, ev.y, '#ffd2a0', 14, 'bit', 3)
      burst(g, ev.x, ev.y, '#fff', 8, 'bubble', 1.4)
      g.shake = Math.max(g.shake, 7)
      g.flash = { at: now, ms: 260, color: '#fff6e8', alpha: 0.14 }
      if (mine) playChip()
    } else if (ev.kind === 'gold') {
      g.popups.push({ x: ev.x, y: ev.y, text: '+6', at: now })
      burst(g, ev.x, ev.y, '#ffc93c', 9, 'spark', 2.2)
      if (mine) playPeg(2)
    } else if (ev.kind === 'pellet') {
      burst(g, ev.x, ev.y, PLANKTON[(ev.x + ev.y) % PLANKTON.length], 2, 'spark', 1)
      if (mine && now - g.pelletSound > 140) {
        g.pelletSound = now
        playPeg(6)
      }
    } else if (ev.kind === 'eaten') {
      burst(g, ev.x, ev.y, '#ff9a5a', 22, 'bit', 3.6)
      burst(g, ev.x, ev.y, '#fff', 14, 'bubble', 2)
      g.shake = 16
      g.flash = { at: now, ms: 800, color: '#ff2a44', alpha: 0.45 }
    } else if (ev.kind === 'bite') {
      burst(g, ev.x, ev.y, '#cfe7ef', 6, 'bit', 2)
      burst(g, ev.x, ev.y, '#fff', 4, 'bubble', 1)
    }
  }
}

export default function Pez({ onExit, juegos }) {
  const { request } = juegos
  const [bet, setBet] = useState(1000)
  const [sound, setSound] = useState(() => !isMuted())
  const [phase, setPhase] = useState('idle') // idle | playing | sending | over
  const [hud, setHud] = useState({ mass: pez.START_MASS, tick: 0 })
  const [result, setResult] = useState(null)
  const [ranking, setRanking] = useState([])
  const [best, setBest] = useState(null)
  const [stuck, setStuck] = useState(false) // partida a medias de antes (recarga): solo se puede terminar
  const [busy, setBusy] = useState(false)
  const canvas = useRef(null)
  const wrap = useRef(null)
  const game = useRef(null) // { w, inputs, dir, last, prev, acc, at, popups, zoom }
  const pointer = useRef(null)
  const keys = useRef(new Set())
  const serverBalance = juegos.me?.balance ?? 0
  const shownBank = useCountUp(serverBalance)

  const sync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_fish', a: 'sync' })
    const view = body?.solo
    if (!view) return
    if (view.ranking) setRanking(view.ranking)
    setBest(view.best)
    if (view.bet > 0 && (!game.current || game.current.demo)) setStuck(true)
  })
  useEffect(() => {
    sync()
  }, [])

  const start = async () => {
    if (busy || bet > serverBalance) return
    setBusy(true)
    const body = await request({ t: 'solo_fish', a: 'start', bet })
    setBusy(false)
    const view = body?.solo
    if (!view || view.seed === null || view.seed === undefined) return
    if (view.ranking) setRanking(view.ranking)
    const w = pez.createWorld(view.seed)
    game.current = { w, stake: bet, inputs: [], dir: [0, 0], last: null, prev: new Map(), acc: 0, pelletSound: 0, out: null, ...newLook() }
    setResult(null)
    setHud({ mass: w.me.mass, tick: 0 })
    setPhase('playing')
    playChip()
  }

  // Manda la partida al servidor (te comieron, saliste o se acabó el tiempo) y enseña lo que pagó.
  const finish = useEffectEvent(async (cash) => {
    const g = game.current
    if (!g || g.demo || phase !== 'playing') return
    setPhase('sending')
    const sent = request({ t: 'solo_fish', a: 'end', inputs: g.inputs, tick: g.w.tick, cash })
    // Tu pez sale del agua (solo se ve): el mar sigue moviéndose sin ti mientras llega el resultado.
    const me = g.w.me
    if (me.alive) {
      g.out = { cash: true, at: performance.now(), x: me.x, y: me.y, r: pez.radiusOf(me.mass) }
      burst(g, me.x, me.y, '#fff', 18, 'bubble', 2.4)
      me.alive = false
    }
    const body = await sent
    const view = body?.solo
    if (view?.ranking) setRanking(view.ranking)
    if (view) setBest(view.best)
    const last = view?.last
    setResult(last ?? { payout: 0, net: 0, mass: Math.round(g.w.me.mass), eatenBy: g.w.me.eatenBy, error: true })
    if (last?.payout > 0) playWin(last.mult >= 3)
    setPhase('over')
  })

  // Partida que quedó a medias al recargar: el servidor la repite sin moverte desde donde empezó.
  const endStuck = async () => {
    setBusy(true)
    const body = await request({ t: 'solo_fish', a: 'end', inputs: [], tick: pez.MAX_TICKS, cash: true })
    setBusy(false)
    setStuck(false)
    if (body?.solo?.last) {
      setResult(body.solo.last)
      setPhase('over')
    }
  }

  // Rumbo: hacia el puntero (desde el centro de la pantalla, donde está tu pez) o con las flechas.
  const dirNow = () => {
    const k = keys.current
    if (k.size) {
      let x = 0
      let y = 0
      for (const key of k) {
        x += KEYS[key][0]
        y += KEYS[key][1]
      }
      const len = Math.hypot(x, y) || 1
      return [Math.round((x / len) * 100), Math.round((y / len) * 100)]
    }
    const p = pointer.current
    const el = canvas.current
    if (!p || !el) return game.current?.dir ?? [0, 0]
    const box = el.getBoundingClientRect()
    const dx = p.x - (box.left + box.width / 2)
    const dy = p.y - (box.top + box.height / 2)
    const len = Math.hypot(dx, dy)
    const reach = Math.min(box.width, box.height) * 0.22
    const power = Math.min(1, len / reach)
    if (len < 4) return [0, 0]
    return [Math.round((dx / len) * power * 100), Math.round((dy / len) * power * 100)]
  }

  // Al volver a la portada, un mar nuevo de fondo.
  useEffect(() => {
    if (phase === 'idle' && (!game.current || !game.current.demo)) game.current = demoGame()
  }, [phase])

  // Bucle de la partida: pasos fijos de TICK_MS (como en el servidor) y dibujo a cada fotograma, interpolando. Fuera de
  // la partida, el mar sigue moviéndose sin ti.
  const frame = useEffectEvent((now) => {
    const g = game.current
    const el = canvas.current
    if (!g || !el) return
    g.acc += Math.min(250, now - (g.lastFrame ?? now))
    g.lastFrame = now
    if (phase === 'playing' && !g.demo) {
      while (g.acc >= pez.TICK_MS && g.w.me.alive && g.w.tick < pez.MAX_TICKS) {
        g.acc -= pez.TICK_MS
        const dir = dirNow()
        g.dir = dir
        const key = `${dir[0]},${dir[1]}`
        if (key !== g.last) {
          g.inputs.push([g.w.tick, dir[0], dir[1]])
          g.last = key
        }
        stepWorld(g, dir)
        effects(g, now, true)
        setHud({ mass: g.w.me.mass, tick: g.w.tick })
      }
      if (!g.w.me.alive) {
        playLose()
        buzz([60, 40, 200])
        finish(false)
      } else if (g.w.tick >= pez.MAX_TICKS) finish(true)
    } else {
      while (g.acc >= pez.TICK_MS) {
        g.acc -= pez.TICK_MS
        stepWorld(g, null)
        effects(g, now, false)
      }
    }
    draw(el, g, now, { demo: g.demo, out: g.out })
  })

  useEffect(() => {
    let raf = 0
    const loop = (now) => {
      frame(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Teclado: flechas o WASD para nadar, espacio o Enter para salir del agua.
  useEffect(() => {
    if (phase !== 'playing') return
    const down = (e) => {
      if (Object.hasOwn(KEYS, e.key)) {
        keys.current.add(e.key)
        e.preventDefault()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        finish(true)
      }
    }
    const up = (e) => keys.current.delete(e.key)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      keys.current.clear()
    }
  }, [phase])

  const mult = pez.multOf(hud.mass)
  const left = Math.max(0, Math.ceil(((pez.MAX_TICKS - hud.tick) * pez.TICK_MS) / 1000))
  const playing = phase === 'playing'
  const stake = phase === 'idle' ? bet : (game.current?.stake ?? bet)

  return (
    <main className="app pz-app">
      <header className="top">
        <h1>Pez Gordo</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            {best && (
              <div>
                <dt>Tu récord de hoy</dt>
                <dd>×{best.mult.toLocaleString('es-ES')}</dd>
              </div>
            )}
          </dl>
          <div className="toggles">
            <button type="button" className="tg tg--back" onClick={onExit} disabled={playing}>
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
            <Help className="tg tg--help" title="Cómo se juega a Pez Gordo">
              <p>
                Eres el pez payaso. Mueve el ratón o el dedo hacia donde quieras nadar (o usa las flechas). Come <b>plancton</b> para crecer (el
                dorado vale más) y cómete a los <b>peces más pequeños</b> (los del anillo verde). Los del <b>anillo rojo</b> te comen a ti: huye.
              </p>
              <p>
                Empiezas pesando {pez.START_MASS} kg, que valen ×{pez.multOf(pez.START_MASS).toLocaleString('es-ES')}. Con {pez.BREAK_EVEN} kg recuperas la
                apuesta y cada kilo más es ganancia, hasta ×{pez.MAX_MULT}. <b>Sal del agua</b> cuando quieras para cobrar; a los{' '}
                {(pez.MAX_TICKS * pez.TICK_MS) / 1000} s sales tú solo. Si te comen, pierdes la apuesta.
              </p>
              <p>Los peces grandes adelgazan poco a poco. Los demás peces los lleva el casino; tu partida la comprueba el servidor al acabar.</p>
            </Help>
          </div>
        </div>
      </header>

      <div className="pz-layout fill">
        <div className="pz-stage" ref={wrap}>
          <canvas
            ref={canvas}
            className="pz-canvas"
            onPointerMove={(e) => {
              pointer.current = { x: e.clientX, y: e.clientY }
            }}
            onPointerDown={(e) => {
              pointer.current = { x: e.clientX, y: e.clientY }
              e.currentTarget.setPointerCapture?.(e.pointerId)
            }}
            aria-label="El mar de Pez Gordo"
          />
          {phase === 'idle' && <IdleSea />}
          {(playing || phase === 'sending') && (
            <div className="pz-hud" aria-live="off">
              <span className="pz-hud__mass">
                <small>Peso</small>
                <b>{Math.round(hud.mass)} kg</b>
                <span className="pz-meter" title={mult >= 1 ? 'En ganancias' : `Con ${pez.BREAK_EVEN} kg recuperas la apuesta`}>
                  <span style={{ width: `${Math.min(100, (hud.mass / pez.BREAK_EVEN) * 100)}%` }} />
                </span>
                <em>{mult >= 1 ? '¡En ganancias!' : `${Math.ceil(pez.BREAK_EVEN - hud.mass)} kg para recuperar`}</em>
              </span>
              <span className={`pz-hud__mult ${mult >= 1 ? 'is-up' : ''}`}>
                <small>Si sales ahora</small>
                <b>
                  ×{mult.toLocaleString('es-ES')} · {eur(Math.floor(stake * mult))}
                </b>
              </span>
              <span className="pz-hud__time">
                <i style={{ width: `${(hud.tick / pez.MAX_TICKS) * 100}%` }} />
                <em>{left} s</em>
              </span>
            </div>
          )}
          {playing && (
            <button type="button" className="pz-cash" onClick={() => finish(true)}>
              Salir del agua
              <small>{eur(Math.floor(stake * mult))}</small>
            </button>
          )}
          {phase === 'sending' && <p className="pz-banner">Comprobando la partida…</p>}
          {phase === 'over' && result && (
            <div className={`pz-result ${result.payout > 0 ? 'is-win' : 'is-lose'}`} role="status">
              {result.payout > 0 ? (
                <>
                  <b>¡Fuera del agua con {result.mass} kg!</b>
                  <span>
                    ×{result.mult.toLocaleString('es-ES')} · cobras {eur(result.payout)}
                  </span>
                </>
              ) : (
                <>
                  <b>{result.eatenBy ? `¡Te ha comido ${result.eatenBy}!` : 'Se acabó'}</b>
                  <span>Pesabas {result.mass} kg · pierdes {eur(result.stake ?? stake)}</span>
                </>
              )}
              <button type="button" className="s4-btn" onClick={() => setPhase('idle')}>
                Otra partida
              </button>
            </div>
          )}
        </div>

        <aside className="pz-panel">
          {stuck ? (
            <section className="pz-group">
              <h2>Partida a medias</h2>
              <p className="pz-hint">Tenías un pez en el agua cuando se cerró la página. Termínala para seguir: el servidor la acaba sin que te muevas.</p>
              <button type="button" className="s4-btn s4-btn--hot" disabled={busy} onClick={endStuck}>
                Terminar la partida
              </button>
            </section>
          ) : (
            <section className="pz-group">
              <h2>Tu apuesta</h2>
              <div className="pz-bets" role="group" aria-label="Apuesta">
                {pez.BETS.map((b) => (
                  <button key={b} type="button" aria-pressed={bet === b} disabled={playing || b > serverBalance} onClick={() => setBet(b)}>
                    {eur(b)}
                  </button>
                ))}
              </div>
              <button type="button" className="s4-btn s4-btn--hot pz-go" disabled={phase === 'playing' || phase === 'sending' || busy || bet > serverBalance} onClick={start}>
                ¡Al agua! · {eur(bet)}
              </button>
              <p className="pz-hint">
                Empiezas valiendo ×{pez.multOf(pez.START_MASS).toLocaleString('es-ES')}: crece hasta {pez.BREAK_EVEN} kg para recuperar la apuesta.
              </p>
            </section>
          )}
          <section className="pz-group">
            <h2>Los peces más gordos de hoy</h2>
            {ranking.length ? (
              <ol className="pz-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''}>
                    <span>{i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={28} />
                    <b>{r.name}</b>
                    <em>
                      {r.mode} kg · ×{r.mult.toLocaleString('es-ES')}
                    </em>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="pz-hint">Nadie ha salido del agua hoy con premio. ¡Sé el primero!</p>
            )}
          </section>
          <section className="pz-group pz-legend">
            <h2>Cómo se juega</h2>
            <p>
              <i className="pz-dot pz-dot--green" /> Te lo puedes comer
            </p>
            <p>
              <i className="pz-dot pz-dot--red" /> Te come a ti: ¡huye!
            </p>
            <p>
              <i className="pz-dot pz-dot--gold" /> Plancton dorado: +6 kg
            </p>
          </section>
        </aside>
      </div>
    </main>
  )
}

// Antes de empezar: el lema encima del mar, que se mueve solo.
function IdleSea() {
  return (
    <div className="pz-idle" aria-hidden="true">
      <p>
        Come, crece
        <br />
        y que no te coman
      </p>
      <small>Mueve el ratón o el dedo para nadar · flechas o WASD</small>
    </div>
  )
}
