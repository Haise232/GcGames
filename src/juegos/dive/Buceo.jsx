// Buceo de Perlas (Season 4): se juega manteniendo pulsado. Mientras mantienes (espacio o el botón), el buzo baja; al
// soltar, sube. Cuanto más hondo llegues y consigas volver, más cobras. Dos peligros: el tiburón, que aparece a una
// profundidad que el servidor sortea en secreto al tirarte, y el aire, que se gasta bajando y subiendo (subir es más
// lento): si sueltas tan abajo que no llegas, te ahogas por el camino. Reglas en dive.js; el servidor mide la bajada con
// su reloj y aquí solo se anima.
// La escena es un mar en vertical de 0 a 40 m (un SVG alto) y la cámara sigue al buzo. Cada zona tiene su paisaje:
// la Laguna clara, el Arrecife con corales y el Abismo a oscuras, con la linterna del buzo como única luz.
// El panel (apuesta, zonas, récord del día) usa las piezas de Tesoro en la Arena (ar-*, dig/Arena.css).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { AIR_MS, DOWN_MPS, MAX_M, MIN_BET, PEARL_M, SAFE_M, STEP, UP_MPS, ZONES, clampBet, depthAt, fmtM, fmtMult, maxBetFor, multAt, payout, upMs } from './dive.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playBubbles, playCash, playChip, playGasp, playGrowl, playLose, playPearl, playSplash, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import '../dig/Arena.css'
import './Buceo.css'

const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
const ICONS = { laguna: '🐢', arrecife: '🪸', abismo: '🦑' }
const PEARL_COLORS = [
  ['#ffffff', '#d8d4e4'],
  ['#ffe8f0', '#f39ab8'],
  ['#fff4b8', '#e0a630'],
  ['#e6f8ff', '#6ab8e8'],
]
const WARN_MS = 3500 // aviso de «¡sube ya!» cuando queda menos aire que esto de margen para volver

// --- El mundo: coordenadas del SVG ---
const W = 600
const H = 1480
const SURFACE = 70
const MAX_DEPTH = MAX_M / PEARL_M // ostras: una cada 4 m
const METERS = PEARL_M
const yOf = (d) => SURFACE + d * 30 // de metros a la y del dibujo (40 m: 1270)
const stepY = (n) => yOf(n * PEARL_M)
const SEABED = yOf(MAX_M) + 90
const sideOf = (n) => (n % 2 ? 'l' : 'r') // las ostras van alternando de pared
const oysterX = (n) => (sideOf(n) === 'l' ? 96 : W - 96)

// Colores del agua de cada zona: de la superficie al fondo.
const WATER = {
  laguna: ['#5ee8dc', '#22b4c4', '#11708e', '#0b4466'],
  arrecife: ['#3fd0d0', '#1590b0', '#0b5480', '#082c50'],
  abismo: ['#2aa8c0', '#0d5a86', '#061c44', '#020616'],
}

// --- Piezas del dibujo ---

// Una ostra en su repisa: se abre al pasar por su lado y enseña la perla.
function Oyster({ n, open, color }) {
  const x = oysterX(n)
  const y = stepY(n)
  const flip = sideOf(n) === 'r' ? -1 : 1
  const [hi, lo] = PEARL_COLORS[color % PEARL_COLORS.length]
  return (
    <g className={`bz-oyster ${open ? 'is-open is-fresh' : ''}`} transform={`translate(${x} ${y + 14}) scale(${flip} 1)`}>
      <path d="M-80 18 Q-40 6 30 10 Q48 14 44 26 Q0 34 -80 32 Z" fill="#2a3a48" stroke="#101a24" strokeWidth="3" />
      <path d="M-76 20 Q-30 12 26 14" fill="none" stroke="#4a6070" strokeWidth="3" strokeLinecap="round" />
      <path d="M-26 8 Q0 26 26 8 Q0 14 -26 8 Z" fill="#8a7a9a" stroke="#2a1a3a" strokeWidth="2.5" strokeLinejoin="round" />
      <g className="bz-oyster__lid">
        <path d={open ? 'M-26 8 Q-22 -22 0 -24 Q22 -22 26 8 Q0 -2 -26 8 Z' : 'M-26 8 Q0 -6 26 8 Q0 18 -26 8 Z'} fill="#a898b8" stroke="#2a1a3a" strokeWidth="2.5" strokeLinejoin="round" />
        {open && <path d="M-16 0 Q0 -12 16 0" stroke="#c8b8d8" strokeWidth="2" fill="none" />}
      </g>
      {open && (
        <g className="bz-pearl">
          <circle cx="0" cy="8" r="9" fill={lo} />
          <circle cx="0" cy="8" r="9" fill={hi} opacity="0.55" />
          <circle cx="-3" cy="5" r="2.6" fill="#fff" />
        </g>
      )}
    </g>
  )
}

