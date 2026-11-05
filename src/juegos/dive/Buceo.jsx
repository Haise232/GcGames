// Apnea (Season 4): se juega manteniendo pulsado y aguantando la respiración. Mientras mantienes (espacio o el botón), el
// buzo baja; al soltar, sube. Cuanto más hondo llegues y consigas volver, más cobras. Dos peligros: el tiburón, que aparece
// a una profundidad que el servidor sortea en secreto al tirarte, y el aire de los pulmones, que se gasta bajando y
// subiendo (subir es más lento): si sueltas tan abajo que no llegas, te ahogas por el camino. Reglas en dive.js; el
// servidor mide la bajada con su reloj y aquí solo se anima.
// La escena es un mar en vertical de 0 a 40 m (un SVG alto) y la cámara sigue al buzo. Cada zona tiene su paisaje: la
// Laguna clara, el Arrecife con corales y el Abismo a oscuras, con la linterna del buzo y unos ojos que miran.
// La tensión es lo central: con el margen de aire que te queda (lo que sobra después de reservar lo que cuesta volver)
// se calcula un nivel de 0 a 1 que cierra la visión en túnel, apaga los colores, enrojece los bordes y acelera un latido,
// y que se alivia según subes. Los pulmones enseñan el aire que queda y, con una raya, el que hace falta para volver.
// El panel (apuesta, zonas, récord del día) usa las piezas de Tesoro en la Arena (ar-*, dig/Arena.css).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { AIR_MS, DOWN_MPS, MAX_M, MIN_BET, SAFE_M, STEP, UP_MPS, ZONES, clampBet, depthAt, fmtM, fmtMult, maxBetFor, multAt, payout, upMs } from './dive.js'
import { eur } from '../comun/money.js'
import { buzz, isMuted, playBubbles, playCash, playGasp, playGrowl, playInhale, playLose, playPulse, playSplash, playSurfaceGasp, playWin, setMuted } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import Help from '../comun/Help.jsx'
import Avatar from '../comun/Avatar.jsx'
import '../dig/Arena.css'
import './Buceo.css'

const HISTORY = 12
const MEDALS = ['🥇', '🥈', '🥉']
const ICONS = { laguna: '🐢', arrecife: '🪸', abismo: '🦑' }
const WARN_MS = 3500 // aviso de «¡sube ya!» cuando queda menos aire que esto de margen para volver
const TENSE_MS = 18000 // la tensión empieza a notarse cuando el margen baja de esto, y es máxima al llegar a cero
const BEAT_MS = [0, 1000, 720, 500] // lo que tarda un latido en cada nivel de tensión (el 0 es sin latido)
const GULP_MS = 1100 // la bocanada de la superficie, antes de enseñar el premio

// --- El mundo: coordenadas del SVG ---
const W = 600
const H = 1520
const SURFACE = 120 // la y de la superficie del agua (arriba, el cielo del atardecer)
const WATERLINE = SURFACE - 30
const yOf = (d) => SURFACE + d * 30 // de metros a la y del dibujo (40 m: 1320)
const SEABED = yOf(MAX_M) + 90

// Colores del agua de cada zona: de la superficie al fondo.
const WATER = {
  laguna: ['#5ee8dc', '#22b4c4', '#11708e', '#0b4466'],
  arrecife: ['#3fd0d0', '#1590b0', '#0b5480', '#082c50'],
  abismo: ['#2aa8c0', '#0d5a86', '#061c44', '#020616'],
}

// --- Piezas del dibujo ---

