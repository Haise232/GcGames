// La Regata en vivo (Season 4): una regata para todos cada 44 s. Antes de cada una sale el parte del tiempo: el clima
// (despejado, tormenta, remolino, kraken…) y con él la probabilidad de cada velero. Se apuesta al Ganador, a la Exacta
// (1.º y 2.º en orden) o al Trío (1.º, 2.º y 3.º en orden). El servidor sortea y paga (reglas en regatta.js); aquí se anima
// la regata con su reloj, así que todos ven lo mismo a la vez: los rayos, el Kraken y el remolino salen del sorteo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BETS_MS,
  BOATS,
  CHIPS,
  HOUSE,
  KINDS,
  KIND_LIST,
  MAX_BETS,
  MAX_ODDS,
  MAX_TOTAL,
  N,
  ROUND_MS,
  SAIL_MAX_MS,
  betKey,
  climaOf,
  fmtOdds,
  oddsFor,
  phaseAt,
  progress,
  totalOf,
} from './regatta.js'
import { eur } from '../comun/money.js'
import {
  isMuted,
  playBeep,
  playChip,
  playClima,
  playGo,
  playHorn,
  playKraken,
  playLastLap,
  playLose,
  playOvation,
  playShutter,
  playSurge,
  playThunder,
  playWhirl,
  playWin,
  setMuted,
} from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import WinToast from '../comun/WinToast.jsx'
import Help from '../comun/Help.jsx'
import '../roulette/Roulette.css'
import './Regata.css'

const SEND_MS = 350 // las apuestas se mandan un momento después de dejar de tocar
const LAST_CALL_MS = 4000
const WINNERS_WAIT_MS = 1200
const BANNER_MS = 3200 // cuánto se ve el cartel del clima al abrirse las apuestas
const PHOTO_MS = 150 // si el 2.º llega a menos de esto del 1.º, es foto finish
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const pct = (bp) => `${(bp / 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`
const sameBets = (a, b) => a.length === b.length && a.every((x) => b.some((y) => betKey(y) === betKey(x) && y.amount === x.amount))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const smooth = (k) => k * k * (3 - 2 * k)
const names = (boats) => boats.map((b) => BOATS[b].name).join(' › ')

// --- Arte ---

function Sailboat({ boat, i }) {
  return (
    <g className="rg-boat__art">
      <path d="M-26 6 L26 6 L18 16 L-18 16 Z" fill={boat.color} stroke="#0a1a30" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-2 4 V-40" stroke="#5a3a1a" strokeWidth="3" />
      <path className="rg-sail" d="M0 -38 Q 22 -16 20 2 L0 2 Z" fill={boat.sail} stroke="#0a1a30" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M-4 -34 Q -18 -14 -16 2 L-4 2 Z" fill={boat.sail} opacity="0.85" stroke="#0a1a30" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="9" cy="-12" r="6.5" fill={boat.color} />
      <text x="9" y="-8.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">
        {i + 1}
      </text>
      <path className="rg-wake" d="M-26 12 Q-40 10 -54 14" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>
  )
}

// Tentáculos del Kraken: salen del agua bajo el velero que atrapan (las motitas son las ventosas).
function Tentacles() {
  const paths = ['M-34 16 C -54 -8 -16 -24 -30 -60', 'M0 18 C 18 -12 -18 -30 4 -74', 'M34 16 C 54 -6 16 -22 32 -54']
  return (
    <g className="rg-tentacles">
      <ellipse cx="0" cy="14" rx="58" ry="11" fill="#04171c" opacity="0.6" />
      {paths.map((d) => (
        <g key={d}>
          <path d={d} stroke="#4a1f78" strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d={d} stroke="#7a42b8" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d={d} stroke="#e6c8ff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeDasharray="0 9" />
        </g>
      ))}
    </g>
  )
}

// El campo de regatas: el cielo y el mar cambian con el clima (colores en Regata.css), con la isla al fondo, boyas de
// salida y llegada y un velero por calle. Las posiciones las mueve requestAnimationFrame con el reloj del servidor (sin
// pasar por React en cada frame), igual que el espectáculo del clima: rayos, niebla, remolino y tentáculos.
const W = 900
const H = 420
const START_X = 90
const FINISH_X = 800
const laneY = (i) => 150 + i * 52
const WHIRL_X = START_X + 0.47 * (FINISH_X - START_X)
const fracOf = (x) => (x - START_X) / (FINISH_X - START_X)
// Cuánto tapa la niebla en cada punto del recorrido (0 a 1): la banda del medio, con bordes suaves.
const fogAt = (f) => smooth(clamp((f - 0.24) / 0.12, 0, 1)) * (1 - smooth(clamp((f - 0.64) / 0.14, 0, 1)))

const RAIN = Array.from({ length: 150 }, (_, k) => ({ x: ((k * 53) % 1060) - 80, y: Math.floor(k / 15) * 60 + ((k * 29) % 50) - 60 }))