function Diver({ x, y, face, state }) {
  return (
    <g className={`bz-diver is-${state}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
      <g style={{ transform: `scaleX(${face})` }}>
        <g className="bz-diver__body">
          {/* Aletas que patalean. */}
          <g className="bz-fins">
            <path d="M-40 18 L-60 30 L-52 12 Z" fill="#2ee6d0" stroke="#0a1a30" strokeWidth="2" />
            <path d="M-40 10 L-62 8 L-50 -2 Z" fill="#2ee6d0" stroke="#0a1a30" strokeWidth="2" />
          </g>
          <path d="M-42 14 L-18 8 M-42 8 L-18 4" stroke="#1f4a7a" strokeWidth="7" strokeLinecap="round" />
          {/* Botella. */}
          <rect x="-20" y="-16" width="26" height="11" rx="5" fill="#ffb547" stroke="#6a3a10" strokeWidth="2" />
          {/* Cuerpo y casco. */}
          <path d="M-22 -4 Q0 -10 18 -2 L16 12 Q0 8 -20 12 Z" fill="#1f4a7a" stroke="#0a1a30" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M8 10 L22 22" stroke="#1f4a7a" strokeWidth="6" strokeLinecap="round" />
          <circle cx="24" cy="-2" r="11" fill="#ffd9b8" stroke="#6a3a20" strokeWidth="2.5" />
          <rect x="20" y="-9" width="15" height="9" rx="4" fill="#8fe3ff" stroke="#0a1a30" strokeWidth="2.5" />
          <path d="M22 4 Q26 7 30 4" stroke="#6a3a20" strokeWidth="2" fill="none" />
        </g>
      </g>
      {/* Burbujas que salen del casco (se cortan si te quedas sin aire). */}
      <g className="bz-breath">
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={face * 28} cy="-14" r={2 + (i % 2)} style={{ '--i': i }} />
        ))}
      </g>
    </g>
  )
}

function Shark({ y, from }) {
  return (
    <g className={`bz-shark from-${from}`} style={{ '--y': `${y}px` }}>
      <g transform={from === 'l' ? 'scale(1 1)' : 'scale(-1 1)'}>
        <path d="M-70 0 Q-40 -20 10 -14 L24 -32 L28 -14 Q52 -10 70 0 Q52 10 28 12 Q0 24 -36 18 L-56 30 L-50 12 Q-64 8 -70 0 Z" fill="#5a7488" stroke="#1a2a38" strokeWidth="3" strokeLinejoin="round" />
        <path d="M-36 8 Q0 20 28 10" fill="#dfe8ee" />
        <circle cx="50" cy="-4" r="3.5" fill="#0a1018" />
        <path d="M40 8 L60 7" stroke="#1a2a38" strokeWidth="3" strokeLinecap="round" />
        <path d="M44 7 l3 4 l3 -4 l3 4 l3 -4" stroke="#fff" strokeWidth="1.6" fill="none" />
      </g>
    </g>
  )
}

// Peces que cruzan el agua (decorado, distinto en cada zona).
function School({ y, color, size = 1, dur = 16, delay = 0, n = 5, rev = false }) {
  return (
    <g className={`bz-school ${rev ? 'is-rev' : ''}`} style={{ '--dur': `${dur}s`, '--delay': `${delay}s` }}>
      {Array.from({ length: n }, (_, i) => (
        <path
          key={i}
          d="M0 0 Q9 -6 18 0 Q9 6 0 0 Z M18 0 L25 -5 L25 5 Z"
          fill={color}
          transform={`translate(${(i % 3) * 26} ${y + (i % 2) * 14 - Math.floor(i / 3) * 10}) scale(${size})`}
        />
      ))}
    </g>
  )
}

function Scenery({ zone }) {
  return (
    <g>
      {/* Rayos de sol que se pierden al bajar. */}
      <g className="bz-rays" opacity={zone === 'abismo' ? 0.5 : 1}>
        <path d="M80 0 L140 0 L40 700 L0 700 Z" fill="url(#bz-ray)" />
        <path d="M260 0 L310 0 L300 640 L240 640 Z" fill="url(#bz-ray)" />
        <path d="M440 0 L500 0 L600 720 L540 720 Z" fill="url(#bz-ray)" />
      </g>
      {/* Paredes de roca a los lados. */}
      <path d={`M0 ${SURFACE + 40} Q30 300 18 600 Q40 900 14 1100 Q36 1300 20 ${H} H0 Z`} fill="#16222e" />
      <path d={`M${W} ${SURFACE + 40} Q${W - 26} 360 ${W - 16} 640 Q${W - 40} 900 ${W - 12} 1120 Q${W - 34} 1320 ${W - 18} ${H} H${W} Z`} fill="#16222e" />

      {zone === 'laguna' && (
        <g>
          <School y={240} color="#ffd25e" dur={14} />
          <School y={560} color="#ff8a6a" dur={18} delay={-6} rev />
          <School y={820} color="#8fe3ff" dur={15} delay={-3} />
          {/* La tortuga. */}
          <g className="bz-turtle">
            <ellipse cx="0" cy="0" rx="34" ry="22" fill="#5a8a3a" stroke="#1e3a14" strokeWidth="3" />
            <path d="M-16 -12 L0 -18 L16 -12 L16 12 L0 18 L-16 12 Z" fill="#7aa84a" stroke="#1e3a14" strokeWidth="2" />
            <circle cx="40" cy="-2" r="11" fill="#9ac86a" stroke="#1e3a14" strokeWidth="3" />
            <circle cx="44" cy="-5" r="2.5" fill="#1a1030" />
            <path className="bz-flipper" d="M10 -18 Q24 -40 36 -34 Q26 -22 18 -14 Z M10 18 Q24 40 36 34 Q26 22 18 14 Z" fill="#9ac86a" stroke="#1e3a14" strokeWidth="2.5" />
          </g>
          <g fill="#ff8a4c" stroke="#8a2f10" strokeWidth="2">
            <path d={`M150 ${SEABED + 10} l6 -14 l6 14 l14 2 l-11 9 l4 14 l-13 -8 l-13 8 l4 -14 l-11 -9 Z`} />
          </g>
        </g>
      )}

      {zone === 'arrecife' && (
        <g>
          <School y={300} color="#ff8a4c" dur={13} n={4} />
          <School y={700} color="#ffd25e" dur={17} delay={-8} rev />
          <School y={1000} color="#2ee6d0" dur={14} delay={-4} />
          {/* Corales en las paredes. */}
          {[330, 640, 960, 1240].map((y, i) => (
            <g key={y} transform={`translate(${i % 2 ? W - 20 : 20} ${y}) scale(${i % 2 ? -1 : 1} 1)`}>
              <path d="M0 0 Q20 -10 16 -40 Q30 -30 28 -10 Q40 -36 46 -50 Q52 -20 34 4 Z" fill={i % 2 ? '#ff6b8a' : '#ffb547'} stroke="#5a1a2a" strokeWidth="2.5" />
            </g>
          ))}
          {/* La morena que asoma de la pared. */}
          <g className="bz-moray" transform={`translate(${W - 14} 860)`}>
            <path d="M0 0 Q-40 -14 -66 0 Q-74 8 -62 14 Q-36 10 0 18 Z" fill="#7a8a3a" stroke="#2a3010" strokeWidth="3" />
            <circle cx="-56" cy="2" r="3" fill="#ffe36e" stroke="#1a1030" strokeWidth="1.5" />
          </g>
          {/* Pez payaso junto a su anémona. */}
          <g transform={`translate(420 ${SEABED})`}>
            <path d="M-30 20 Q-26 -20 -16 18 Q-10 -26 0 18 Q8 -26 14 18 Q24 -20 30 20 Z" fill="#c86aa8" stroke="#5a1a4a" strokeWidth="2" />
            <g className="bz-clown">
              <path d="M-14 -16 Q0 -26 14 -16 Q0 -6 -14 -16 Z M14 -16 L22 -22 L22 -10 Z" fill="#ff8a2a" stroke="#1a1030" strokeWidth="2" />
              <path d="M-4 -23 V-9 M6 -22 V-10" stroke="#fff" strokeWidth="3" />
            </g>
          </g>
        </g>
      )}

      {zone === 'abismo' && (
        <g>
          <School y={320} color="#8fe3ff" dur={12} n={4} />
          {/* Medusas que brillan. */}
          {[
            [150, 480],
            [450, 720],
            [200, 980],
            [430, 1200],
          ].map(([x, y], i) => (
            <g key={y} className="bz-jelly" style={{ '--i': i }} transform={`translate(${x} ${y})`}>
              <path d="M-20 0 Q-20 -22 0 -24 Q20 -22 20 0 Z" fill="#c49cff" fillOpacity="0.8" stroke="#e8d8ff" strokeWidth="2" />
              <path d="M-12 0 q-4 14 2 28 M0 0 q4 16 -2 32 M12 0 q-4 14 2 28" stroke="#e8d8ff" strokeWidth="2" fill="none" />
            </g>
          ))}
          {/* El pez linterna del fondo. */}
          <g className="bz-angler" transform={`translate(150 ${SEABED - 30})`}>
            <path d="M-36 0 Q-30 -30 4 -28 Q34 -22 36 0 Q30 22 0 24 Q-30 22 -36 0 Z M-36 0 L-56 -14 L-52 14 Z" fill="#2a2440" stroke="#0a0814" strokeWidth="3" />
            <path d="M14 8 l4 -6 l4 6 l4 -6 l4 6" stroke="#fff" strokeWidth="2" fill="none" />
            <circle cx="16" cy="-10" r="4" fill="#fff" />
            <path d="M0 -28 Q10 -60 34 -52" stroke="#5a5070" strokeWidth="3" fill="none" />
            <circle className="bz-lure" cx="34" cy="-52" r="7" fill="#ffe36e" />
          </g>
        </g>
      )}

      {/* El fondo: arena, piedras y un cofre hundido. */}
      <path d={`M0 ${SEABED + 30} Q150 ${SEABED} 300 ${SEABED + 20} T${W} ${SEABED + 10} V${H} H0 Z`} fill={zone === 'abismo' ? '#2a2638' : '#c8a868'} />
      <g transform={`translate(${W / 2 + 40} ${SEABED + 34}) rotate(-8)`}>
        <rect x="-24" y="-14" width="48" height="26" rx="3" fill="#7a4a1a" stroke="#2a1404" strokeWidth="3" />
        <path d="M-24 -14 Q-24 -32 0 -32 Q24 -32 24 -14 Z" fill="#8a5a2a" stroke="#2a1404" strokeWidth="3" />
        <path d="M-24 -6 H24 M-8 -32 V12 M8 -32 V12" stroke="#ffd25e" strokeWidth="3" />
      </g>
      {/* Marcas de profundidad. */}
      {Array.from({ length: MAX_DEPTH }, (_, i) => (
        <text key={i} className="bz-mark" x={sideOf(i + 1) === 'l' ? W - 44 : 110} y={stepY(i + 1) + 6} textAnchor="middle">
          {(i + 1) * METERS} m
        </text>
      ))}
    </g>
  )
}

// El mar entero, con la cámara siguiendo al buzo (a la profundidad `depth`, en metros) y la linterna en el Abismo.
function Sea({ zone, depth, reached, state, shark, seed, moving }) {
  const dx = W / 2 + Math.sin(depth * 0.35) * 40
  const dy = yOf(depth)
  const face = state === 'up' ? 1 : -1
  const [c0, c1, c2, c3] = WATER[zone]
  const dark = zone === 'abismo' ? Math.min(0.88, 0.25 + depth * 0.018) : zone === 'arrecife' ? Math.min(0.45, depth * 0.011) : Math.min(0.25, depth * 0.006)
  return (
    <div className={`bz-window ${moving ? 'is-moving' : ''}`}>
      <svg className="bz-world" viewBox={`0 0 ${W} ${H}`} style={{ '--dy': dy, '--w': W, '--h': H }} aria-hidden="true">
        <defs>
          <linearGradient id="bz-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c0} />
            <stop offset="0.25" stopColor={c1} />
            <stop offset="0.6" stopColor={c2} />
            <stop offset="1" stopColor={c3} />
          </linearGradient>
          <linearGradient id="bz-ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="bz-glow">
            <stop offset="0" stopColor="#fff2c0" stopOpacity="0.32" />
            <stop offset="1" stopColor="#fff2c0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bz-lamp">
            <stop offset="0.35" stopColor="#000" />
            <stop offset="1" stopColor="#fff" />
          </radialGradient>
          <mask id="bz-dark">
            <rect width={W} height={H} fill="#fff" />
            <circle r="170" fill="url(#bz-lamp)" transform={`translate(${dx} ${dy})`} />
          </mask>
        </defs>
        <rect width={W} height={H} fill="url(#bz-water)" />
        <rect width={W} height={SURFACE - 30} fill="#ffcf8a" />
        <circle cx="470" cy={SURFACE - 30} r="26" fill="#ffe36e" />
        <path className="bz-surface" d={`M-20 ${SURFACE - 30} Q0 ${SURFACE - 38} 20 ${SURFACE - 30} T60 ${SURFACE - 30} T100 ${SURFACE - 30} T140 ${SURFACE - 30} T180 ${SURFACE - 30} T220 ${SURFACE - 30} T260 ${SURFACE - 30} T300 ${SURFACE - 30} T340 ${SURFACE - 30} T380 ${SURFACE - 30} T420 ${SURFACE - 30} T460 ${SURFACE - 30} T500 ${SURFACE - 30} T540 ${SURFACE - 30} T580 ${SURFACE - 30} T620 ${SURFACE - 30} V${SURFACE - 20} H-20 Z`} fill="#c8f6ff" opacity="0.8" />
        <g transform={`translate(262 ${SURFACE - 52})`}>
          <path d="M0 14 L74 14 L62 30 L12 30 Z" fill="#c9824a" stroke="#5a2a10" strokeWidth="3" strokeLinejoin="round" />
          <path d="M34 14 V-24 L58 8 Z" fill="#fff6e8" stroke="#5a2a10" strokeWidth="2" />
        </g>
        <Scenery zone={zone} />
        {/* Hasta dónde se puede bajar y aún volver con el aire de la botella. */}
        <g className="bz-limit">
          <line x1="0" x2={W} y1={yOf(SAFE_M)} y2={yOf(SAFE_M)} />
          <text x={W / 2} y={yOf(SAFE_M) - 8} textAnchor="middle">
            Límite del aire · {fmtM(SAFE_M)}
          </text>
        </g>
        {Array.from({ length: MAX_DEPTH }, (_, i) => (
          <Oyster key={i} n={i + 1} open={reached >= (i + 1) * PEARL_M} color={seed + i} />
        ))}
        {shark !== null && <Shark y={yOf(shark)} from="r" />}
        <Diver x={dx} y={dy} face={face} state={state} />
        <rect className="bz-dark" width={W} height={H} fill="#01030c" opacity={dark} mask="url(#bz-dark)" />
        {zone === 'abismo' && depth > 0 && <circle r="130" fill="url(#bz-glow)" transform={`translate(${dx - 40} ${dy})`} />}
      </svg>
      <div className="bz-gauge" style={{ '--p': depth / MAX_M }} aria-hidden="true">
        <span className="bz-gauge__fill" />
        <span className="bz-gauge__safe" style={{ '--s': SAFE_M / MAX_M }} />
        <b>{fmtM(depth)}</b>
      </div>
    </div>
  )
}

// La botella: el aire que queda y la marca de lo que hace falta para volver desde donde estás.
function Tank({ left, need, warn }) {
  return (
    <span className={`bz-tank ${warn ? 'is-low' : ''}`} style={{ '--left': Math.max(0, left) / AIR_MS, '--need': Math.min(1, need / AIR_MS) }} aria-label={`Aire: ${Math.max(0, Math.ceil(left / 1000))} s`}>
      <span className="bz-tank__air" />
      <span className="bz-tank__need" />
    </span>
  )
}

// --- Juego ---

function Buceo({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [zone, setZone] = useState('arrecife')
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, zone, start } mientras bajas (start: hora del servidor)
  const [rise, setRise] = useState(null) // la subida que se está animando: { from, to, at (hora local), ms, result }
  const [holding, setHolding] = useState(false)
  const [asking, setAsking] = useState(false)
  const [last, setLast] = useState(null)
  const [history, setHistory] = useState([])
  const [ranking, setRanking] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const [ready, setReady] = useState(false)
  const [shake, setShake] = useState(false)
  const [, setFrame] = useState(0)
  const skew = useRef(0)
  const held = useRef(false) // el dedo (o la tecla) sigue apretado
  const sent = useRef(false) // ya se mandó el «up» de esta inmersión
  const passed = useRef(0) // ostras por las que ya has pasado (para el sonido)
  const landedRound = useRef(null) // la inmersión cuyo resultado ya se enseñó
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !run && (!rise || rise.done)) setBalance(serverBalance)
  }, [serverBalance, asking, run, rise])
  const shownBank = useCountUp(balance)
  const clock = useCallback(() => Date.now() + skew.current, [])

  const record = (result) => {
    setLast(result)
    setHistory((list) => (list.some((h) => h.id === result.round) ? list : [{ id: result.round, mult: result.net >= 0 ? result.mult : 0 }, ...list].slice(0, HISTORY)))
  }

  // Una petición al servidor (sin bloquear las demás: la espera larga va a la vez que el «up»).
  const ask = useCallback(
    async (message) => {
      const before = Date.now()
      const body = await request({ t: 'solo_dive', ...message })
      const after = Date.now()
      const v = body?.solo ?? null
      if (v && message.a !== 'wait' && after - before < 1500) skew.current = v.now - (before + after) / 2
      if (v && body.abuse) v.abuse = body.abuse
      if (v?.ranking) setRanking(v.ranking)
      return v
    },
    [request],
  )

  useEffect(() => {
    let alive = true
    ask({ a: 'sync' }).then((v) => {
      if (!alive) return
      if (v) {
        if (v.bet > 0) {
          setRun({ bet: v.bet, zone: v.zone, start: v.start })
          setZone(v.zone)
        }
        if (v.last) record(v.last)
        setBalance(v.balance)
      }
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [ask])

  // La inmersión acabó (soltaste, el tiburón o el aire): se anima la subida y, al llegar, el resultado.
  const finishRun = useEffectEvent((v) => {
    const result = v.last
    setRun(null)
    sent.current = true
    if (result.lost === 'shark') {
      playGrowl()
      setTimeout(playLose, 260)
      buzz([40, 40, 160])
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setRise({ from: result.depth, to: result.depth, at: Date.now(), ms: 0, result, abuse: v.abuse })
      return
    }
    // Subiendo: hasta la superficie, o hasta donde se acaba el aire.
    const to = result.lost === 'air' ? result.lostAt : 0
    setRise({ from: result.depth, to, at: Date.now(), ms: ((result.depth - to) / UP_MPS) * 1000, result, abuse: v.abuse })
  })

  // Al acabar la animación de la subida: el resultado, el saldo y la celebración.
  const landed = useEffectEvent(() => {
    if (!rise || rise.done || landedRound.current === rise.result.round) return
    landedRound.current = rise.result.round
    const { result, abuse } = rise
    record(result)
    setBalance((b) => b + (result.net > 0 ? result.payout : 0) + (abuse?.extra ?? 0))
    if (abuse) setBank({ round: result.round, ...abuse })
    if (result.lost === 'air') {
      playGasp()
      setTimeout(playLose, 300)
      buzz([40, 40, 160])
    } else if (!result.lost) {
      playSplash()
      playCash(Math.min(10, Math.round(result.mult)))
      playWin(result.mult >= 10)
      buzz([60, 40, 80])
      setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, depth: result.depth, extra: abuse?.extra ?? 0 })
    }
    setRise((r) => (r ? { ...r, done: true } : r))
  })

  async function start() {
    if (run || (rise && !rise.done) || asking || !ready) return
    const amount = clampBet(bet, maxBetFor(balance))
    if (amount > balance) return
    playChip()
    setBurst(null)
    setBank(null)
    setRise(null)
    setLast(null)
    sent.current = false
    passed.current = 0
    setAsking(true)
    const v = await ask({ a: 'start', bet: amount, zone })
    setAsking(false)
    if (!v || !(v.bet > 0)) return
    playSplash()
    setBalance(v.balance)
    setRun({ bet: v.bet, zone: v.zone, start: v.start })
    // Si soltaste mientras se tiraba, sube ya.
    if (!held.current) up()
  }

  async function up() {
    if (sent.current) return
    sent.current = true
    const v = await ask({ a: 'up' })
    if (v?.last && v.bet === 0) finishRun(v)
  }

  // Mientras bajas: una espera larga que el servidor contesta cuando el tiburón te alcanzaría o se acabaría el aire.
  useEffect(() => {
    if (!run) return
    let gone = false
    const loop = async () => {
      while (!gone) {
        const v = await ask({ a: 'wait' })
        if (gone) return
        if (v && v.bet === 0 && v.last) {
          if (!sent.current || v.last.lost) finishRun(v)
          return
        }
        if (!v) await new Promise((ok) => setTimeout(ok, 1000))
      }
    }
    loop()
    return () => {
      gone = true
    }
  }, [run, ask])

  // Mantener y soltar: espacio, o el botón grande (ratón o dedo).
  const press = () => {
    if (held.current) return
    held.current = true
    setHolding(true)
    if (!run) start()
  }
  const release = () => {
    if (!held.current) return
    held.current = false
    setHolding(false)
    if (run) up()
  }
  const onKeyDown = useEffectEvent((event) => {
    if (event.code !== 'Space' || event.repeat) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    event.preventDefault()
    press()
  })
  const onKeyUp = useEffectEvent((event) => {
    if (event.code !== 'Space') return
    event.preventDefault()
    release()
  })
  const onBlur = useEffectEvent(() => release())
  useEffect(() => {
    const down = (e) => onKeyDown(e)
    const upKey = (e) => onKeyUp(e)
    const blur = () => onBlur()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', upKey)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', upKey)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // Un fotograma por refresco de pantalla mientras el buzo se mueve.
  const moving = Boolean(run) || (rise && !rise.done)
  useEffect(() => {
    if (!moving) return
    let frame
    const tick = () => {
      setFrame((n) => n + 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [moving])

  // Dónde está el buzo ahora.
  const shownZone = run?.zone ?? zone
  let depth = 0
  let downMs = 0
  let upElapsed = 0
  let state = 'idle'
  if (run) {
    downMs = Math.max(0, clock() - run.start)
    depth = depthAt(downMs)
    state = sent.current ? 'up' : 'swim'
  } else if (rise) {
    const k = rise.ms > 0 ? Math.min(1, (Date.now() - rise.at) / rise.ms) : 1
    depth = rise.from - (rise.from - rise.to) * k
    downMs = (rise.from / DOWN_MPS) * 1000
    upElapsed = ((rise.from - depth) / UP_MPS) * 1000
    state = rise.result.lost ? 'lost' : k < 1 ? 'up' : 'idle'
    if (k >= 1 && !rise.done) queueMicrotask(landed)
  }
  const reached = run ? depth : (rise?.from ?? 0)
  // Sonido al pasar por cada ostra.
  useEffect(() => {
    const n = Math.floor(reached / PEARL_M)
    if (run && n > passed.current) {
      passed.current = n
      if (n % 2) playBubbles()
      else playPearl(false)
    }
  })

  const airLeft = run || rise ? AIR_MS - downMs - upElapsed : AIR_MS
  const need = run ? upMs(depth) : 0
  const warn = Boolean(run) && airLeft - need < WARN_MS
  const shownBet = run ? run.bet : rise ? rise.result.stake : clampBet(bet, maxBetFor(balance))
  const mult = multAt(shownZone, run ? depth : reached)
  const worth = run ? payout(run.bet, mult) : 0
  const maxBet = maxBetFor(balance)
  const locked = Boolean(run) || (rise && !rise.done) || asking
  const result = rise?.done ? rise.result : null

  let status = 'Elige la zona y la apuesta. Mantén pulsado para bajar y suelta para subir.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Preparando el equipo…'
  else if (run && !sent.current) status = warn ? '¡Sube ya! Te queda el aire justo para volver.' : `Bajando: ${fmtM(depth)}. Si sueltas ahora, cobras ${eur(worth)} (${fmtMult(mult)}).`
  else if (run) status = 'Subiendo…'
  else if (rise && !rise.done) status = rise.result.lost === 'shark' ? '¡Un tiburón!' : rise.result.lost === 'air' ? 'Subiendo… ¡se acaba el aire!' : `Subiendo desde ${fmtM(rise.from)}…`
  else if (result && result.net > 0) {
    status = `¡Subiste desde ${fmtM(result.depth)}! ${fmtMult(result.mult)}: ganaste ${eur(result.net + (bank?.round === result.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (result && bank?.round === result.round && bank.extra > 0) status = `¡Te pilló el mar! Pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (result) {
    status = result.lost === 'shark' ? `Un tiburón te pilló a ${fmtM(result.depth)}. Perdiste ${eur(result.stake)}.` : `Te quedaste sin aire subiendo, a ${fmtM(result.lostAt)}. Perdiste ${eur(result.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  const seed = (rise?.result.round ?? run?.start ?? 0) % 97

  return (
    <main className="app ar-app bz-app">
      <header className="top">
        <h1>Buceo de Perlas</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(shownBank)}</dd>
            </div>
            <div>
              <dt>{run ? 'En juego' : 'Apuesta'}</dt>
              <dd>{eur(shownBet)}</dd>
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
            <Help className="tg tg--help" title="Cómo se juega al Buceo de Perlas">
              <p>
                <b>Mantén pulsado</b> (la barra espaciadora o el botón) para bajar y <b>suelta</b> para subir. Cuanto más hondo llegues, más
                cobras al volver a la superficie: el premio sube con cada metro.
              </p>
              <p>
                <b>El tiburón:</b> al tirarte, el servidor decide en secreto a qué profundidad aparece. Si llegas hasta él bajando, te pilla y pierdes
                la apuesta. Nadie sabe dónde está: unas veces aparece enseguida y otras ni aparece.
              </p>
              <p>
                <b>El aire:</b> la botella dura {AIR_MS / 1000} segundos y se gasta bajando y subiendo, y subir es el doble de lento. La marca de la
                botella te dice cuánto aire hace falta para volver desde donde estás: si sueltas tan abajo que no te llega, te ahogas por el camino.
                Bajando sin parar, el límite está en unos {fmtM(SAFE_M)}.
              </p>
              <ul>
                {Object.entries(ZONES).map(([id, z]) => (
                  <li key={id}>
                    <b>{z.name}:</b> a 10 m paga {fmtMult(multAt(id, 10))}, a 20 m {fmtMult(multAt(id, 20))} y en el límite del aire{' '}
                    {fmtMult(multAt(id, SAFE_M))}. Cuanto más paga, antes suele aparecer el tiburón.
                  </li>
                ))}
              </ul>
              <p>
                El servidor mide con su reloj cuánto bajaste, desde que te tiras hasta que sueltas. Bajes hasta donde bajes, de media se recupera el
                96 %. Con el Admin Abuse, la banca multiplica lo que ganes o te devuelve lo que pierdas, y el tiburón suele aparecer más hondo.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="ar fill">
        <section className={`bz-stage bz-stage--${shownZone} ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''} ${warn ? 'is-warn' : ''}`} aria-label="El mar">
          <Sea
            zone={shownZone}
            depth={depth}
            reached={reached}
            state={state}
            shark={rise?.result.lost === 'shark' ? rise.result.depth : null}
            seed={seed}
            moving={moving}
          />

          <div className="ar-top bz-top">
            <span className="ar-chip">
              <small>{run ? 'Si sueltas ahora' : 'Profundidad'}</small>
              <b>{run ? eur(worth) : fmtM(depth)}</b>
            </span>
            <span className="ar-chip ar-chip--next">
              <small>Premio</small>
              <b>{fmtMult(mult)}</b>
            </span>
            <span className="ar-chip bz-air">
              <small>Aire</small>
              <Tank left={airLeft} need={need} warn={warn} />
            </span>
          </div>

          <p className={`ar-status bz-status ${tone ? `is-${tone}` : ''} ${warn ? 'is-bad' : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="ar-panel">
          <div className="ar-loot-box">
            {run ? (
              <>
                <small>Si sueltas ahora</small>
                <b>{eur(worth)}</b>
                <span className="ar-loot-box__mult">
                  {fmtMult(mult)} · {fmtM(depth)}
                </span>
              </>
            ) : (
              <>
                <small>Si llegas a 20 m y vuelves</small>
                <b>{eur(payout(shownBet, multAt(zone, 20)))}</b>
                <span className="ar-loot-box__mult">{fmtMult(multAt(zone, 20))}</span>
              </>
            )}
          </div>

          <div className="ar-group">
            <h2>Zona</h2>
            <div className="ar-modes bz-zones" role="radiogroup" aria-label="Zona">
              {Object.entries(ZONES).map(([id, z]) => (
                <button key={id} type="button" role="radio" aria-checked={zone === id} className={`ar-mode bz-zone--${id}`} disabled={Boolean(locked)} onClick={() => setZone(id)}>
                  <span className="ar-mode__ico" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <b>{z.name}</b>
                  <small>hasta {fmtMult(multAt(id, SAFE_M))}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="ar-group">
            <h2>Apuesta</h2>
            <div className="ar-bet">
              <button type="button" disabled={Boolean(locked)} onClick={() => setBet(clampBet(shownBet - STEP * 5, maxBet))} aria-label="Bajar la apuesta">
                −
              </button>
              <span>{eur(shownBet)}</span>
              <button type="button" disabled={Boolean(locked)} onClick={() => setBet(clampBet(shownBet + STEP * 5, maxBet))} aria-label="Subir la apuesta">
                +
              </button>
            </div>
            <input
              className="ar-slider"
              type="range"
              min={MIN_BET}
              max={Math.max(maxBet, MIN_BET)}
              step={STEP}
              value={shownBet}
              disabled={Boolean(locked)}
              aria-label="Apuesta"
              onChange={(e) => setBet(Number(e.target.value))}
            />
            <div className="ar-quick">
              <button type="button" disabled={Boolean(locked)} onClick={() => setBet(MIN_BET)}>
                Mín
              </button>
              <button type="button" disabled={Boolean(locked)} onClick={() => setBet(clampBet(shownBet / 2, maxBet))}>
                ½
              </button>
              <button type="button" disabled={Boolean(locked)} onClick={() => setBet(clampBet(shownBet * 2, maxBet))}>
                ×2
              </button>
              <button type="button" disabled={Boolean(locked)} onClick={() => setBet(maxBet)}>
                Máx
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`ar-go bz-hold ${holding ? 'is-held' : ''} ${warn ? 'is-warn' : ''}`}
            disabled={!ready || (!run && (Boolean(rise && !rise.done) || asking || balance < MIN_BET))}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              press()
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="bz-hold__text">
              {run && !sent.current ? (
                <>
                  <b>Suelta para subir</b>
                  <small>
                    {eur(worth)} · {fmtM(depth)}
                  </small>
                </>
              ) : (
                <>
                  <b>Mantén para bajar</b>
                  <small>suelta para subir y cobrar</small>
                </>
              )}
            </span>
            <kbd>Espacio</kbd>
          </button>

          <div className="ar-group">
            <h2>Récord del día</h2>
            {ranking.length === 0 ? (
              <p className="ar-hint">Nadie ha subido perlas hoy todavía. ¡El primero se pone arriba!</p>
            ) : (
              <ol className="ar-rank">
                {ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''}>
                    <span className="ar-rank__pos">{MEDALS[i] ?? i + 1}</span>
                    <Avatar name={r.name} src={r.avatar} size={26} />
                    <span className="ar-rank__name">{r.name}</span>
                    <span className="ar-rank__mult">
                      {fmtMult(r.mult)}
                      <small>{ZONES[r.mode]?.name ?? ''}</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {history.length > 0 && (
              <ol className="ar-history" aria-label="Últimas inmersiones">
                {history.map((h) => (
                  <li key={h.id} className={h.mult > 0 ? 'is-win' : 'is-lose'}>
                    {h.mult > 0 ? fmtMult(h.mult) : '🦈'}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`${fmtMult(burst.mult)} desde ${fmtM(burst.depth)}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 3)}
          big={burst.mult >= 10}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Buceo
