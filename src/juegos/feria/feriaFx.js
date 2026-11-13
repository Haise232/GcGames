// Efectos de la Feria de las Islas: monedas que vuelan, cifras que flotan, confeti, ondas y destellos. Todo es decoración
// encima del estado (nunca lo cambia ni retrasa nada): nodos con pointer-events: none en una capa fija sobre la pantalla,
// animados con la Web Animations API (solo transform y opacity) y que se borran al acabar. Con «reducir movimiento»
// casi todo se queda en nada (solo las cifras, quietas un momento).
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
let reduced = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false
export const reducedMotion = () => reduced

export function useReducedMotion() {
  const [value, setValue] = useState(reduced)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const onChange = () => {
      reduced = mq.matches
      setValue(mq.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return value
}

export const EASE = {
  outBack: 'cubic-bezier(.34,1.56,.64,1)',
  outExpo: 'cubic-bezier(.16,1,.3,1)',
  gravity: 'cubic-bezier(.5,0,.9,.6)',
  bounceUp: 'cubic-bezier(.2,.7,.5,1)',
}

const MAX_NODES = 70
let live = 0

// Centro de un elemento (o de un rectángulo) en coordenadas de la ventana.
function centerOf(target) {
  if (!target) return null
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target
  if (!r || (!r.width && !r.height)) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
}

function node(layer, className, x, y) {
  if (!layer || live >= MAX_NODES) return null
  const el = document.createElement('i')
  el.className = className
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  layer.appendChild(el)
  live++
  return el
}
function drop(el, anim) {
  const done = () => {
    if (el.isConnected) {
      el.remove()
      live--
    }
  }
  if (anim) anim.finished.then(done, done)
  else done()
}

// n monedas de from a to por un arco; onCoin(k) al llegar cada una. kind: 'gold' (ganar) o 'out' (pagar).
export function coinsFly(layer, from, to, n, { onCoin, small = false, kind = 'gold', delay = 0 } = {}) {
  if (reduced) return
  const a = centerOf(from)
  const b = centerOf(to)
  if (!a || !b) return
  for (let k = 0; k < n; k++) {
    const el = node(layer, `fe-coin ${small ? 'is-small' : ''} ${kind === 'out' ? 'is-out' : ''}`, 0, 0)
    if (!el) return
    const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 120
    const my = Math.min(a.y, b.y) - 60 - Math.random() * 60
    const ax = a.x + (Math.random() - 0.5) * a.w * 0.3
    const anim = el.animate(
      [
        { transform: `translate(${ax}px, ${a.y}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${ax}px, ${a.y}px) scale(1)`, opacity: 1, offset: 0.08 },
        { transform: `translate(${mx}px, ${my}px) scale(1.2)`, offset: 0.5 },
        { transform: `translate(${b.x}px, ${b.y}px) scale(.6)`, opacity: 1 },
      ],
      { duration: 700, delay: delay + k * 55, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' },
    )
    anim.finished.then(() => onCoin?.(k), () => {})
    drop(el, anim)
  }
}

// Una cifra o un texto que sube y se desvanece sobre un elemento.
export function floatText(layer, target, text, { color = '#ffd25e', size = 22, delay = 0, dy = 0 } = {}) {
  const c = centerOf(target)
  if (!c) return
  const el = node(layer, 'fe-float', c.x, c.y - c.h * 0.3 + dy)
  if (!el) return
  el.textContent = text
  el.style.color = color
  el.style.fontSize = `${size}px`
  const frames = reduced
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
    : [
        { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -260%) scale(1)', opacity: 0 },
      ]
  drop(el, el.animate(frames, { duration: 1100, delay, easing: 'ease-out', fill: 'backwards' }))
}

// Confeti desde un elemento: papelitos de los colores dados, con gravedad.
export function confetti(layer, target, n, colors) {
  if (reduced) return
  const c = centerOf(target)
  if (!c) return
  for (let i = 0; i < n; i++) {
    const el = node(layer, 'fe-paper', c.x, c.y)
    if (!el) return
    el.style.background = colors[i % colors.length]
    const ang = Math.random() * Math.PI * 2
    const d = 90 + Math.random() * 170
    const dx = Math.cos(ang) * d
    const dy = Math.sin(ang) * d
    drop(
      el,
      el.animate(
        [
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy - 70}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx * 1.1}px, ${dy + 110}px) rotate(900deg)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.4,1)' },
      ),
    )
  }
}

// Onda del color de un asiento que sale de una casilla; con vecinas, un destello que se propaga a las de al lado.
export function wave(layer, target, color, { big = true } = {}) {
  const c = centerOf(target)
  if (!c) return
  const el = node(layer, 'fe-wave', c.x, c.y)
  if (!el) return
  el.style.background = color
  if (reduced) return drop(el, el.animate([{ opacity: 0.3 }, { opacity: 0 }], { duration: 150 }))
  drop(
    el,
    el.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: big ? 0.6 : 0.4 }, { transform: `translate(-50%,-50%) scale(${big ? 9 : 5})`, opacity: 0 }], {
      duration: big ? 650 : 450,
      easing: 'ease-out',
    }),
  )
}

