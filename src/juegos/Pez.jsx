// Pez Gordo (Season 4): eres un pez en el mar de las islas. Come plancton y peces más pequeños para crecer, huye de los
// grandes y sal del agua cuando quieras: cuanto más pesas, más cobras. Si te comen, pierdes la apuesta.
// La partida se juega aquí con la semilla que da el servidor (reglas en pez.js) y al acabar se mandan los movimientos:
// el servidor la repite y paga lo que salga allí.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from './useEffectEvent.js'
import * as pez from './pez.js'
import { eur } from './money.js'
import { isMuted, playChip, playLose, playPeg, playWin, setMuted } from './sound.js'
import { useCountUp } from './useCountUp.js'
import Help from './Help.jsx'
import Avatar from './Avatar.jsx'
import './Pez.css'

const PLANKTON = ['#8fe3ff', '#2ee6d0', '#ffe36e', '#ff8a4c', '#ff5fa2', '#b6ff7a']
const SKINS = [
  ['#ffb547', '#ff6b5a'],
  ['#2ee6d0', '#1b8fa8'],
  ['#ff5fa2', '#b0306a'],
  ['#b6ff7a', '#3e9e4a'],
  ['#8fb8ff', '#3a5fc8'],
  ['#ffe36e', '#d08a1c'],
  ['#c39bff', '#6a3fc0'],
  ['#ff9a7a', '#c0402a'],
]
const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }

// Un pez: cuerpo, cola, aleta y ojo, mirando hacia donde nada. ring: verde si te lo puedes comer, rojo si te come él.
function drawFish(ctx, f, angle, r, skin, ring, me, t) {
  ctx.save()
  ctx.translate(f.x, f.y)
  if (ring) {
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2)
    ctx.strokeStyle = ring
    ctx.lineWidth = Math.max(2, r * 0.08)
    ctx.globalAlpha = 0.55
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.rotate(angle)
  const wag = Math.sin(t / 120 + f.id) * 0.25
  // Cola.
  ctx.beginPath()
  ctx.moveTo(-r * 0.9, 0)
  ctx.lineTo(-r * 1.65, -r * (0.7 + wag * 0.4))
  ctx.lineTo(-r * 1.5, 0)
  ctx.lineTo(-r * 1.65, r * (0.7 - wag * 0.4))
  ctx.closePath()
  ctx.fillStyle = skin[1]
  ctx.fill()
  // Aleta de arriba (en los tiburones, la típica).
  ctx.beginPath()
  if (f.shark) {
    ctx.moveTo(-r * 0.2, -r * 0.7)
    ctx.lineTo(-r * 0.55, -r * 1.45)
    ctx.lineTo(r * 0.3, -r * 0.72)
  } else {
    ctx.moveTo(-r * 0.5, -r * 0.6)
    ctx.quadraticCurveTo(-r * 0.1, -r * 1.25, r * 0.35, -r * 0.65)
  }
  ctx.closePath()
  ctx.fillStyle = skin[1]
  ctx.fill()
  // Cuerpo.
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 1.12, r * 0.8, 0, 0, Math.PI * 2)
  const g = ctx.createLinearGradient(0, -r, 0, r)
  g.addColorStop(0, skin[0])
  g.addColorStop(1, skin[1])
  ctx.fillStyle = g
  ctx.fill()
  // Rayas blancas del pez del jugador (pez payaso).
  if (me) {
    ctx.save()
    ctx.clip()
    ctx.fillStyle = '#fff6e8'
    for (const x of [-0.45, 0.25]) ctx.fillRect(r * x, -r, r * 0.22, r * 2)
    ctx.restore()
    ctx.lineWidth = Math.max(1.5, r * 0.07)
    ctx.strokeStyle = '#2a0f2e'
    ctx.stroke()
  }
  // Barriga clara y ojo.
  ctx.beginPath()
  ctx.ellipse(r * 0.1, r * 0.35, r * 0.7, r * 0.28, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(r * 0.6, -r * 0.18, r * 0.2, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(r * 0.66, -r * 0.18, r * 0.1, 0, Math.PI * 2)
  ctx.fillStyle = '#10142a'
  ctx.fill()
  if (f.shark) {
    ctx.beginPath()
    ctx.moveTo(r * 0.55, r * 0.25)
    ctx.lineTo(r * 1.0, r * 0.2)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = Math.max(1, r * 0.05)
    ctx.stroke()
  }
  ctx.restore()
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
    if (view.bet > 0 && !game.current) setStuck(true)
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
    game.current = { w, stake: bet, inputs: [], dir: [0, 0], last: null, prev: new Map(), acc: 0, at: performance.now(), popups: [], zoom: 1, pelletSound: 0 }
    setResult(null)
    setHud({ mass: w.me.mass, tick: 0 })
    setPhase('playing')
    playChip()
  }

  // Manda la partida al servidor (te comieron, saliste o se acabó el tiempo) y enseña lo que pagó.
  const finish = useEffectEvent(async (cash) => {
    const g = game.current
    if (!g || phase !== 'playing') return
    setPhase('sending')
    const body = await request({ t: 'solo_fish', a: 'end', inputs: g.inputs, tick: g.w.tick, cash })
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

  // Bucle de la partida: pasos fijos de TICK_MS (como en el servidor) y dibujo a cada fotograma, interpolando.
  const frame = useEffectEvent((now) => {
    const g = game.current
    const el = canvas.current
    if (!g || !el) return
    if (phase === 'playing') {
      g.acc += Math.min(250, now - (g.lastFrame ?? now))
      while (g.acc >= pez.TICK_MS && g.w.me.alive && g.w.tick < pez.MAX_TICKS) {
        g.acc -= pez.TICK_MS
        const dir = dirNow()
        g.dir = dir
        const key = `${dir[0]},${dir[1]}`
        if (key !== g.last) {
          g.inputs.push([g.w.tick, dir[0], dir[1]])
          g.last = key
        }
        g.prev = new Map([[-1, { x: g.w.me.x, y: g.w.me.y }], ...g.w.bots.map((b) => [b.id, { x: b.x, y: b.y }])])
        pez.step(g.w, dir)
        for (const ev of g.w.events) {
          if (ev.kind === 'eat') {
            g.popups.push({ x: ev.x, y: ev.y, text: `+${Math.round(ev.mass)} ¡${ev.name}!`, at: now, big: true })
            playChip()
          } else if (ev.kind === 'gold') {
            g.popups.push({ x: ev.x, y: ev.y, text: '+6', at: now })
            playPeg(2)
          } else if (ev.kind === 'pellet' && now - g.pelletSound > 140) {
            g.pelletSound = now
            playPeg(6)
          }
        }
        setHud({ mass: g.w.me.mass, tick: g.w.tick })
      }
      if (!g.w.me.alive) {
        playLose()
        finish(false)
      } else if (g.w.tick >= pez.MAX_TICKS) finish(true)
    }
    g.lastFrame = now
    draw(el, g, now)
  })

  useEffect(() => {
    if (phase !== 'playing' && phase !== 'sending' && phase !== 'over') return
    let raf = 0
    const loop = (now) => {
      frame(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])

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

// Fondo del mar antes de empezar: unos peces que nadan solos (CSS).
function IdleSea() {
  return (
    <div className="pz-idle" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="pz-idle__fish" style={{ '--i': i }} />
      ))}
      <p>
        Come, crece
        <br />
        y que no te coman
      </p>
    </div>
  )
}

// Dibuja el mar: fondo, rayos de luz, bordes, plancton, peces, textos flotantes y el minimapa.
function draw(el, g, now) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = el.clientWidth
  const ch = el.clientHeight
  if (el.width !== Math.round(cw * dpr) || el.height !== Math.round(ch * dpr)) {
    el.width = Math.round(cw * dpr)
    el.height = Math.round(ch * dpr)
  }
  const ctx = el.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const w = g.w
  const a = Math.min(1, g.acc / pez.TICK_MS) // cuánto falta para el siguiente paso, para interpolar
  const lerp = (id, f) => {
    const p = g.prev.get(id)
    return p ? { x: p.x + (f.x - p.x) * a, y: p.y + (f.y - p.y) * a } : { x: f.x, y: f.y }
  }
  const me = w.me
  const mePos = lerp(-1, me)
  const meR = pez.radiusOf(me.mass)
  // Zoom: se aleja al crecer, con suavidad.
  const target = (Math.min(cw, ch) / 620) * Math.max(0.5, Math.min(1.25, 1.25 - (meR - 18) / 140))
  g.zoom += (target - g.zoom) * 0.08
  const z = g.zoom

  // Fondo del mar.
  const bg = ctx.createLinearGradient(0, 0, 0, ch)
  bg.addColorStop(0, '#0f5a78')
  bg.addColorStop(1, '#06223d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cw, ch)
  // Rayos de luz que bajan desde la superficie.
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = '#c8f6ff'
  for (let i = 0; i < 6; i++) {
    const x = ((i * 260 - mePos.x * z * 0.3 + now * 0.01) % (cw + 400)) - 200
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 90, 0)
    ctx.lineTo(x + 220, ch)
    ctx.lineTo(x + 60, ch)
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.scale(z, z)
  ctx.translate(-mePos.x, -mePos.y)

  // Fuera del mar (bordes): arena oscura.
  ctx.fillStyle = 'rgba(10, 18, 40, 0.75)'
  ctx.fillRect(-2000, -2000, pez.WORLD + 4000, 2000)
  ctx.fillRect(-2000, pez.WORLD, pez.WORLD + 4000, 2000)
  ctx.fillRect(-2000, 0, 2000, pez.WORLD)
  ctx.fillRect(pez.WORLD, 0, 2000, pez.WORLD)
  ctx.strokeStyle = 'rgba(143, 227, 255, 0.35)'
  ctx.lineWidth = 4 / z
  ctx.strokeRect(0, 0, pez.WORLD, pez.WORLD)
  // Burbujas fijas del fondo, para notar que te mueves.
  ctx.fillStyle = 'rgba(200, 245, 255, 0.08)'
  for (let gx = 50; gx < pez.WORLD; gx += 100) {
    for (let gy = 50; gy < pez.WORLD; gy += 100) {
      ctx.beginPath()
      ctx.arc(gx + ((gy * 7) % 40) - 20, gy + ((gx * 3) % 40) - 20, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Plancton.
  for (const p of w.pellets) {
    const pulse = 1 + Math.sin(now / 300 + p.x) * 0.2
    ctx.beginPath()
    ctx.arc(p.x, p.y, (p.gold ? 7 : 4) * pulse, 0, Math.PI * 2)
    ctx.fillStyle = p.gold ? '#ffe36e' : PLANKTON[p.hue]
    ctx.shadowColor = p.gold ? '#ffb547' : PLANKTON[p.hue]
    ctx.shadowBlur = p.gold ? 16 : 8
    ctx.fill()
  }
  ctx.shadowBlur = 0

  // Peces: primero los pequeños, para que los grandes queden encima.
  const list = [...w.bots.filter((b) => b.alive), ...(me.alive ? [me] : [])].sort((x, y) => x.mass - y.mass)
  for (const f of list) {
    const isMe = f === me
    const pos = lerp(isMe ? -1 : f.id, f)
    const r = pez.radiusOf(f.mass)
    const angle = Math.atan2(f.vy, f.vx || 0.0001)
    let ring = null
    if (!isMe && me.alive) {
      if (me.mass >= f.mass * 1.15) ring = '#43d17c'
      else if (f.mass >= me.mass * 1.15) ring = '#ff4f5a'
    }
    const skin = isMe ? ['#ff9a3c', '#e2562f'] : f.shark ? ['#9fb4c8', '#4a5e78'] : SKINS[f.hue % SKINS.length]
    drawFish(ctx, { ...f, x: pos.x, y: pos.y }, angle, r, skin, ring, isMe, now)
    // Nombre y peso.
    ctx.font = `800 ${Math.max(11, r * 0.42) / Math.max(0.7, z)}px "Instrument Sans Variable", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.lineWidth = 3 / z
    ctx.strokeStyle = 'rgba(6, 14, 34, 0.8)'
    ctx.fillStyle = isMe ? '#ffe36e' : '#fff'
    const label = isMe ? `Tú · ${Math.round(f.mass)}` : `${f.name} · ${Math.round(f.mass)}`
    ctx.strokeText(label, pos.x, pos.y - r * 1.5 - 6 / z)
    ctx.fillText(label, pos.x, pos.y - r * 1.5 - 6 / z)
  }

  // Textos flotantes al comer.
  g.popups = g.popups.filter((p) => now - p.at < 1100)
  for (const p of g.popups) {
    const k = (now - p.at) / 1100
    ctx.globalAlpha = 1 - k
    ctx.font = `900 ${(p.big ? 22 : 15) / Math.max(0.7, z)}px "Lilita One", system-ui, sans-serif`
    ctx.fillStyle = p.big ? '#ffe36e' : '#b6ff7a'
    ctx.strokeStyle = 'rgba(6, 14, 34, 0.85)'
    ctx.lineWidth = 4 / z
    ctx.strokeText(p.text, p.x, p.y - k * 50)
    ctx.fillText(p.text, p.x, p.y - k * 50)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // Minimapa abajo a la izquierda.
  const m = Math.min(110, Math.min(cw, ch) * 0.22)
  const mx = 12
  const my = ch - m - 12
  const s = m / pez.WORLD
  ctx.fillStyle = 'rgba(6, 14, 34, 0.6)'
  ctx.strokeStyle = 'rgba(143, 227, 255, 0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect?.(mx, my, m, m, 10)
  ctx.fill()
  ctx.stroke()
  for (const b of w.bots) {
    if (!b.alive) continue
    ctx.fillStyle = me.mass >= b.mass * 1.15 ? '#43d17c' : b.mass >= me.mass * 1.15 ? '#ff4f5a' : '#cfe7ef'
    ctx.beginPath()
    ctx.arc(mx + b.x * s, my + b.y * s, Math.max(1.5, pez.radiusOf(b.mass) * s), 0, Math.PI * 2)
    ctx.fill()
  }
  if (me.alive) {
    ctx.fillStyle = '#ffe36e'
    ctx.beginPath()
    ctx.arc(mx + me.x * s, my + me.y * s, Math.max(2.5, meR * s), 0, Math.PI * 2)
    ctx.fill()
  }
}
