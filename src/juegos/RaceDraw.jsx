// Sorteo del circuito al empezar cada ronda: una tira de tarjetas que gira, frena y se para en el circuito de esta carrera.
// No decide nada: el circuito sale de race.circuitOf(round) y la animación va con el reloj del servidor, así que quien entra
// a mitad del sorteo lo ve en el mismo punto que los demás. Tapa solo la pista: las apuestas siguen abiertas debajo.
import { useEffect, useMemo, useRef } from 'react'
import { CIRCUITS, DRAW_MS } from './race.js'
import { OUTLINE_BOX, outlineOf } from './raceArt.js'
import { playReelTick, playReveal } from './sound.js'

const SPIN_FROM = 350 // la pista se repinta con el circuito nuevo justo al empezar: la tira espera a que pase ese tirón
const SPIN_MS = 2700 // giro hasta pararse
const LOOPS = 4 // vueltas completas de la tira antes de llegar al elegido
const ease = (x) => 1 - (1 - x) ** 4

const shapes = CIRCUITS.map((_, i) => outlineOf(i))

// Bandera de cuadros al final de una recta de aceleración.
function Checker({ x, y }) {
  const cells = []
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) if ((r + c) % 2 === 0) cells.push(<rect key={`${r}-${c}`} x={x + c * 40} y={y + r * 40} width="40" height="40" />)
  return (
    <g className="race-draw__checker">
      <rect x={x} y={y} width="120" height="240" fill="#f6f6f1" />
      {cells}
    </g>
  )
}

function Card({ i, refFn }) {
  const c = CIRCUITS[i]
  return (
    <div className="race-draw__card" ref={refFn} style={{ '--c': c.color }}>
      <svg viewBox={`0 0 ${OUTLINE_BOX[0]} ${OUTLINE_BOX[1]}`} aria-hidden="true">
        <path d={shapes[i]} className="race-draw__glow" />
        <path d={shapes[i]} className="race-draw__road" />
        {c.drag && <Checker x={OUTLINE_BOX[0] - 260} y={OUTLINE_BOX[1] / 2 - 120} />}
      </svg>
      <b>{c.name}</b>
      <small>{c.tag}</small>
    </div>
  )
}

export default function RaceDraw({ circuit, getNow, startAt, muted, reduced }) {
  const box = useRef(null)
  const strip = useRef(null)
  const cards = useRef([])
  const n = CIRCUITS.length
  // La tira: varias vueltas a todos los circuitos y, al final, el elegido (la última tarjeta).
  const list = useMemo(() => {
    const out = []
    const first = (circuit + 1) % n
    for (let k = 0; k < LOOPS * n; k++) out.push((first + k) % n)
    out.push(circuit)
    return out
  }, [circuit, n])

  useEffect(() => {
    let raf = 0
    let lastCard = null
    let revealed = false
    const target = list.length - 1
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const el = box.current
      if (!el) return
      const e = getNow() - startAt
      const w = el.clientWidth
      const cw = Math.min(260, Math.max(140, w * (w < 480 ? 0.5 : 0.3)))
      const pos = reduced ? target : target * ease(Math.min(1, Math.max(0, e - SPIN_FROM) / SPIN_MS))
      strip.current.style.transform = `translate3d(${w / 2 - cw / 2 - pos * cw}px, -50%, 0)`
      cards.current.forEach((card, k) => {
        if (!card) return
        const d = Math.min(1.5, Math.abs(k - pos))
        card.style.width = `${cw}px`
        card.style.transform = `scale(${1 - 0.22 * Math.min(1, d)})`
        card.style.opacity = String(1 - 0.45 * Math.min(1, d))
      })
      const landed = e >= SPIN_FROM + SPIN_MS
      el.classList.toggle('is-landed', landed)
      el.classList.toggle('is-out', e >= DRAW_MS - 500)
      const at = Math.round(pos)
      if (!landed && at !== lastCard) {
        if (lastCard !== null && !muted && !reduced) playReelTick()
        lastCard = at
      }
      if (landed && !revealed) {
        revealed = true
        // Solo suena si se ha visto llegar (no al entrar con el sorteo ya acabado).
        if (!muted && e < SPIN_FROM + SPIN_MS + 400) playReveal()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [list, getNow, startAt, muted, reduced])

  const c = CIRCUITS[circuit]
  return (
    <div className="race-draw" ref={box} style={{ '--c': c.color }} aria-hidden="true">
      <p className="race-draw__head">Sorteo del circuito</p>
      <div className="race-draw__window">
        <div className="race-draw__strip" ref={strip}>
          {list.map((i, k) => (
            <Card key={k} i={i} refFn={(el) => (cards.current[k] = el)} />
          ))}
        </div>
        <i className="race-draw__pointer" />
      </div>
      <p className="race-draw__name">
        <span>Esta carrera:</span> <b>{c.name}</b>
      </p>
    </div>
  )
}