function Course({ clock, round, race, clima, mine, winner, reduced, onNews }) {
  const stage = useRef(null)
  const boats = useRef([])
  const flag = useRef(null)
  const fog = useRef(null)
  const flash = useRef(null)
  const bolt = useRef(null)
  const krakens = useRef([])
  const props = useRef(null)
  const by = useMemo(() => Array.from({ length: N }, (_, i) => (race?.stalls ?? []).filter((s) => s.boat === i)), [race])
  props.current = { race, by, clima, onNews }
  const amp = { despejado: 2, viento: 4, niebla: 2.5, tormenta: 8, remolino: 3.5, kraken: 4, calima: 1.2, arcoiris: 2.5 }[clima] ?? 2

  useEffect(() => {
    const fired = new Set()
    const rankAt = [] // rangos de hace un momento, para cazar las remontadas
    let lastLeader = -1
    let lastNews = -1e9
    let sample = -1e9
    let view = ''
    let frame
    const draw = () => {
      const t = clock()
      const { race: r, by: stalls, clima: cl, onNews: say } = props.current
      const ms = r ? t - r.start : -1
      const racing = r && ms > 0
      // Cuenta un suceso una sola vez (y solo si es de ahora: si entras tarde no se narra lo que ya pasó).
      const fire = (key, at, news, sound, free = false) => {
        if (fired.has(key) || ms < at) return
        fired.add(key)
        if (ms - at > 1500) return
        if (!free && ms - lastNews < 1500) return
        if (news) {
          say(news)
          lastNews = ms
        }
        sound?.()
      }
      const at = []
      const xs = []
      for (let i = 0; i < N; i++) {
        at[i] = racing ? Math.min(1.1, progress(r.finish[i], r.wobble[i], ms, stalls[i])) : 0
        xs[i] = START_X + at[i] * (FINISH_X - START_X)
      }
      for (let i = 0; i < N; i++) {
        const el = boats.current[i]
        if (!el) continue
        const s = racing ? stalls[i].find((q) => ms >= q.at && ms < q.at + q.dur) : null
        let bob = reduced ? 0 : Math.sin(t / 420 + i * 1.7) * amp
        let rot = reduced ? 0 : Math.sin(t / 600 + i) * (1.2 + amp * 0.5)
        let scale = 1
        let dy = 0
        if (s && !reduced) {
          if (s.what === 'remolino') {
            rot = ((ms - s.at) / 1000) * 400
            scale = 0.9
          } else if (s.what === 'kraken') {
            rot = 9 + Math.sin(ms / 55) * 4
            dy = 5
          } else {
            bob = 0
            rot = 0
          }
        }
        el.setAttribute('transform', `translate(${xs[i].toFixed(1)} ${(laneY(i) + bob + dy).toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${scale})`)
        // En la niebla los veleros desaparecen en mitad del campo.
        el.setAttribute('opacity', cl === 'niebla' && racing ? (1 - 0.92 * fogAt(fracOf(xs[i]))).toFixed(2) : '1')
      }
      // Tentáculos: crecen al atrapar, se agitan y se hunden al soltar.
      const kr = r ? r.stalls.filter((s) => s.what === 'kraken') : []
      krakens.current.forEach((el, k) => {
        if (!el) return
        const s = kr[k]
        const grow = s && racing ? smooth(clamp((ms - s.at) / 450, 0, 1)) * (1 - smooth(clamp((ms - s.at - s.dur + 500) / 500, 0, 1))) : 0
        if (grow <= 0) return el.setAttribute('opacity', '0')
        const x = START_X + progress(r.finish[s.boat], r.wobble[s.boat], s.at) * (FINISH_X - START_X)
        const sway = reduced ? 0 : Math.sin(ms / 130 + k) * 2.5
        el.setAttribute('transform', `translate(${(x + sway).toFixed(1)} ${laneY(s.boat) + 10}) scale(1 ${grow.toFixed(2)})`)
        el.setAttribute('opacity', '1')
      })
      // La banda de niebla: suave antes de salir y cerrada durante la carrera.
      if (fog.current) fog.current.setAttribute('opacity', racing ? '0.96' : '0.34')
      // Rayos: destello doble y el trazo del rayo; el trueno llega un momento después.
      let flashOp = 0
      let boltOp = 0
      if (racing && r.bolts.length) {
        r.bolts.forEach((b, k) => {
          const dt = ms - b.at
          if (dt >= 0 && dt < 520) {
            flashOp = Math.max(flashOp, dt < 70 ? 0.55 : dt < 150 ? 0.08 : dt < 230 ? 0.45 : 0.25 * (1 - (dt - 230) / 290))
            boltOp = dt < 260 ? 1 : 0
            bolt.current?.setAttribute('transform', `translate(${(b.x * W).toFixed(0)} 0)`)
          }
          fire(`rayo-${k}`, b.at + 260, null, playThunder, true)
        })
      }
      // Foto finish: el flash del obturador al cruzar el primero.
      const photo = r && r.finish[r.order[1]] - r.finish[r.order[0]] <= PHOTO_MS
      if (racing && photo) {
        const dt = ms - r.finish[r.winner]
        if (dt >= 0 && dt < 380) flashOp = Math.max(flashOp, 0.5 * (1 - dt / 380))
      }
      if (flash.current) flash.current.setAttribute('opacity', reduced ? '0' : flashOp.toFixed(2))
      if (bolt.current) bolt.current.setAttribute('opacity', reduced ? '0' : String(boltOp))
      if (flag.current) flag.current.dataset.done = r && ms >= r.finish[r.winner] ? '1' : '0'

      if (racing) {
        // La narración: lo que hace el clima y lo que pasa en la regata.
        fire('go', 0, null, playGo, true)
        r.stalls.forEach((s, k) => {
          const who = BOATS[s.boat].name
          if (s.what === 'kraken') {
            fire(`s${k}`, s.at, { text: `¡El Kraken atrapa a ${who}!`, tone: 'kraken' }, playKraken, true)
            fire(`e${k}`, s.at + s.dur, { text: `¡${who} se libera!`, tone: 'good' }, playSurge, true)
          } else if (s.what === 'remolino') {
            fire(`s${k}`, s.at, { text: `¡${who} cae en el remolino!`, tone: 'whirl' }, playWhirl, true)
            fire(`e${k}`, s.at + s.dur, { text: `¡${who} sale disparado!`, tone: 'good' }, playSurge, true)
          } else {
            fire(`s${k}`, s.at, { text: `¡${who} se queda sin viento!`, tone: 'hot' }, null, true)
            fire(`e${k}`, s.at + s.dur, { text: `¡${who} recupera el viento!`, tone: 'good' }, playSurge, true)
          }
        })
        const order = [...Array(N).keys()].sort((a, b) => at[b] - at[a])
        const leader = order[0]
        const lf = fracOf(xs[leader])
        if (cl === 'niebla' && lf >= 0.26 && lf < 0.7) fire('fog1', ms, { text: '¡La niebla se lo traga todo!', tone: 'fog' }, () => playClima('niebla'), true)
        if (cl === 'niebla' && lf >= 0.76) fire('fog2', ms, { text: '¡Salen de la niebla!', tone: 'good' }, playSurge, true)
        if (lf >= 0.78) fire('ultima', ms, { text: '¡Última recta!', tone: 'good' }, playLastLap, true)
        if (photo && ms >= r.finish[r.winner] - 1800) {
          fire('foto', ms, { text: '¡FOTO FINISH!', tone: 'photo' }, null, true)
          fire('foto-click', r.finish[r.winner], null, playShutter, true)
        }
        // Adelantamientos: quién pasa al frente y quién remonta posiciones.
        if (ms > 2500 && lastLeader !== -1 && leader !== lastLeader && lf < 0.95) {
          const slow = ms - lastNews < 1500
          if (!slow) {
            say({ text: `¡${BOATS[leader].name} pasa al frente!`, tone: 'lead' })
            lastNews = ms
          }
        }
        lastLeader = leader
        if (ms - sample > 450) {
          sample = ms
          const rank = []
          order.forEach((b, k) => (rank[b] = k))
          rankAt.push(rank)
          if (rankAt.length > 5) rankAt.shift()
          if (rankAt.length === 5 && ms > 3000 && lf < 0.92 && ms - lastNews > 1800) {
            const before = rankAt[0]
            const jump = [...Array(N).keys()].find((b) => before[b] - rank[b] >= 2 && !stalls[b].some((q) => ms < q.at + q.dur + 1200))
            if (jump !== undefined) {
              say({ text: `¡${BOATS[jump].name} remonta!`, tone: 'lead' })
              lastNews = ms
            }
          }
        }
        // La cámara: zoom a la cabeza en el último tramo (y vuelta atrás al acabar).
        let z = smooth(clamp((at[leader] - 0.7) / 0.18, 0, 1))
        z *= 1 - clamp((ms - r.finish[r.winner] - 2200) / 1000, 0, 1)
        if (reduced) z = 0
        const zoom = 1 + 0.42 * z
        const vw = W / zoom
        const vh = H / zoom
        const vx = z * clamp(xs[leader] - vw * 0.62, 0, W - vw)
        const vy = z * clamp(240 - vh / 2, 0, H - vh)
        const next = `${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`
        if (next !== view) {
          view = next
          stage.current?.setAttribute('viewBox', next)
        }
      } else if (view !== `0 0 ${W} ${H}`) {
        view = `0 0 ${W} ${H}`
        stage.current?.setAttribute('viewBox', view)
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [clock, round, reduced])

  const kr = race ? race.stalls.filter((s) => s.what === 'kraken') : []
  return (
    <svg ref={stage} className="rg-course" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="rg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--rg-sky0)' }} />
          <stop offset="0.6" style={{ stopColor: 'var(--rg-sky1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--rg-sky2)' }} />
        </linearGradient>
        <linearGradient id="rg-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--rg-sea0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--rg-sea1)' }} />
        </linearGradient>
        <linearGradient id="rg-fogh" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e8eef2" stopOpacity="0" />
          <stop offset="0.18" stopColor="#e8eef2" stopOpacity="1" />
          <stop offset="0.82" stopColor="#e8eef2" stopOpacity="1" />
          <stop offset="1" stopColor="#e8eef2" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="rg-whirl" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#031a2c" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="#0a4a6a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#0a4a6a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height="110" fill="url(#rg-sky)" />
      <circle className="rg-sun" cx="700" cy="104" r="40" />
      {/* El arcoíris, solo con ese clima. */}
      <g className="rg-rainbow" fill="none" strokeWidth="7" opacity="0.8">
        {['#ff5a5a', '#ffa64a', '#ffe36e', '#6be08a', '#4aa8ff', '#9a6aff'].map((c, k) => (
          <path key={c} d={`M70 112 Q450 ${-130 + k * 7} 830 112`} stroke={c} transform={`translate(0 ${k * 7}) `} />
        ))}
      </g>
      <g className="rg-clouds" fill="#fff">
        <ellipse cx="180" cy="34" rx="70" ry="14" />
        <ellipse cx="230" cy="26" rx="46" ry="13" />
        <ellipse cx="560" cy="48" rx="86" ry="15" />
        <ellipse cx="620" cy="38" rx="50" ry="13" />
        <ellipse cx="790" cy="24" rx="60" ry="12" />
      </g>
      {/* La isla con el volcán y palmeras. */}
      <path d="M140 110 Q200 96 250 70 L292 40 Q300 34 308 40 L360 78 Q420 100 480 110 Z" fill="var(--rg-island)" />
      <path d="M40 110 Q80 98 120 104 Q160 108 180 110 Z" fill="var(--rg-island2)" />
      <g stroke="var(--rg-island2)" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M420 108 Q424 90 432 78" />
        <path d="M432 78 q-12 -2 -18 6 M432 78 q-4 -10 -14 -12 M432 78 q8 -8 18 -6 M432 78 q12 2 16 12" />
      </g>
      <rect y="110" width={W} height={H - 110} fill="url(#rg-sea)" />
      <g className="rg-waves" stroke="#c8f6ff" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round">
        {Array.from({ length: 14 }, (_, k) => (
          <path key={k} d={`M${(k * 137) % W} ${128 + ((k * 61) % 270)} q10 -5 20 0 t20 0`} />
        ))}
      </g>
      {/* El Kraken al acecho: dos ojos que brillan bajo el agua, al fondo del campo. */}
      <g className="rg-lurk">
        <ellipse cx="560" cy="150" rx="70" ry="14" fill="#031014" opacity="0.55" />
        <circle cx="540" cy="146" r="5" fill="#9dff6a" />
        <circle cx="578" cy="146" r="5" fill="#9dff6a" />
      </g>
      {/* El remolino, solo con ese clima. */}
      <g className="rg-whirl">
        <ellipse cx={WHIRL_X} cy="255" rx="95" ry="150" fill="url(#rg-whirl)" />
        {[0, 1, 2, 3].map((k) => (
          <ellipse key={k} className="rg-whirl__ring" style={{ animationDelay: `${-k * 0.35}s` }} cx={WHIRL_X} cy="255" rx={30 + k * 20} ry={52 + k * 34} fill="none" stroke="#d8fbff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${34 - k * 4} ${20 + k * 8}`} />
        ))}
      </g>
      {/* Calles: cuerdas de boyas. */}
      {Array.from({ length: N + 1 }, (_, i) => (
        <line key={i} x1="40" x2={W - 30} y1={laneY(i) - 26} y2={laneY(i) - 26} stroke="#fff" strokeOpacity="0.14" strokeDasharray="4 10" />
      ))}
      {/* Salida y llegada. */}
      <line x1={START_X} x2={START_X} y1="120" y2={H - 10} stroke="#fff" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="6 6" />
      <g ref={flag} className="rg-finish" data-done="0">
        <line x1={FINISH_X} x2={FINISH_X} y1="120" y2={H - 10} stroke="#ffe36e" strokeWidth="3" strokeDasharray="8 6" />
        <circle cx={FINISH_X} cy="124" r="9" fill="#ff6b5a" stroke="#fff" strokeWidth="2" />
        <circle cx={FINISH_X} cy={H - 14} r="9" fill="#ff6b5a" stroke="#fff" strokeWidth="2" />
      </g>
      {BOATS.map((boat, i) => (
        <g
          key={boat.name}
          ref={(el) => (boats.current[i] = el)}
          className={`rg-boat ${mine.includes(i) ? 'is-mine' : ''} ${winner === i ? 'is-winner' : ''}`}
          transform={`translate(${START_X} ${laneY(i)})`}
        >
          <Sailboat boat={boat} i={i} />
        </g>
      ))}
      {kr.map((s, k) => (
        <g key={`${round}-${k}`} ref={(el) => (krakens.current[k] = el)} opacity="0">
          <Tentacles />
        </g>
      ))}
      {/* Viento y calima: rachas y arena que cruzan el campo. */}
      <g className="rg-gusts" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none">
        {Array.from({ length: 9 }, (_, k) => (
          <path key={k} style={{ animationDelay: `${-k * 0.23}s` }} d={`M${-120 + ((k * 97) % 300)} ${130 + ((k * 43) % 270)} h${70 + (k % 3) * 30}`} />
        ))}
      </g>
      {/* La lluvia de la tormenta. */}
      <g className="rg-rain" stroke="#bfe0ff" strokeWidth="1.6" strokeLinecap="round">
        {RAIN.map((d, k) => (
          <line key={k} x1={d.x} y1={d.y} x2={d.x - 8} y2={d.y + 22} />
        ))}
      </g>
      {/* Niebla: una banda en mitad del campo que tapa los veleros, y bruma que se mueve. */}
      <rect ref={fog} className="rg-fog" x={START_X + 0.2 * (FINISH_X - START_X)} y="104" width={0.62 * (FINISH_X - START_X)} height={H - 104} fill="url(#rg-fogh)" opacity="0.34" />
      <g className="rg-mist" fill="#eef3f6">
        <ellipse cx="200" cy="170" rx="160" ry="22" />
        <ellipse cx="620" cy="250" rx="200" ry="26" />
        <ellipse cx="380" cy="340" rx="190" ry="24" />
      </g>
      <rect className="rg-haze" width={W} height={H} />
      <path ref={bolt} className="rg-bolt" opacity="0" d="M0 0 L-14 44 L8 50 L-20 112 L4 118 L-26 196" fill="none" stroke="#fffbe0" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <rect ref={flash} width={W} height={H} fill="#fff" opacity="0" />
    </svg>
  )
}

function Countdown({ phase, offset }) {
  const left = phase === 'betting' ? Math.ceil((BETS_MS - offset) / 1000) : 0
  const fraction = phase === 'betting' ? 1 - offset / BETS_MS : 0
  return (
    <div
      className={`countdown countdown--${phase === 'betting' ? 'betting' : 'spinning'} ${phase === 'betting' && left <= LAST_CALL_MS / 1000 ? 'countdown--last' : ''}`}
      style={{ '--left': fraction }}
      aria-hidden="true"
    >
      <span>{phase === 'betting' ? left : '⛵'}</span>
    </div>
  )
}

// La flecha del viento: gira con la dirección del parte.
function WindVane({ dir, knots }) {
  return (
    <span className="rg-wind__vane" style={{ '--dir': `${dir}deg` }} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
        <path d="M20 4 L27 22 L20 18 L13 22 Z" fill="currentColor" />
      </svg>
      <b>{knots} kn</b>
    </span>
  )
}

// Los veleros de una apuesta, en orden, con su color: «① › ③ › ⑤».
function Boats({ boats }) {
  return (
    <span className="rg-seq">
      {boats.map((b, k) => (
        <span key={b} className="rg-seq__item">
          {k > 0 && <em aria-hidden="true">›</em>}
          <i style={{ '--c': BOATS[b].color }} title={BOATS[b].name}>
            {b + 1}
          </i>
        </span>
      ))}
    </span>
  )
}

function Regata({ onExit, juegos }) {
  const [sound, setSound] = useState(() => !isMuted())
  const [live, setLive] = useState(null)
  const [chip, setChip] = useState(50)
  const [kind, setKind] = useState('win') // lo que se está armando: Ganador, Exacta o Trío
  const [sel, setSel] = useState([]) // veleros elegidos, en orden de llegada
  const [picks, setPicks] = useState([]) // las apuestas de la ronda en pantalla: [{ kind, boats, amount }]
  const [picksRound, setPicksRound] = useState(null)
  const [lastPicks, setLastPicks] = useState([]) // lo de la regata anterior, para «Repetir»
  const [sending, setSending] = useState(false)
  const [winners, setWinners] = useState({ round: null, list: [] })
  const [news, setNews] = useState(null) // la narración en pantalla: { id, text, tone }
  const [banner, setBanner] = useState(null) // el cartel grande del clima
  const [, setTick] = useState(0)
  const skew = useRef(null)
  const newsId = useRef(0)
  const { request } = juegos
  const balance = juegos.me?.balance ?? 0
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const { round, offset, phase } = phaseAt(clock())
  const ready = skew.current !== null

  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: 'solo_regatta', ...message })
      const got = Date.now()
      if (body?.solo) {
        if (skew.current === null || got - sent < 1500) skew.current = body.solo.now - (sent + got) / 2
        if (body.solo.winners && Number.isSafeInteger(message.winners)) setWinners({ round: message.winners, list: body.solo.winners })
        setLive(body.solo)
      }
      return body
    },
    [request],
  )
  const say = useCallback((n) => setNews({ ...n, id: ++newsId.current }), [])

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ask])

  // Ronda nueva: lo apostado en la anterior queda para «Repetir» y la narración se limpia.
  useEffect(() => {
    if (!ready || picksRound === round) return
    if (picksRound !== null && picks.length) setLastPicks(picks)
    setPicks([])
    setSel([])
    setNews(null)
    setPicksRound(round)
    // Y se pide el parte de la ronda nueva enseguida, sin esperar a ninguna apuesta.
    ask({ a: 'sync' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, round])

  // Al cerrarse las apuestas se pide la regata (orden, tiempos y efectos), y al acabar se cobra y se ve quién ganó.
  const wind = live?.round === round ? live.wind : null
  const race = live?.round === round ? live.race : null
  const clima = climaOf(wind?.clima)
  useEffect(() => {
    if (!ready || phase === 'betting' || race) return
    const timer = setTimeout(() => ask({ a: 'sync' }), 700)
    return () => clearTimeout(timer)
  }, [ready, phase, race, round, ask])
  const endAt = race ? race.start + Math.max(...race.finish) : null
  useEffect(() => {
    if (endAt === null) return
    const wait = endAt + WINNERS_WAIT_MS - clock()
    if (wait < -SAIL_MAX_MS) return
    const timer = setTimeout(() => ask({ a: 'sync', winners: round }), Math.max(0, wait))
    return () => clearTimeout(timer)
  }, [endAt, round, ask, clock])

  // El cartel del clima al abrirse las apuestas: se ve unos segundos y suena su efecto.
  const windKey = wind ? `${round}-${wind.clima}` : null
  useEffect(() => {
    if (!windKey || phase !== 'betting' || offset > 2500) return
    setBanner({ key: windKey, clima: wind.clima })
    playClima(wind.clima)
    const timer = setTimeout(() => setBanner(null), BANNER_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windKey])

  // Pitidos de los últimos segundos y bocina de salida.
  const left = Math.ceil((BETS_MS - offset) / 1000)
  useEffect(() => {
    if (ready && phase === 'betting' && left <= 3 && left > 0) playBeep(1)
  }, [ready, phase, left])
  useEffect(() => {
    if (ready && phase === 'horn' && offset < BETS_MS + 1500) playHorn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, phase, round])

  // Apuestas que el servidor ya tenía (al entrar o tras recargar).
  const confirmed = useMemo(() => (live?.round === round ? live.bets : []), [live, round])
  useEffect(() => {
    if (live?.round === round && live.bets.length && !picks.length) setPicks(live.bets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.round, live?.bets?.length])

  // Las apuestas se confirman con el servidor poco después de tocarlas.
  const dirty = !sameBets(picks, confirmed)
  useEffect(() => {
    if (!dirty || phase !== 'betting' || picksRound !== round) return
    const wait = Math.max(0, Math.min(SEND_MS, BETS_MS - offset - 150))
    const timer = setTimeout(async () => {
      setSending(true)
      const body = await ask({ a: 'bet', round, bets: picks })
      setSending(false)
      if (!body?.solo) setPicks(confirmed)
    }, wait)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, JSON.stringify(picks), phase, round, picksRound, ask])

  const stake = totalOf(picks)
  const pending = stake - totalOf(confirmed)
  const available = Math.max(0, balance - pending)
  const shownBank = useCountUp(available)
  const betting = ready && phase === 'betting' && picksRound === round
  const raceMs = race ? clock() - race.start : -1
  const finished = race && raceMs >= Math.max(...race.finish)
  const crossed = race && raceMs >= race.finish[race.winner]
  const gap = race ? race.finish[race.order[1]] - race.finish[race.winner] : 0
  const photo = race && gap <= PHOTO_MS
  const mine = live?.last && live.last.round === round ? live.last : null
  const won = finished && mine && mine.net > 0
  const players = live?.round === round ? (live.players ?? 0) : 0

  // El borrador de apuesta: lo que se ha elegido y lo que pagaría.
  const need = KINDS[kind].n
  const full = sel.length === need
  const draftOdds = wind && full ? oddsFor(kind, sel, wind.bp) : 0
  const draftPay = Math.floor((chip * draftOdds) / 100)
  const draftKey = full ? betKey({ kind, boats: sel }) : null
  const draftHave = picks.find((b) => betKey(b) === draftKey)?.amount ?? 0
  const canAdd = betting && full && chip <= available && stake + chip <= MAX_TOTAL && (draftHave > 0 || picks.length < MAX_BETS)

  const chooseKind = (k) => {
    setKind(k)
    setSel([])
  }
  // Tocar un velero: lo pone en el siguiente puesto; si ya estaba, lo quita; si los puestos están llenos, empieza de nuevo.
  const tap = (boat) => {
    if (!betting || !wind) return
    playChip()
    setSel((s) => (s.includes(boat) ? s.filter((b) => b !== boat) : s.length >= need ? [boat] : [...s, boat]))
  }
  const add = () => {
    if (!canAdd) return
    playChip()
    setPicks((p) => (draftHave > 0 ? p.map((b) => (betKey(b) === draftKey ? { ...b, amount: b.amount + chip } : b)) : [...p, { kind, boats: sel, amount: chip }]))
  }
  const remove = (b) => betting && setPicks((p) => p.filter((x) => betKey(x) !== betKey(b)))
  const reuse = (b) => {
    if (!betting) return
    setKind(b.kind)
    setSel(b.boats)
  }
  const clear = () => betting && setPicks([])
  const double = () => {
    if (!betting || stake === 0 || stake > available || stake * 2 > MAX_TOTAL) return
    setPicks((p) => p.map((b) => ({ ...b, amount: b.amount * 2 })))
  }
  const lastTotal = totalOf(lastPicks)
  const canRepeat = betting && stake === 0 && lastTotal > 0 && lastTotal <= available
  const repeat = () => canRepeat && setPicks(lastPicks)

  // Sonidos al acabar: más fanfarria cuanto más grande el premio.
  const endKey = finished && mine ? round : null
  useEffect(() => {
    if (endKey === null) return
    if (mine.net > 0) {
      if (mine.mult >= 10) playOvation()
      else playWin(mine.mult >= 4)
    } else if (mine.stake > 0) playLose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey])

  const othersWon = useMemo(
    () =>
      winners.list
        .filter((w) => !w.me)
        .map((w) => ({ key: `${winners.round}-${w.name}`, name: w.name, amount: w.amount, detail: 'en la regata' })),
    [winners],
  )

  const top = wind ? Math.max(...wind.bp) : null
  const favorite = wind ? wind.bp.indexOf(top) : null
  let call = 'Conectando…'
  let detail = ''
  if (ready) {
    if (phase === 'betting') {
      call = BETS_MS - offset <= LAST_CALL_MS ? 'Últimas apuestas' : 'Haz tu apuesta'
      if (balance === 0 && stake === 0) detail = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a tener 15.000 €.'
      else if (stake > 0) detail = sending || dirty ? `Enviando ${eur(stake)}…` : `${plural(picks.length, 'apuesta', 'apuestas')}: ${eur(stake)}.`
      else detail = wind ? `${clima.name}: el favorito es ${BOATS[favorite].name} (${fmtOdds(wind.odds[favorite])}).` : 'Elige un tipo de apuesta y toca los veleros.'
    } else if (phase === 'horn' || !race) {
      call = '¡Bocina de salida!'
      detail = stake > 0 ? `Juegas ${eur(stake)}.` : 'Mira la regata y apuesta en la siguiente.'
    } else if (!crossed) {
      call = 'Regata en curso'
      detail = stake > 0 ? `Juegas ${eur(stake)}.` : 'Mira la regata y apuesta en la siguiente.'
    } else {
      call = photo ? `¡Foto finish! Gana ${BOATS[race.winner].name}` : `¡Gana ${BOATS[race.winner].name}!`
      if (mine) detail = mine.net > 0 ? `¡Has ganado ${eur(mine.net)}!` : mine.stake > 0 ? `Perdiste ${eur(-mine.net)}.` : 'Prepárate para la siguiente.'
      else if (stake > 0) detail = 'Calculando tu premio…'
      else detail = `Podio: ${names(race.order.slice(0, 3))}. Prepárate para la siguiente.`
    }
    if (juegos.error) detail = juegos.error
  }
  const history = live?.history ?? []
  // Lo que se enseña en el boleto: tus apuestas, y al acabar lo que cobró cada una.
  const slip = finished && mine ? mine.bets : picks
  const slipOdds = (b) => b.odds ?? (wind ? oddsFor(b.kind, b.boats, wind.bp) : 0)
  const best = mine?.best

  return (
    <main className="app rg-app">
      <header className="top">
        <h1>Regata</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd className={won ? 'money__up' : ''}>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>En juego</dt>
              <dd>{eur(stake)}</dd>
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
            <Help className="tg tg--help" title="Cómo se juega a la Regata">
              <p>
                Es en vivo: hay una regata para todos cada {ROUND_MS / 1000} segundos. Durante {BETS_MS / 1000} segundos se apuesta; luego suena la
                bocina y los cinco veleros salen hacia la boya de llegada.
              </p>
              <p>
                Antes de cada regata sale el <b>parte del tiempo</b>, y el clima manda: con el <b>Despejado</b> hay un favorito claro; la{' '}
                <b>Tormenta</b>, la <b>Niebla</b> y el <b>Arcoíris</b> lo igualan todo; con el <b>Kraken</b> unos desconocidos casi imposibles pagan
                una barbaridad; y el <b>Remolino</b>, el <b>Viento fuerte</b> y la <b>Calima</b> lo revuelven. Cada velero lleva su probabilidad de ganar.
              </p>
              <p>
                Hay tres apuestas: <b>Ganador</b> (acierta el 1.º), <b>Exacta</b> (el 1.º y el 2.º, en orden) y <b>Trío</b> (el 1.º, el 2.º y el 3.º,
                en orden). Elige el tipo, toca los veleros en el orden en que crees que llegarán, mira la cuota y lo que cobrarías y pulsa Apostar.
                Puedes tener hasta {MAX_BETS} apuestas por regata y {eur(MAX_TOTAL)} en total. Cuanto menos probable es el resultado, más paga:
                un trío en orden puede dar cientos de veces lo apostado (el tope es {fmtOdds(MAX_ODDS)}).
              </p>
              <p>
                El orden de llegada lo sortea el servidor con esas mismas probabilidades: primero el ganador, luego el segundo entre los que quedan, y así.
                Los rayos, el Kraken y el remolino solo son espectáculo y nunca cambian el resultado. Apuestes a lo que apuestes, de media se recupera
                el {Math.round(HOUSE * 100)} % (algo menos en los premios que topan). Juegas con tu saldo de la semana: lo que ganes o pierdas cuenta en el Score.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="floor fill">
        <section className="side rg-side">
          <div className={`rg-stage ${crossed ? 'is-done' : ''} ${phase === 'sailing' && race ? 'is-racing' : ''} ${banner ? 'has-banner' : ''}`} data-clima={clima.id}>
            <Course clock={clock} round={round} race={race} clima={clima.id} mine={picks.flatMap((b) => b.boats)} winner={crossed ? race.winner : null} reduced={reduced} onNews={say} />
            {wind && (
              <div className="rg-wind">
                <WindVane dir={wind.dir} knots={wind.knots} />
                <span>
                  <small>Parte del tiempo</small>
                  <b>{clima.name}</b>
                </span>
              </div>
            )}
            {banner && wind && (
              <div className="rg-banner" key={banner.key} data-clima={banner.clima}>
                <small>Parte del tiempo</small>
                <b>{climaOf(banner.clima).name}</b>
                <span>{climaOf(banner.clima).blurb}</span>
              </div>
            )}
            {news && !crossed && (
              <p className="rg-news" key={news.id} data-tone={news.tone} aria-live="polite">
                {news.text}
              </p>
            )}
            {crossed && (
              <p className="rg-winner" style={{ '--c': BOATS[race.winner].color }}>
                ¡{BOATS[race.winner].name}!<small>{photo ? `Foto finish: por ${(Math.max(gap, 1) / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : `${fmtOdds(wind?.odds[race.winner] ?? 0)} · ${names(race.order.slice(0, 3))}`}</small>
              </p>
            )}
          </div>
          <div className="recent rg-recent">
            <h2>Últimas regatas</h2>
            {history.length === 0 ? (
              <p>Todavía no ha terminado ninguna.</p>
            ) : (
              <ol>
                {history.slice(0, 12).map((h, i) => (
                  <li key={`${round}-${i}`} style={{ '--c': BOATS[h.boat].color }} title={`${climaOf(h.clima).name}: ${names(h.podium)}`} data-clima={h.clima}>
                    <i>{h.boat + 1}</i>
                    <span className="rg-pod" aria-hidden="true">
                      {h.podium.slice(1).map((b) => (
                        <b key={b} style={{ background: BOATS[b].color }} />
                      ))}
                    </span>
                    {fmtOdds(h.odds)}
                    <span className="rg-pip" aria-hidden="true" />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="play">
          <div className="dealer">
            <Countdown phase={ready ? phase : 'horn'} offset={offset} />
            <p className={`status ${won ? 'status--win' : ''}`} aria-live="polite">
              <strong>{call}</strong>
              {detail && <span>{detail}</span>}
            </p>
            <p className="dealer__players">{players > 0 ? `${plural(players, 'jugador', 'jugadores')} en esta regata` : 'En vivo'}</p>
          </div>

          <div className="rg-kinds" role="tablist" aria-label="Tipo de apuesta">
            {KIND_LIST.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => chooseKind(k)}>
                {KINDS[k].name}
              </button>
            ))}
          </div>
          <p className="rg-hint">
            <b>{KINDS[kind].name}.</b> {KINDS[kind].hint} Toca los veleros en orden.
          </p>

          <ul className="rg-boats" aria-label="Veleros">
            {BOATS.map((boat, i) => {
              const at = sel.indexOf(i)
              const odds = wind?.odds[i]
              return (
                <li key={boat.name}>
                  <button
                    type="button"
                    className={`rg-pick ${at >= 0 ? 'is-picked' : ''} ${crossed && race.winner === i ? 'is-winner' : ''} ${wind && wind.bp[i] === top ? 'is-fav' : ''}`}
                    style={{ '--c': boat.color }}
                    disabled={!betting || !wind}
                    onClick={() => tap(i)}
                    aria-pressed={at >= 0}
                    aria-label={`${boat.name}: ${wind ? `${pct(wind.bp[i])} de ganar, gana ${fmtOdds(odds)}` : ''}${at >= 0 ? `, elegido en el puesto ${at + 1}` : ''}`}
                  >
                    <span className="rg-pick__num">{i + 1}</span>
                    <span className="rg-pick__name">
                      <b>{boat.name}</b>
                      <small>
                        {wind ? pct(wind.bp[i]) : '—'}
                        {wind && wind.bp[i] === top && <span className="rg-fav"> · favorito</span>}
                      </small>
                    </span>
                    <span className="rg-pick__odds">{odds ? fmtOdds(odds) : '—'}</span>
                    {at >= 0 && need > 1 && <span className="rg-pick__slot">{KINDS[kind].slots[at]}</span>}
                    <span className="rg-pick__bar" style={{ '--p': wind ? wind.bp[i] / 10000 : 0 }} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="controls rg-chips">
            <div className="chips" role="group" aria-label="Valor de la ficha">
              {CHIPS.map((value) => (
                <button key={value} type="button" className={`chip chip--bj${value}`} aria-pressed={chip === value} disabled={available < value} onClick={() => setChip(value)}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className={`rg-ticket ${full ? 'is-full' : ''}`}>
            <div className="rg-slots">
              {KINDS[kind].slots.map((label, k) => (
                <button key={label} type="button" className={`rg-slot ${sel[k] !== undefined ? 'is-set' : ''} ${k === sel.length ? 'is-next' : ''}`} disabled={sel[k] === undefined || !betting} onClick={() => setSel((s) => s.filter((_, j) => j !== k))} style={sel[k] !== undefined ? { '--c': BOATS[sel[k]].color } : undefined}>
                  <small>{label}</small>
                  <b>{sel[k] !== undefined ? BOATS[sel[k]].name : '—'}</b>
                </button>
              ))}
            </div>
            <p className="rg-ticket__sum" aria-live="polite">
              {full && wind ? (
                <>
                  <span>
                    Cuota <b>{fmtOdds(draftOdds)}</b>
                    {draftOdds >= MAX_ODDS && <small> (tope)</small>}
                  </span>
                  <span>
                    {eur(chip)} pagarían <b>{eur(draftPay)}</b>
                  </span>
                </>
              ) : (
                <span className="rg-ticket__ask">{betting ? `Elige el ${KINDS[kind].slots[sel.length]} velero` : 'Las apuestas están cerradas'}</span>
              )}
            </p>
            <button type="button" className="primary rg-add" disabled={!canAdd} onClick={add}>
              {draftHave > 0 ? `Sumar ${eur(chip)}` : `Apostar ${eur(chip)}`}
            </button>
          </div>

          <div className="controls rg-actions">
            <div className="actions">
              {canRepeat ? (
                <button type="button" className="primary" onClick={repeat}>
                  Repetir {eur(lastTotal)}
                </button>
              ) : (
                <button type="button" disabled={!betting || stake === 0 || stake > available || stake * 2 > MAX_TOTAL} onClick={double}>
                  Doblar
                </button>
              )}
              <button type="button" disabled={!betting || stake === 0} onClick={clear}>
                Quitar todo
              </button>
            </div>
          </div>

          <div className="rg-slip">
            <h2>
              Tus apuestas <small>{slip.length ? `${plural(slip.length, 'apuesta', 'apuestas')} · ${eur(totalOf(slip))}` : ''}</small>
            </h2>
            {slip.length === 0 ? (
              <p className="rg-slip__empty">Todavía no has apostado en esta regata.</p>
            ) : (
              <ul>
                {slip.map((b) => {
                  const odds = slipOdds(b)
                  const result = finished && mine && b.paid !== undefined
                  return (
                    <li key={betKey(b)} className={result ? (b.paid > 0 ? 'is-hit' : 'is-miss') : ''}>
                      <button type="button" className="rg-slip__main" disabled={!betting} onClick={() => reuse(b)} title="Volver a elegir esta apuesta">
                        <span className="rg-slip__kind">{KINDS[b.kind].name}</span>
                        <Boats boats={b.boats} />
                        <span className="rg-slip__odds">{fmtOdds(odds)}</span>
                        <span className="rg-slip__amount">{eur(b.amount)}</span>
                        <span className="rg-slip__pay">{result ? (b.paid > 0 ? `+${eur(b.paid)}` : 'Fallada') : `cobra ${eur(Math.floor((b.amount * odds) / 100))}`}</span>
                      </button>
                      {betting && (
                        <button type="button" className="rg-slip__x" onClick={() => remove(b)} aria-label={`Quitar la apuesta ${KINDS[b.kind].name} ${names(b.boats)}`}>
                          ×
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {won && (
        <WinBurst
          key={round}
          amount={mine.net}
          caption={best ? `${KINDS[best.kind].name} ${names(best.boats)} · ${fmtOdds(best.odds)}` : 'Regata'}
          coins={Math.min(90, Math.round(20 + (best?.odds ?? 0) / 40))}
          big={mine.mult >= 10 || mine.net >= 5000}
          who={juegos.me?.name}
          tags={[
            ...(best?.kind === 'trio' ? ['¡Trío clavado!'] : best?.kind === 'exacta' ? ['¡Exacta clavada!'] : []),
            ...(best && best.odds >= 100000 ? ['¡PREMIAZO!'] : []),
            ...(photo ? ['Foto finish'] : []),
            ...(clima.id === 'kraken' ? ['Bajo el Kraken'] : clima.id === 'tormenta' ? ['En plena tormenta'] : []),
          ]}
        />
      )}
      <WinToast wins={othersWon} />
    </main>
  )
}

export default Regata