// El apneísta: mono negro con rayas, capucha, gafas, los brazos estirados por delante y dos aletas largas. Sin botella:
// lo único que lleva es el aire de los pulmones. Cuando va justo de aire se le escapan burbujas por la nariz (`leak`, de
// 0 a 3, cuántas); si no, aguanta sin soltar ninguna.
function Diver({ x, y, face, state, leak }) {
  const head = state === 'up' ? [11, -42] : state === 'idle' ? [-44, 0] : [-13, 41] // dónde queda la cabeza según la postura
  return (
    <g className={`bz-diver is-${state}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
      <g style={{ transform: `scaleX(${face})` }}>
        <g className="bz-diver__body">
          {/* Aletas largas que patalean. */}
          <g className="bz-fins">
            <path d="M-46 6 L-102 -6 Q-108 4 -102 12 Z" fill="#2ee6d0" stroke="#0a1a30" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M-46 10 L-98 16 Q-102 26 -94 30 Z" fill="#12a89a" stroke="#0a1a30" strokeWidth="2.5" strokeLinejoin="round" />
          </g>
          {/* Piernas juntas, torso y el mono con su raya. */}
          <path d="M-50 8 L-14 6" stroke="#0e2036" strokeWidth="12" strokeLinecap="round" />
          <path d="M-44 8 L-18 6" stroke="#2ee6d0" strokeWidth="2" strokeLinecap="round" />
          <path d="M-20 -6 Q4 -12 24 -4 L24 14 Q2 16 -20 12 Z" fill="#0e2036" stroke="#0a1a30" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-14 -2 Q4 -7 20 -1" stroke="#ff8a4c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Cabeza entre los brazos: capucha, cara y gafas. */}
          <circle cx="34" cy="4" r="11" fill="#0e2036" stroke="#0a1a30" strokeWidth="2.5" />
          <path d="M38 -2 Q46 3 40 10 Q35 7 38 -2 Z" fill="#ffd9b8" />
          <rect x="37" y="-1" width="10" height="7" rx="3.5" fill="#8fe3ff" stroke="#0a1a30" strokeWidth="2" />
          {/* Brazos estirados por delante y manos juntas. */}
          <path d="M16 0 L64 2" stroke="#0e2036" strokeWidth="7" strokeLinecap="round" />
          <path d="M16 8 L62 6" stroke="#16304e" strokeWidth="6" strokeLinecap="round" />
          <circle cx="66" cy="4" r="4" fill="#ffd9b8" stroke="#6a3a20" strokeWidth="1.5" />
        </g>
      </g>
      {/* Burbujas que se le escapan por la nariz cuando el aire va justo (salen de donde tiene la cabeza). */}
      <g className="bz-breath">
        {Array.from({ length: leak * 3 }, (_, i) => (
          <circle key={i} cx={head[0]} cy={head[1]} r={2 + (i % 3)} style={{ '--i': i }} />
        ))}
      </g>
    </g>
  )
}

// Un par de ojos que brillan en la oscuridad: parpadean de vez en cuando y miran desde la pared.
function Eyes({ x, y, size = 1, i = 0 }) {
  return (
    <g className="bz-eyes" style={{ '--i': i }} transform={`translate(${x} ${y}) scale(${size})`}>
      <g className="bz-eyes__in">
        {[-15, 15].map((dx) => (
          <g key={dx} transform={`translate(${dx} 0)`}>
            <ellipse rx="9" ry="6" fill="#ff3a4a" />
            <ellipse rx="3" ry="6" fill="#1a0408" />
          </g>
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
        <path d="M80 90 L140 90 L40 750 L0 750 Z" fill="url(#bz-ray)" />
        <path d="M260 90 L310 90 L300 700 L240 700 Z" fill="url(#bz-ray)" />
        <path d="M440 90 L500 90 L600 770 L540 770 Z" fill="url(#bz-ray)" />
      </g>
      {/* Paredes de roca a los lados. */}
      <path d={`M0 ${SURFACE + 40} Q30 350 18 650 Q40 950 14 1150 Q36 1350 20 ${H} H0 Z`} fill="#16222e" />
      <path d={`M${W} ${SURFACE + 40} Q${W - 26} 410 ${W - 16} 690 Q${W - 40} 950 ${W - 12} 1170 Q${W - 34} 1370 ${W - 18} ${H} H${W} Z`} fill="#16222e" />

      {zone === 'laguna' && (
        <g>
          {/* Reflejos de la luz que bailan en el agua somera. */}
          <g className="bz-caustics" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
            <path d="M40 220 q40 -16 80 0 t80 0 t80 0 t80 0 t80 0" />
            <path d="M-30 300 q40 -16 80 0 t80 0 t80 0 t80 0 t80 0 t80 0" />
            <path d="M60 390 q40 -16 80 0 t80 0 t80 0 t80 0 t80 0" />
          </g>
          <School y={290} color="#ffd25e" dur={14} />
          <School y={610} color="#ff8a6a" dur={18} delay={-6} rev />
          <School y={870} color="#8fe3ff" dur={15} delay={-3} />
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
          {/* Algas largas que se mecen con la corriente. */}
          <g fill="none" strokeLinecap="round" strokeWidth="9">
            {[90, 150, 470, 530].map((x, i) => (
              <path key={x} className="bz-kelp" style={{ '--i': i }} d={`M${x} ${SEABED + 20} Q${x - 24} ${SEABED - 90} ${x} ${SEABED - 190} T${x} ${SEABED - 380}`} stroke={i % 2 ? '#2f8a4a' : '#43d17c'} opacity="0.85" />
            ))}
          </g>
          <School y={350} color="#ff8a4c" dur={13} n={4} />
          <School y={750} color="#ffd25e" dur={17} delay={-8} rev />
          <School y={1050} color="#2ee6d0" dur={14} delay={-4} />
          {/* Corales en las paredes. */}
          {[380, 690, 1010, 1290].map((y, i) => (
            <g key={y} transform={`translate(${i % 2 ? W - 20 : 20} ${y}) scale(${i % 2 ? -1 : 1} 1)`}>
              <path d="M0 0 Q20 -10 16 -40 Q30 -30 28 -10 Q40 -36 46 -50 Q52 -20 34 4 Z" fill={i % 2 ? '#ff6b8a' : '#ffb547'} stroke="#5a1a2a" strokeWidth="2.5" />
            </g>
          ))}
          {/* La morena que asoma de la pared. */}
          <g className="bz-moray" transform={`translate(${W - 14} 910)`}>
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
          {/* El leviatán: una silueta enorme que pasa despacio, apenas más negra que el agua. */}
          <g className="bz-leviathan" opacity="0.55">
            <path d="M-260 0 Q-140 -70 40 -52 Q120 -90 190 -40 Q300 -60 340 -10 Q250 20 150 22 Q40 70 -90 40 Q-190 70 -260 0 Z M340 -10 L420 -60 L410 0 L430 56 Z" fill="#010410" />
          </g>
          {/* Nieve marina: restos que caen despacio en la oscuridad. */}
          {Array.from({ length: 22 }, (_, i) => (
            <circle key={i} className="bz-snow" style={{ '--i': i }} cx={30 + ((i * 97) % 540)} cy={260 + ((i * 211) % 1000)} r={1.6 + (i % 3) * 0.7} fill="#cfe8ff" />
          ))}
          <School y={370} color="#8fe3ff" dur={12} n={4} />
          {/* Medusas que brillan. */}
          {[
            [150, 530],
            [450, 770],
            [200, 1030],
            [430, 1250],
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
      {/* Marcas de profundidad: una raya cada 5 m (los números están en la regla de la izquierda). */}
      {Array.from({ length: MAX_M / 5 }, (_, i) => {
        const m = (i + 1) * 5
        const y = yOf(m)
        const len = m % 10 === 0 ? 54 : 30
        return (
          <g key={m} className={`bz-mark ${m % 10 === 0 ? 'is-ten' : ''}`}>
            <line x1="0" x2={len} y1={y} y2={y} />
            <line x1={W} x2={W - len} y1={y} y2={y} />
          </g>
        )
      })}
    </g>
  )
}

// El mar entero, con la cámara siguiendo al buzo (a la profundidad `depth`, en metros), la linterna en el Abismo y,
// encima, lo que enseña la tensión: la luz que vuelve al subir y la visión en túnel cuando falta el aire.
function Sea({ zone, depth, state, shark, moving, tense, leak, beat, relief }) {
  const dx = W / 2 + Math.sin(depth * 0.35) * 40
  const dy = yOf(depth)
  const face = state === 'up' ? 1 : -1
  const [c0, c1, c2, c3] = WATER[zone]
  const dark = zone === 'abismo' ? Math.min(0.88, 0.25 + depth * 0.018) : zone === 'arrecife' ? Math.min(0.45, depth * 0.011) : Math.min(0.25, depth * 0.006)
  const sy = yOf(SAFE_M)
  return (
    <div
      className={`bz-window ${moving ? 'is-moving' : ''}`}
      style={{ '--dy': dy, '--dx': dx, '--w': W, '--h': H, '--t': tense.toFixed(3), '--beat': `${BEAT_MS[beat] || 1000}ms`, '--relief': relief.toFixed(3), filter: tense > 0.02 ? `saturate(${(1 - tense * 0.75).toFixed(3)})` : undefined }}
    >
      <svg className="bz-world" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="bz-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c0} />
            <stop offset="0.25" stopColor={c1} />
            <stop offset="0.6" stopColor={c2} />
            <stop offset="1" stopColor={c3} />
          </linearGradient>
          <linearGradient id="bz-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a2a6e" />
            <stop offset="0.45" stopColor="#ff4f8b" />
            <stop offset="0.8" stopColor="#ff8a4c" />
            <stop offset="1" stopColor="#ffe36e" />
          </linearGradient>
          <linearGradient id="bz-ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bz-nogo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff2a4a" stopOpacity="0.32" />
            <stop offset="1" stopColor="#ff2a4a" stopOpacity="0.08" />
          </linearGradient>
          <pattern id="bz-hatch" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="26" height="26" fill="url(#bz-nogo)" />
            <rect width="9" height="26" fill="#ff2a4a" fillOpacity="0.22" />
          </pattern>
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
        {/* El cielo del atardecer de las islas: sol a medio hundirse, el Teide de fondo y un velero. */}
        <rect width={W} height={WATERLINE} fill="url(#bz-sky)" />
        <circle cx="470" cy={WATERLINE - 4} r="30" fill="#fff2a8" />
        <circle cx="470" cy={WATERLINE - 4} r="46" fill="#ffe36e" opacity="0.28" />
        <path d={`M-10 ${WATERLINE} L70 ${WATERLINE - 14} L140 ${WATERLINE - 44} L176 ${WATERLINE - 52} L196 ${WATERLINE - 44} L250 ${WATERLINE - 12} L300 ${WATERLINE} Z`} fill="#3a1a4a" opacity="0.9" />
        <path d={`M300 ${WATERLINE} L340 ${WATERLINE - 10} L380 ${WATERLINE} Z`} fill="#4a1e4a" opacity="0.8" />
        <g transform={`translate(380 ${WATERLINE - 36})`}>
          <path d="M0 14 L74 14 L62 30 L12 30 Z" fill="#c9824a" stroke="#5a2a10" strokeWidth="3" strokeLinejoin="round" />
          <path d="M34 14 V-24 L58 8 Z" fill="#fff6e8" stroke="#5a2a10" strokeWidth="2" />
        </g>
        <path className="bz-surface" d={`M-20 ${WATERLINE} Q0 ${WATERLINE - 8} 20 ${WATERLINE} T60 ${WATERLINE} T100 ${WATERLINE} T140 ${WATERLINE} T180 ${WATERLINE} T220 ${WATERLINE} T260 ${WATERLINE} T300 ${WATERLINE} T340 ${WATERLINE} T380 ${WATERLINE} T420 ${WATERLINE} T460 ${WATERLINE} T500 ${WATERLINE} T540 ${WATERLINE} T580 ${WATERLINE} T620 ${WATERLINE} V${WATERLINE + 10} H-20 Z`} fill="#c8f6ff" opacity="0.8" />
        <Scenery zone={zone} />
        {shark !== null && <Shark y={yOf(shark)} from="r" />}
        <Diver x={dx} y={dy} face={face} state={state} leak={leak} />
        <rect className="bz-dark" width={W} height={H} fill="#01030c" opacity={dark} mask="url(#bz-dark)" />
        {zone === 'abismo' && depth > 0 && <circle r="130" fill="url(#bz-glow)" transform={`translate(${dx - 40} ${dy})`} />}
        {zone === 'abismo' && (
          <g>
            <Eyes x={52} y={yOf(12)} i={0} />
            <Eyes x={W - 58} y={yOf(19)} size={1.3} i={1} />
            <Eyes x={46} y={yOf(27)} size={1.1} i={2} />
            <Eyes x={W - 50} y={yOf(33)} size={1.6} i={3} />
            <Eyes x={W / 2 - 60} y={yOf(MAX_M) + 20} size={2.6} i={4} />
          </g>
        )}
        {/* El límite del aire, que se ve incluso a oscuras: más abajo de esta raya ya no te da el aire para volver. */}
        <g className="bz-limit">
          <rect x="0" y={sy} width={W} height={H - sy} fill="url(#bz-hatch)" />
          <line x1="0" x2={W} y1={sy} y2={sy} />
          <text x={W / 2} y={sy - 12} textAnchor="middle">
            LÍMITE DEL AIRE · {fmtM(SAFE_M)}
          </text>
          <text className="bz-limit__sub" x={W / 2} y={sy + 28} textAnchor="middle">
            Más abajo ya no vuelves
          </text>
        </g>
      </svg>
      {/* La luz que vuelve al subir. */}
      <div className="bz-relief" aria-hidden="true" />
      {/* Visión en túnel y bordes que laten al quedarse sin margen. */}
      <div className="bz-tunnel" aria-hidden="true" />
      {beat > 0 && <div key={beat} className="bz-pulse" aria-hidden="true" />}
      <div className="bz-gauge" style={{ '--p': depth / MAX_M }} aria-hidden="true">
        <span className="bz-gauge__fill" />
        {[10, 20, 30].map((m) => (
          <em key={m} style={{ '--s': m / MAX_M }}>
            {m}
          </em>
        ))}
        <span className="bz-gauge__safe" style={{ '--s': SAFE_M / MAX_M }} />
        <b>{fmtM(depth)}</b>
      </div>
    </div>
  )
}

// Los pulmones: el aire que queda (de abajo arriba) y, con una raya blanca, el que hace falta para volver desde donde
// estás. Lo que queda por debajo de la raya es la reserva para subir; lo de encima es el margen para seguir bajando. Si
// el aire cae por debajo de la raya, ya no llegas y todo se pone rojo.
const LUNG_H = 104
const LUNGS = 'M44 40 Q10 34 8 80 Q8 108 30 108 Q44 108 44 92 Z M56 40 Q90 34 92 80 Q92 108 70 108 Q56 108 56 92 Z'
function Lungs({ left, need, margin, live, warn }) {
  const yAir = LUNG_H - Math.min(1, Math.max(0, left / AIR_MS)) * LUNG_H
  const yNeed = LUNG_H - Math.min(1, Math.max(0, need / AIR_MS)) * LUNG_H
  const doomed = live && margin < 0
  const secs = Math.max(0, Math.floor(margin / 1000))
  return (
    <div className={`bz-lungs ${warn ? 'is-low' : ''} ${doomed ? 'is-doomed' : ''} ${live ? 'is-live' : ''}`} role="img" aria-label={`Aire: ${Math.max(0, Math.ceil(left / 1000))} segundos; margen: ${secs} segundos`}>
      <small>{live ? 'Margen' : 'Aire'}</small>
      <b>{doomed ? '¡Sin aire!' : `${live ? secs : Math.round(AIR_MS / 1000)} s`}</b>
      <svg viewBox="0 0 100 114" aria-hidden="true">
        <defs>
          <clipPath id="bz-lung-shape">
            <path d={LUNGS} />
          </clipPath>
          <linearGradient id="bz-lung-air" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c8f6ff" />
            <stop offset="1" stopColor="#2ee6d0" />
          </linearGradient>
        </defs>
        <path d="M50 0 V44 M50 30 Q40 38 30 48 M50 30 Q60 38 70 48" fill="none" stroke="#dff4ff" strokeWidth="5" strokeLinecap="round" />
        <path d={LUNGS} fill="rgba(255,255,255,0.1)" />
        <g clipPath="url(#bz-lung-shape)">
          <rect className="bz-lungs__air" x="0" width="100" style={{ y: `${yAir}px`, height: `${LUNG_H + 10 - yAir}px` }} fill="url(#bz-lung-air)" />
          {/* La reserva para volver: de la raya hacia abajo (o todo el aire, en rojo, si ya no llega). */}
          <rect className={`bz-lungs__reserve ${doomed ? 'is-doomed' : ''}`} x="0" width="100" style={{ y: `${doomed ? yAir : yNeed}px`, height: `${LUNG_H + 10 - (doomed ? yAir : yNeed)}px` }} />
        </g>
        <path d={LUNGS} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="3" strokeLinejoin="round" />
        {live && (
          <g className="bz-lungs__need">
            <line x1="0" x2="100" y1={yNeed} y2={yNeed} />
            <path d={`M-2 ${yNeed - 6} L8 ${yNeed} L-2 ${yNeed + 6} Z`} />
            <path d={`M102 ${yNeed - 6} L92 ${yNeed} L102 ${yNeed + 6} Z`} />
          </g>
        )}
      </svg>
      <small>{live ? 'raya = aire para volver' : 'a pulmón lleno'}</small>
    </div>
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
  const [gulp, setGulp] = useState(null) // la ronda cuya bocanada de la superficie se está enseñando
  const [, setFrame] = useState(0)
  const skew = useRef(0)
  const held = useRef(false) // el dedo (o la tecla) sigue apretado
  const sent = useRef(false) // ya se mandó el «up» de esta inmersión
  const passed = useRef(0) // decenas de metros por las que ya has pasado (para el sonido)
  const prizeTimer = useRef(0) // el temporizador que enseña el premio tras la bocanada
  const landedRound = useRef(null) // la inmersión cuyo resultado ya se enseñó
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !run && (!rise || rise.done) && gulp === null) setBalance(serverBalance)
  }, [serverBalance, asking, run, rise, gulp])
  const shownBank = useCountUp(balance)
  useEffect(() => () => clearTimeout(prizeTimer.current), [])
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
    const credit = () => setBalance((b) => b + (result.net > 0 ? result.payout : 0) + (abuse?.extra ?? 0))
    if (abuse) setBank({ round: result.round, ...abuse })
    if (result.lost) credit()
    if (result.lost === 'air') {
      playGasp()
      setTimeout(playLose, 300)
      buzz([40, 40, 160])
    } else if (!result.lost) {
      // Primero la bocanada de aire al salir a la superficie y, un instante después, el premio.
      playSplash()
      setTimeout(playSurfaceGasp, 120)
      buzz([30, 30, 60])
      setGulp(result.round)
      prizeTimer.current = setTimeout(() => {
        setGulp(null)
        credit()
        playCash(Math.min(10, Math.round(result.mult)))
        playWin(result.mult >= 10)
        buzz([60, 40, 80])
        setBurst({ id: result.round, amount: result.net + (abuse?.extra ?? 0), mult: result.mult, depth: result.depth, extra: abuse?.extra ?? 0 })
      }, GULP_MS)
    }
    setRise((r) => (r ? { ...r, done: true } : r))
  })

  async function start() {
    if (run || (rise && !rise.done) || asking || !ready) return
    const amount = clampBet(bet, maxBetFor(balance))
    if (amount > balance) return
    playInhale()
    clearTimeout(prizeTimer.current)
    setGulp(null)
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
  // Burbujas al pasar cada diez metros.
  useEffect(() => {
    const n = Math.floor(reached / 10)
    if (run && n > passed.current) {
      passed.current = n
      playBubbles()
    }
  })

  const live = Boolean(run) || Boolean(rise && !rise.done)
  const airLeft = live ? AIR_MS - downMs - upElapsed : AIR_MS
  const need = live ? upMs(depth) : 0
  const margin = airLeft - need // lo que sobra de aire después de reservar lo que cuesta volver (negativo: ya no llegas)
  const warn = Boolean(run) && margin < WARN_MS
  // La tensión (de 0 a 1): crece según se acaba el margen. Al subir con margen se alivia a medida que sales; si ya no
  // llegas, no se alivia nunca. Con un tiburón no hay tensión de aire.
  let tense = 0
  if (live && rise?.result.lost !== 'shark') {
    const raw = Math.min(1, Math.max(0, 1 - margin / TENSE_MS))
    if (run && !sent.current) tense = raw
    else tense = margin < 0 ? 1 : raw * Math.min(1, depth / 10)
  }
  const beat = tense < 0.2 ? 0 : tense < 0.5 ? 1 : tense < 0.8 ? 2 : 3
  const leak = tense > 0.8 ? 3 : tense > 0.55 ? 2 : tense > 0.3 ? 1 : 0
  const relief = state === 'up' && !rise?.result.lost ? Math.min(1, Math.max(0, 1 - depth / 18)) : 0
  const asc = Boolean(rise && !rise.done) || (Boolean(run) && sent.current)
  // El latido: suena al ritmo del que se ve en los bordes, y se reinicia con cada cambio de nivel.
  useEffect(() => {
    if (!beat) return
    playPulse(beat)
    const id = setInterval(() => playPulse(beat), BEAT_MS[beat])
    return () => clearInterval(id)
  }, [beat])
  const shownBet = run ? run.bet : rise ? rise.result.stake : clampBet(bet, maxBetFor(balance))
  const mult = multAt(shownZone, run ? depth : reached)
  // Lo que cobrarías: soltando ahora (bajando) o llegando arriba (subiendo, si no te quedas sin aire ni te pilla el tiburón).
  const worth = run ? payout(run.bet, mult) : rise && !rise.result.lost ? rise.result.payout : 0
  const maxBet = maxBetFor(balance)
  const locked = Boolean(run) || (rise && !rise.done) || asking
  const result = rise?.done ? rise.result : null

  let status = 'Elige la zona y la apuesta. Mantén pulsado para bajar aguantando la respiración y suelta para subir.'
  let tone = ''
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Respira hondo…'
  else if (run && !sent.current) status = warn ? '¡Sube ya! Te queda el aire justo para volver.' : `Aguantando a ${fmtM(depth)}. Si sueltas ahora, cobras ${eur(worth)} (${fmtMult(mult)}).`
  else if (run) status = 'Subiendo…'
  else if (gulp !== null) status = '¡Respiras!'
  else if (rise && !rise.done) status = rise.result.lost === 'shark' ? '¡Un tiburón!' : rise.result.lost === 'air' ? 'Subiendo… ¡se acaba el aire!' : `Subiendo desde ${fmtM(rise.from)}…`
  else if (result && result.net > 0) {
    status = `¡Respiras! Subiste desde ${fmtM(result.depth)}. ${fmtMult(result.mult)}: ganaste ${eur(result.net + (bank?.round === result.round ? bank.extra : 0))}.`
    tone = 'good'
  } else if (result && bank?.round === result.round && bank.extra > 0) status = `¡Te pilló el mar! Pero el Admin Abuse te devuelve ${eur(bank.extra)}.`
  else if (result) {
    status = result.lost === 'shark' ? `Un tiburón te pilló a ${fmtM(result.depth)}. Perdiste ${eur(result.stake)}.` : `Se te acabó el aire subiendo, a ${fmtM(result.lostAt)}. Perdiste ${eur(result.stake)}.`
    tone = 'bad'
  } else if (balance < MIN_BET) status = 'Te quedaste sin saldo esta semana. El domingo a las 23:59 vuelves a empezar.'

  return (
    <main className="app ar-app bz-app">
      <header className="top">
        <h1>Apnea</h1>
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
            <Help className="tg tg--help" title="Cómo se juega a la Apnea">
              <p>
                <b>Mantén pulsado</b> (la barra espaciadora o el botón) para bajar aguantando la respiración y <b>suelta</b> para subir.
                Cuanto más hondo llegues, más cobras al volver a la superficie: el premio sube con cada metro.
              </p>
              <p>
                <b>El tiburón:</b> al tirarte, el servidor decide en secreto a qué profundidad aparece. Si llegas hasta él bajando, te pilla y pierdes
                la apuesta. Nadie sabe dónde está: unas veces aparece enseguida y otras ni aparece.
              </p>
              <p>
                <b>El aire:</b> tus pulmones aguantan {AIR_MS / 1000} segundos y se gastan bajando y subiendo, y subir es el doble de lento. La raya
                blanca de los pulmones te dice cuánto aire hace falta para volver desde donde estás, y el margen son los segundos que te sobran:
                si sueltas tan abajo que no te llega, te ahogas por el camino. A medida que el margen se acaba, la vista se cierra y el corazón se
                acelera. Bajando sin parar, el límite está en unos {fmtM(SAFE_M)}.
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
        <section className={`bz-stage bz-stage--${shownZone} ${shake ? 'is-shake' : ''} ${tone === 'good' ? 'is-win' : ''} ${warn ? 'is-warn' : ''} ${live ? 'is-live' : ''}`} aria-label="El mar">
          <Sea zone={shownZone} depth={depth} state={state} shark={rise?.result.lost === 'shark' ? rise.result.depth : null} moving={moving} tense={tense} leak={leak} beat={beat} relief={relief} />

          <div className="bz-hud">
            <div className={`bz-read ${warn ? 'is-low' : ''}`}>
              <small>{rise && !rise.done ? 'Subiendo' : 'Profundidad'}</small>
              <b className="bz-read__depth">
                {Math.floor(depth)}
                <i>m</i>
              </b>
              <span className="bz-read__prize">
                <small>{run && !asc ? 'Si sueltas ahora' : rise && !rise.done ? (rise.result.lost ? 'Premio' : 'Si llegas arriba') : 'Premio'}</small>
                <b>{run || (rise && !rise.result.lost) ? eur(worth) : fmtMult(mult)}</b>
                {(run || (rise && !rise.result.lost)) && <em>{fmtMult(mult)}</em>}
              </span>
            </div>
            <Lungs left={airLeft} need={need} margin={margin} live={live} warn={warn} />
          </div>

          {run && !asc && warn && (
            <p className="bz-alert" aria-hidden="true">
              <span>▲</span> ¡Sube ya!
            </p>
          )}
          {gulp !== null && (
            <div key={gulp} className="bz-gulp" aria-hidden="true">
              <b>¡Aire!</b>
              {Array.from({ length: 9 }, (_, i) => (
                <i key={i} style={{ '--i': i }} />
              ))}
            </div>
          )}

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
                  <b>{warn ? '¡Suelta ya!' : 'Suelta para subir'}</b>
                  <small>
                    {eur(worth)} · {fmtM(depth)}
                  </small>
                </>
              ) : (
                <>
                  <b>Mantén para bajar</b>
                  <small>aguanta la respiración · suelta para subir</small>
                </>
              )}
            </span>
            <kbd>Espacio</kbd>
          </button>

          <div className="ar-group">
            <h2>Récord del día</h2>
            {ranking.length === 0 ? (
              <p className="ar-hint">Nadie ha hecho apnea hoy todavía. ¡El primero se pone arriba!</p>
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