// Un elemento se infla y vuelve (casilla comprada, contador que cobra…).
export function pop(el, { scale = 1.25, duration = 450, delay = 0 } = {}) {
  if (!el || reduced) return
  el.animate([{ scale: '1' }, { scale: String(scale), offset: 0.3 }, { scale: '.96', offset: 0.65 }, { scale: '1' }], { duration, delay, easing: EASE.outBack })
}
export function flash(el, { delay = 0, strength = 1.6, duration = 400 } = {}) {
  if (!el || reduced) return
  el.animate([{ filter: `brightness(${strength})` }, { filter: 'brightness(1)' }], { duration, delay })
}
export function shake(el, { px = 4, cycles = 3, duration = 360 } = {}) {
  if (!el || reduced) return
  const frames = [{ translate: '0 0' }]
  for (let i = 0; i < cycles; i++) frames.push({ translate: `${px}px 0` }, { translate: `${-px}px 0` })
  frames.push({ translate: '0 0' })
  el.animate(frames, { duration })
}
export function tremble(el) {
  if (!el || reduced) return
  el.animate([{ translate: '0 0' }, { translate: '0 5px' }, { translate: '0 -4px' }, { translate: '0 2px' }, { translate: '0 0' }], { duration: 240 })
}
// Pulso de aterrizaje: la casilla destino se ilumina un momento.
export function landPulse(el, { mine = true } = {}) {
  if (!el || reduced) return
  el.animate(
    mine
      ? [
          { scale: '1', boxShadow: '0 0 0 0 rgba(255,227,138,0)' },
          { scale: '1.14', boxShadow: '0 0 28px 8px rgba(255,227,138,.75)', offset: 0.3 },
          { scale: '1', boxShadow: '0 0 0 0 rgba(255,227,138,0)' },
        ]
      : [{ scale: '1' }, { scale: '1.05', offset: 0.4 }, { scale: '1' }],
    { duration: mine ? 700 : 300, easing: EASE.outExpo },
  )
}

// Anillos dorados que se abren (nivel 3) y chispas.
export function rings(layer, target, color = '#ffd25e', n = 2) {
  if (reduced) return
  const c = centerOf(target)
  if (!c) return
  for (let i = 0; i < n; i++) {
    const el = node(layer, 'fe-ring', c.x, c.y)
    if (!el) return
    el.style.borderColor = color
    el.style.width = el.style.height = `${Math.max(c.w, c.h)}px`
    drop(el, el.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.8 }, { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }], { duration: 600, delay: i * 200, easing: 'ease-out', fill: 'backwards' }))
  }
}
export function sparks(layer, target, n = 12, color = '#ffe38a') {
  if (reduced) return
  const c = centerOf(target)
  if (!c) return
  for (let i = 0; i < n; i++) {
    const el = node(layer, 'fe-spark', c.x, c.y)
    if (!el) return
    el.style.background = color
    const ang = (i / n) * Math.PI * 2
    const d = Math.max(c.w, c.h) * (0.7 + Math.random() * 0.5)
    drop(el, el.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d}px)) scale(.3)`, opacity: 0 }], { duration: 650, easing: EASE.outExpo }))
  }
}

// Una pieza (chapa de nivel, sello pequeño) que cae sobre una casilla y se queda un momento.
export function badge(layer, target, text, color, { size = 18 } = {}) {
  const c = centerOf(target)
  if (!c) return
  const el = node(layer, 'fe-badge', c.x, c.y)
  if (!el) return
  el.textContent = text
  el.style.setProperty('--c', color)
  el.style.fontSize = `${size}px`
  const frames = reduced
    ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
    : [
        { transform: 'translate(-50%,-50%) scale(2.5) rotate(-20deg)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(-10deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(-10deg)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%,-70%) scale(.9) rotate(-10deg)', opacity: 0 },
      ]
  drop(el, el.animate(frames, { duration: 1200, easing: EASE.gravity }))
}

// Un cartel que aparece encima de un rectángulo (isla completa) o arriba del tablero (aviso de otro).
// title y sub van como texto (nunca como HTML: llevan nombres de jugadores).
export function banner(layer, target, title, sub, color, { duration = 1700, small = false } = {}) {
  const c = centerOf(target)
  if (!c) return
  const el = node(layer, `fe-banner ${small ? 'is-small' : ''}`, c.x, c.y)
  if (!el) return
  const t = document.createElement('span')
  t.textContent = title
  el.appendChild(t)
  if (sub) {
    const s = document.createElement('small')
    s.textContent = sub
    el.appendChild(s)
  }
  el.style.setProperty('--c', color)
  const frames = reduced
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }]
    : [
        { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.88 },
        { transform: 'translate(-50%,-60%) scale(.95)', opacity: 0 },
      ]
  drop(el, el.animate(frames, { duration, easing: EASE.outBack }))
}

// Cordón de luces que une varias casillas (isla completa): una línea de puntos que se dibuja y se queda un rato.
export function cord(layer, targets, color) {
  if (reduced) return
  const pts = targets.map(centerOf).filter(Boolean)
  if (pts.length < 2 || !layer || live >= MAX_NODES) return
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', 'fe-cord')
  svg.setAttribute('width', String(window.innerWidth))
  svg.setAttribute('height', String(window.innerHeight))
  const path = document.createElementNS(ns, 'polyline')
  path.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '))
  path.setAttribute('stroke', color)
  svg.appendChild(path)
  layer.appendChild(svg)
  live++
  const len = pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0)
  path.style.strokeDasharray = `2 10`
  const anim = path.animate([{ strokeDashoffset: `${len}`, opacity: 0 }, { strokeDashoffset: '0', opacity: 1, offset: 0.35 }, { strokeDashoffset: '-24', opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 1800, easing: 'ease-out' })
  drop(svg, anim)
}
