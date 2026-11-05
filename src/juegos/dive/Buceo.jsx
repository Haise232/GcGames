// Buceo de Perlas (Season 4): bajas al fondo del mar tramo a tramo y en cada uno abres una ostra. Si sale perla, el premio
// crece (la perla negra lo dobla); si sale un tiburón o se acaba el aire, pierdes la apuesta. Subes y cobras cuando
// quieras, o eliges hasta dónde bajar y el buzo lo hace solo. Cada tramo lo sortea el servidor al bajarlo (reglas en
// dive.js); aquí solo se anima.
// La escena es un mar en vertical de 0 a 40 m (un SVG alto) y la cámara sigue al buzo. Cada zona tiene su paisaje:
// la Laguna clara, el Arrecife con corales y el Abismo a oscuras, con la linterna del buzo como única luz.
// El panel (apuesta, zonas, récord del día) usa las piezas de Tesoro en la Arena (ar-*, dig/Arena.css).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { BLACK, MAX_DEPTH, MAX_MULT, METERS, MIN_BET, STEP, ZONES, clampBet, fmtMult, isLoss, maxBetFor, multAfter, nextIfPearl, payout, shownMult } from './dive.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playBubbles, playCash, playChip, playGasp, playGrowl, playLose, playPearl, playSplash, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import '../dig/Arena.css'
import './Buceo.css'

const DIVE_MS = 700 // lo que tarda el buzo en bajar un tramo antes de abrir la ostra
const AUTO_GAP_MS = 550 // pausa entre tramos en el buceo automático, para que se vea cada ostra
const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
const ICONS = { laguna: '🐢', arrecife: '🪸', abismo: '🦑' }
const PEARL_NAMES = { white: 'Perla blanca', pink: 'Perla rosa', gold: 'Perla dorada', blue: 'Perla azul', black: '¡Perla negra!', shark: '¡Tiburón!', air: 'Sin aire' }
const PEARL_COLORS = { white: ['#ffffff', '#d8d4e4'], pink: ['#ffe8f0', '#f39ab8'], gold: ['#fff4b8', '#e0a630'], blue: ['#e6f8ff', '#6ab8e8'], black: ['#8a76b0', '#120c22'] }
const AUTOS = [null, 3, 5, 7, 10] // tramos del buceo automático (null: a mano)

// --- El mundo: coordenadas del SVG ---
const W = 600
const H = 1480
const SURFACE = 70
const FIRST = 190 // y del primer tramo
const GAP = 120 // de un tramo al siguiente
const SEABED = FIRST + (MAX_DEPTH - 1) * GAP + 90
const stepY = (n) => (n <= 0 ? SURFACE : FIRST + (n - 1) * GAP) // y del tramo n (0: la superficie)
const sideOf = (n) => (n % 2 ? 'l' : 'r') // las ostras van alternando de pared
const oysterX = (n) => (sideOf(n) === 'l' ? 96 : W - 96)
const diverX = (n) => (n <= 0 ? W / 2 : sideOf(n) === 'l' ? 200 : W - 200)

// Colores del agua de cada zona: de la superficie al fondo.
const WATER = {
  laguna: ['#5ee8dc', '#22b4c4', '#11708e', '#0b4466'],
  arrecife: ['#3fd0d0', '#1590b0', '#0b5480', '#082c50'],
  abismo: ['#2aa8c0', '#0d5a86', '#061c44', '#020616'],
}

// --- Piezas del dibujo ---

function Oyster({ n, kind, fresh }) {
  const x = oysterX(n)
  const y = stepY(n)
  const open = kind !== undefined && kind !== 'air'
  const pearl = open && !isLoss(kind)
  const flip = sideOf(n) === 'r' ? -1 : 1
  const [hi, lo] = PEARL_COLORS[kind] ?? PEARL_COLORS.white
  return (
    <g className={`bz-oyster ${open ? 'is-open' : ''} ${fresh ? 'is-fresh' : ''} ${kind === 'black' ? 'is-black' : ''} ${isLoss(kind) ? 'is-loss' : ''}`} transform={`translate(${x} ${y + 14}) scale(${flip} 1)`}>
      {/* La repisa de roca. */}
      <path d="M-80 18 Q-40 6 30 10 Q48 14 44 26 Q0 34 -80 32 Z" fill="#2a3a48" stroke="#101a24" strokeWidth="3" />
      <path d="M-76 20 Q-30 12 26 14" fill="none" stroke="#4a6070" strokeWidth="3" strokeLinecap="round" />
      {/* Concha de abajo. */}
      <path d="M-26 8 Q0 26 26 8 Q0 14 -26 8 Z" fill="#8a7a9a" stroke="#2a1a3a" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Tapa: cerrada, o abierta hacia atrás. */}
      <g className="bz-oyster__lid">
        <path d={open ? 'M-26 8 Q-22 -22 0 -24 Q22 -22 26 8 Q0 -2 -26 8 Z' : 'M-26 8 Q0 -6 26 8 Q0 18 -26 8 Z'} fill="#a898b8" stroke="#2a1a3a" strokeWidth="2.5" strokeLinejoin="round" />
        {open && <path d="M-16 0 Q0 -12 16 0" stroke="#c8b8d8" strokeWidth="2" fill="none" />}
      </g>
      {pearl && (
        <g className="bz-pearl">
          <circle cx="0" cy="8" r="9" fill={lo} />
          <circle cx="0" cy="8" r="9" fill={hi} opacity="0.55" />
          <circle cx="-3" cy="5" r="2.6" fill="#fff" />
        </g>
      )}
      {kind === 'black' && <circle className="bz-shock" cx="0" cy="8" r="20" fill="none" stroke="#c49cff" strokeWidth="4" />}
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

// El mar entero, con la cámara que sigue al buzo y la linterna en el Abismo.
function Sea({ zone, pearls, fresh, at, diving, lostKind, finished }) {
  const depthShown = Math.min(at + (diving ? 1 : 0), MAX_DEPTH)
  const ending = lostKind === 'air'
  const dx = diverX(depthShown)
  const dy = ending ? stepY(depthShown) - 60 : stepY(depthShown) - (depthShown > 0 ? 6 : 0)
  const face = depthShown <= 0 ? 1 : sideOf(depthShown) === 'l' ? -1 : 1
  const state = lostKind ? 'lost' : diving ? 'swim' : finished ? 'up' : 'idle'
  const [c0, c1, c2, c3] = WATER[zone]
  const dark = zone === 'abismo' ? Math.min(0.88, 0.25 + depthShown * 0.07) : zone === 'arrecife' ? Math.min(0.45, depthShown * 0.04) : Math.min(0.25, depthShown * 0.025)
  return (
    <div className="bz-window">
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
            <circle className="bz-lamp" r="170" fill="url(#bz-lamp)" style={{ transform: `translate(${dx}px, ${dy}px)` }} />
          </mask>
        </defs>
        <rect width={W} height={H} fill="url(#bz-water)" />
        {/* El cielo y la barca arriba. */}
        <rect width={W} height={SURFACE - 30} fill="#ffcf8a" />
        <circle cx="470" cy={SURFACE - 30} r="26" fill="#ffe36e" />
        <path className="bz-surface" d={`M-20 ${SURFACE - 30} Q0 ${SURFACE - 38} 20 ${SURFACE - 30} T60 ${SURFACE - 30} T100 ${SURFACE - 30} T140 ${SURFACE - 30} T180 ${SURFACE - 30} T220 ${SURFACE - 30} T260 ${SURFACE - 30} T300 ${SURFACE - 30} T340 ${SURFACE - 30} T380 ${SURFACE - 30} T420 ${SURFACE - 30} T460 ${SURFACE - 30} T500 ${SURFACE - 30} T540 ${SURFACE - 30} T580 ${SURFACE - 30} T620 ${SURFACE - 30} V${SURFACE - 20} H-20 Z`} fill="#c8f6ff" opacity="0.8" />
        <g transform={`translate(262 ${SURFACE - 52})`}>
          <path d="M0 14 L74 14 L62 30 L12 30 Z" fill="#c9824a" stroke="#5a2a10" strokeWidth="3" strokeLinejoin="round" />
          <path d="M34 14 V-24 L58 8 Z" fill="#fff6e8" stroke="#5a2a10" strokeWidth="2" />
        </g>
        <Scenery zone={zone} />
        {Array.from({ length: MAX_DEPTH }, (_, i) => (
          <Oyster key={i} n={i + 1} kind={pearls[i]} fresh={fresh === i + 1} />
        ))}
        {lostKind === 'shark' && <Shark y={stepY(at)} from={sideOf(at) === 'l' ? 'r' : 'l'} />}
        <Diver x={dx} y={dy} face={face} state={state} />
        {/* Oscuridad del fondo, con la luz de la linterna alrededor del buzo. */}
        <rect className="bz-dark" width={W} height={H} fill="#01030c" opacity={dark} mask="url(#bz-dark)" />
        {zone === 'abismo' && depthShown > 0 && <circle className="bz-lamp" r="130" fill="url(#bz-glow)" style={{ transform: `translate(${dx + face * 40}px, ${dy}px)` }} />}
      </svg>
      {/* Regla de profundidad a la izquierda de la ventana. */}
      <div className="bz-gauge" style={{ '--p': depthShown / MAX_DEPTH }} aria-hidden="true">
        <span className="bz-gauge__fill" />
        <b>{depthShown * METERS} m</b>
      </div>
    </div>
  )
}

// La botella de aire: diez segmentos que se van apagando.
function Tank({ left }) {
  return (
    <span className={`bz-tank ${left <= 2 ? 'is-low' : ''}`} aria-label={`Aire: ${left} de ${MAX_DEPTH} tramos`}>
      {Array.from({ length: MAX_DEPTH }, (_, i) => (
        <i key={i} className={i < left ? 'is-on' : ''} />
      ))}
    </span>
  )
}

// El collar con las perlas de esta inmersión.
function Necklace({ pearls }) {
  const list = pearls.filter((p) => !isLoss(p))
  if (!list.length) return null
  return (
    <div className="bz-necklace" aria-label={`Llevas ${list.length} perla${list.length === 1 ? '' : 's'}`}>
      {list.map((p, i) => {
        const [hi, lo] = PEARL_COLORS[p]
        return <i key={i} className={p === 'black' ? 'is-black' : ''} style={{ '--hi': hi, '--lo': lo }} />
      })}
    </div>
  )
}

// --- Juego ---

function Buceo({ onExit, juegos }) {
  const [bet, setBet] = useState(50)
  const [zone, setZone] = useState('arrecife')
  const [auto, setAuto] = useState(null) // tramos hasta los que baja solo (null: a mano)
  const [autoRun, setAutoRun] = useState(false) // el buceo automático está en marcha
  const [sound, setSound] = useState(() => !isMuted())
  const [run, setRun] = useState(null) // { bet, zone, depth, mult, pearls } mientras hay una inmersión
  const [asking, setAsking] = useState(false)
  const [diving, setDiving] = useState(false)
  const [fresh, setFresh] = useState(null) // el último tramo abierto, para su animación
  const [gain, setGain] = useState(null) // { id, text, black } lo que subió el premio en el último tramo
  const [last, setLast] = useState(null)
  const [history, setHistory] = useState([])
  const [ranking, setRanking] = useState([])
  const [burst, setBurst] = useState(null)
  const [bank, setBank] = useState(null)
  const [ready, setReady] = useState(false)
  const [shake, setShake] = useState(false)
  const lock = useRef(false)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !diving) setBalance(serverBalance)
  }, [serverBalance, asking, diving])
  const shownBank = useCountUp(balance)

  const record = (result) => {
    setLast(result)
    setHistory((list) => (list.some((h) => h.id === result.round) ? list : [{ id: result.round, mult: result.net >= 0 ? result.mult : 0 }, ...list].slice(0, HISTORY)))
  }

  const apply = (v) => {
    if (v.ranking) setRanking(v.ranking)
    if (v.bet > 0) {
      setRun({ bet: v.bet, zone: v.zone, depth: v.depth, mult: v.mult, pearls: v.pearls })
      setZone(v.zone)
      setBet(v.bet)
    } else setRun(null)
  }

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_dive', a: 'sync' })
    const v = body?.solo
    if (!v) return
    apply(v)
    if (v.last) record(v.last)
    setBalance(v.balance)
  })
  useEffect(() => {
    let alive = true
    resync().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_dive', ...message })
    lock.current = false
    setAsking(false)
    const v = body?.solo ?? null
    if (!v) await resync()
    else if (body.abuse) v.abuse = body.abuse
    return v
  }

  const shownZone = run?.zone ?? zone
  const depth = run?.depth ?? 0
  const maxBet = maxBetFor(balance)
  const shownBet = run ? run.bet : clampBet(bet, maxBet)
  const busy = asking || !ready || diving
  const canBet = !run && !asking && maxBet >= MIN_BET
  const worth = run && depth > 0 ? payout(run.bet, run.mult) : 0
  const liveWorth = useCountUp(worth, 450)
  const risk = Math.round(ZONES[shownZone].risk * 100)
  const next = nextIfPearl(shownZone, run?.mult ?? 0)
  const air = MAX_DEPTH - depth

  async function start() {
    if (busy || run || shownBet > balance) return
    playChip()
    setBurst(null)
    setLast(null)
    setBank(null)
    setFresh(null)
    setGain(null)
    const v = await act({ a: 'start', bet: shownBet, zone })
    if (!v) return
    playSplash()
    setBalance(v.balance)
    apply(v)
    if (auto) setAutoRun(true)
  }

  async function down() {
    if (busy || !run) return
    setDiving(true)
    playBubbles()
    const before = run.mult
    const [v] = await Promise.all([act({ a: 'dive' }), new Promise((ok) => setTimeout(ok, reduced ? 0 : DIVE_MS))])
    setDiving(false)
    if (!v) {
      setAutoRun(false)
      return
    }
    const lost = v.ev === 'shark' || v.ev === 'air'
    const kind = lost ? v.ev : v.kind
    const at = (v.bet > 0 ? v.depth : v.last?.depth) ?? 0
    setFresh(at)
    if (lost) {
      setAutoRun(false)
      if (v.ev === 'shark') {
        playGrowl()
        setTimeout(playLose, 260)
      } else playGasp()
      buzz([40, 40, 160])
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (v.abuse) setBank({ round: v.last.round, ...v.abuse })
      apply(v)
      record(v.last)
      setBalance(v.balance)
      return
    }
    playPearl(kind === 'black')
    if (kind === 'black') buzz([30, 30, 30])
    const now = v.bet > 0 ? v.mult : (v.last?.mult ?? 0)
    setGain({ id: Date.now(), at, black: kind === 'black', text: before > 0 ? `${fmtMult(shownMult(now) / shownMult(before))} → ${fmtMult(shownMult(now))}` : fmtMult(shownMult(now)) })
    apply(v)
    if (v.ev === 'top') {
      setAutoRun(false)
      record(v.last)
      setBalance(v.balance)
      finish(v.last, v.abuse)
    }
  }

  async function cash() {
    if (busy || !run || depth < 1) return
    setAutoRun(false)
    const v = await act({ a: 'cash' })
    if (!v) return
    playSplash()
    apply(v)
    record(v.last)
    setBalance(v.balance)
    finish(v.last, v.abuse)
  }

  function finish(result, abuse) {
    if (abuse) setBank({ round: result.round, ...abuse })
    if (result.net <= 0) return
    playCash(Math.min(10, Math.round(result.mult)))
    playWin(result.mult >= 10)
    buzz([60, 40, 80])
    const blacks = result.pearls.filter((p) => p === 'black').length
    setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, depth: result.depth, blacks, extra: abuse?.extra ?? 0 })
  }

  // Buceo automático: baja tramo a tramo con una pausa y sube al llegar a lo elegido.
  const autoStep = useEffectEvent(() => {
    if (!autoRun || !run || busy) return
    if (auto && run.depth >= auto) cash()
    else down()
  })
  useEffect(() => {
    if (!autoRun || !run || busy) return
    const timer = setTimeout(() => autoStep(), run.depth === 0 ? 350 : reduced ? 150 : AUTO_GAP_MS)
    return () => clearTimeout(timer)
  }, [autoRun, run, busy, reduced])

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    if ((event.code === 'KeyC' || event.code === 'Enter' || event.code === 'ArrowUp') && run) {
      event.preventDefault()
      cash()
    } else if ((event.code === 'Space' || event.code === 'ArrowDown') && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      if (autoRun) setAutoRun(false)
      else if (run) down()
      else start()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  // Lo que se ve en el mar: durante la inmersión, lo bajado; al acabar, la última (con cómo acabó) si es de esta zona.
  const ended = !run && last && last.zone === zone ? last : null
  const pearls = run ? run.pearls : (ended?.pearls ?? [])
  const lostKind = ended?.lost ? ended.pearls[ended.pearls.length - 1] : null
  const at = run ? depth : ended ? (ended.lost ? ended.depth : 0) : 0

  let status = 'Elige la zona y tu apuesta, y tírate al agua.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Preparando el equipo…'
  else if (diving) status = `Bajando a ${(depth + 1) * METERS} m…`
  else if (run && depth === 0) status = `Baja al primer tramo y abre la ostra. En ${ZONES[run.zone].name} hay un ${risk} % de peligro en cada tramo.`
  else if (run) {
    const k = run.pearls[run.pearls.length - 1]
    status =
      k === 'black'
        ? `¡Perla negra a ${depth * METERS} m! El premio se dobla: llevas ${eur(worth)}.`
        : `${PEARL_NAMES[k]} a ${depth * METERS} m. Llevas ${eur(worth)}; el siguiente tramo vale ${fmtMult(next)}.`
  } else if (last?.net > 0) {
    status = `¡Subiste con ${fmtMult(last.mult)} desde ${last.depth * METERS} m! Ganaste ${eur(last.net + (bank?.round === last.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (last && bank?.round === last.round && bank.extra > 0) status = `¡Te pilló el mar! Pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (last) {
    const why = last.pearls[last.pearls.length - 1] === 'shark' ? 'Un tiburón te espantó' : 'Te quedaste sin aire'
    status = `${why} a ${last.depth * METERS} m. Perdiste ${eur(last.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

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
                Elige la zona y tu apuesta y tírate al agua. Con <b>Bajar</b> (o <kbd>Espacio</kbd>) bajas {METERS} metros y abres una ostra: si
                sale <b>perla</b>, tu premio crece; si sale un <b>tiburón</b> o se te acaba el <b>aire</b>, pierdes la apuesta.
              </p>
              <p>
                Subes y cobras cuando quieras con <b>Subir</b> (o <kbd>C</kbd>). La botella da para {MAX_DEPTH} tramos: en el último subes solo. Si
                llegas al tope de {fmtMult(MAX_MULT)}, también. Con <b>Bajar solo hasta</b> eliges a qué profundidad subir y el buzo lo hace por ti
                (lo paras cuando quieras).
              </p>
              <p>
                A veces sale una <b>perla negra</b> ({Math.round(BLACK * 100)} % de las veces): ese tramo paga el doble.
              </p>
              <ul>
                {Object.entries(ZONES).map(([id, z]) => (
                  <li key={id}>
                    <b>{z.name}:</b> {Math.round(z.risk * 100)} % de peligro en cada tramo. El primero paga {fmtMult(multAfter(id, 1))}, y los{' '}
                    {MAX_DEPTH}, {fmtMult(multAfter(id, MAX_DEPTH))} (sin perlas negras).
                  </li>
                ))}
              </ul>
              <p>
                Cada tramo se sortea en el servidor al bajarlo, así que no hay truco: subas cuando subas, de media se recupera el 96 %. Con el Admin
                Abuse, la banca multiplica lo que ganes o te devuelve lo que pierdas, y tienes más suerte al bajar.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="ar fill">
        <section className={`bz-stage bz-stage--${shownZone} ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''} ${run ? 'is-run' : ''}`} aria-label="El mar">
          <Sea zone={shownZone} pearls={pearls} fresh={fresh} at={at} diving={diving} lostKind={lostKind} finished={Boolean(ended && !ended.lost)} />

          <div className="ar-top bz-top">
            <span className="ar-chip">
              <small>{run ? 'Si subes ahora' : 'Profundidad'}</small>
              <b>{run ? eur(liveWorth) : `${at * METERS} m`}</b>
            </span>
            <span className="ar-chip bz-air">
              <small>Aire</small>
              <Tank left={run ? air : MAX_DEPTH} />
            </span>
            {run && (
              <span className="ar-chip ar-chip--next">
                <small>Siguiente</small>
                <b>
                  {fmtMult(next)} · {risk} % 🦈
                </b>
              </span>
            )}
          </div>

          {gain && (
            <span key={gain.id} className={`bz-gain ${gain.black ? 'is-black' : ''}`} aria-hidden="true">
              {gain.black && <small>¡Perla negra! ×2</small>}
              {gain.text}
            </span>
          )}

          <p className={`ar-status bz-status ${tone ? `is-${tone}` : ''}`} role="status">
            {status}
          </p>
          {run && depth > 0 && (
            <button type="button" className="ar-cash-float" disabled={busy} onClick={cash}>
              Subir con {eur(liveWorth)}
            </button>
          )}
        </section>

        <aside className="ar-panel">
          <div className="ar-loot-box">
            {run ? (
              <>
                <small>{depth > 0 ? 'Si subes ahora' : 'Baja al primer tramo'}</small>
                <b>{eur(depth > 0 ? liveWorth : 0)}</b>
                <span className="ar-loot-box__mult">{depth > 0 ? fmtMult(shownMult(run.mult)) : `Siguiente: ${fmtMult(next)}`}</span>
                <Necklace pearls={run.pearls} />
              </>
            ) : (
              <>
                <small>{auto ? `Bajando hasta ${auto * METERS} m` : 'Bajando 5 tramos'}</small>
                <b>{eur(Math.floor(shownBet * multAfter(zone, auto ?? 5)))}</b>
                <span className="ar-loot-box__mult">{fmtMult(multAfter(zone, auto ?? 5))}</span>
              </>
            )}
          </div>

          <div className="ar-group">
            <h2>Zona</h2>
            <div className="ar-modes bz-zones" role="radiogroup" aria-label="Zona">
              {Object.entries(ZONES).map(([id, z]) => (
                <button key={id} type="button" role="radio" aria-checked={zone === id} className={`ar-mode bz-zone--${id}`} disabled={Boolean(run) || asking} onClick={() => setZone(id)}>
                  <span className="ar-mode__ico" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <b>{z.name}</b>
                  <small>
                    {Math.round(z.risk * 100)} % 🦈 · {fmtMult(multAfter(id, 1))}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="ar-group">
            <h2>Apuesta</h2>
            <div className="ar-bet">
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet - STEP * 5, maxBet))} aria-label="Bajar la apuesta">
                −
              </button>
              <span>{eur(shownBet)}</span>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet + STEP * 5, maxBet))} aria-label="Subir la apuesta">
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
              disabled={!canBet}
              aria-label="Apuesta"
              onChange={(e) => setBet(Number(e.target.value))}
            />
            <div className="ar-quick">
              <button type="button" disabled={!canBet} onClick={() => setBet(MIN_BET)}>
                Mín
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet / 2, maxBet))}>
                ½
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(clampBet(shownBet * 2, maxBet))}>
                ×2
              </button>
              <button type="button" disabled={!canBet} onClick={() => setBet(maxBet)}>
                Máx
              </button>
            </div>
          </div>

          <div className="ar-group">
            <h2>Bajar solo hasta</h2>
            <div className="bz-autos" role="radiogroup" aria-label="Buceo automático">
              {AUTOS.map((n) => (
                <button key={n ?? 'mano'} type="button" role="radio" aria-checked={auto === n} disabled={Boolean(run) || asking} onClick={() => setAuto(n)}>
                  {n ? `${n * METERS} m` : 'A mano'}
                  {n && <small>{fmtMult(multAfter(zone, n))}</small>}
                </button>
              ))}
            </div>
          </div>

          {!run ? (
            <button type="button" className="ar-go" disabled={busy || shownBet > balance || balance < MIN_BET} onClick={start}>
              {asking ? 'Preparando el equipo…' : auto ? `¡Al agua hasta ${auto * METERS} m!` : '¡Al agua!'}
              <kbd>Espacio</kbd>
            </button>
          ) : autoRun ? (
            <div className="bz-actions">
              <button type="button" className="ar-go bz-stop" onClick={() => setAutoRun(false)}>
                Parar el buceo automático
                <kbd>Espacio</kbd>
              </button>
              <button type="button" className="ar-go ar-go--cash" disabled={busy || depth < 1} onClick={cash}>
                {depth < 1 ? (
                  'Bajando…'
                ) : (
                  <span className="ar-go__cash">
                    <small>Subir ya</small>
                    <b>{eur(liveWorth)}</b>
                  </span>
                )}
                <kbd>C</kbd>
              </button>
            </div>
          ) : (
            <div className="bz-actions">
              <button type="button" className="ar-go bz-down" disabled={busy || air < 1} onClick={down}>
                {diving ? 'Bajando…' : `Bajar a ${(depth + 1) * METERS} m`}
                <kbd>Espacio</kbd>
              </button>
              <button type="button" className="ar-go ar-go--cash" disabled={busy || depth < 1} onClick={cash}>
                {depth < 1 ? (
                  'Baja al menos un tramo'
                ) : (
                  <span className="ar-go__cash">
                    <small>Subir y cobrar</small>
                    <b>{eur(liveWorth)}</b>
                  </span>
                )}
                <kbd>C</kbd>
              </button>
            </div>
          )}

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
          caption={`${fmtMult(burst.mult)} desde ${burst.depth * METERS} m${burst.blacks ? ` · ${burst.blacks} perla${burst.blacks === 1 ? '' : 's'} negra${burst.blacks === 1 ? '' : 's'}` : ''}`}
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
