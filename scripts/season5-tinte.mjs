// Genera src/juegos/season5/s5-tinte.css: Juegos con la Season 4 (Islas) pasado a los colores de la Season 5 (Navidad).
//
// Lee las hojas de la S4 y las de cada juego (lista SHEETS) y, de cada regla, copia solo las propiedades de color (fondos, bordes, sombras, texto,
// relleno de SVG y variables) con cada color cambiado por navidadCss() (src/juegos/season5/tinte.js). Además pinta de
// Navidad las ilustraciones SVG decorativas (portada, escenas de las tarjetas, playas de las mesas…) con reglas por
// atributo: [fill="#ff6b5a" i] { fill: … }.
//
// Especificidad: a cada selector se le añade solo .s5 después de .juegos-root (y :where(:not(.halloween)), que no
// suma), así todas las reglas suben lo mismo (+1 clase) y entre ellas se mantiene el orden de la S4, pero ganan a la
// S4. Con .halloween encendido no se aplican y manda el tema de Halloween como antes.
//
// Uso: node scripts/season5-tinte.mjs (después de cambiar cualquier hoja de season4/ o tinte.js).
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { navidadCss, nocheHex } from '../src/juegos/season5/tinte.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const JUEGOS = join(ROOT, 'src/juegos')
const OUT = join(ROOT, 'src/juegos/season5/s5-tinte.css')
// Primero las hojas de cada juego (sus paletas propias, como el neón del Plinko) y después las de la S4, en el orden en
// que se cargan, para que entre las reglas generadas se mantenga quién gana a quién.
// Fuera a propósito: el gacha y el ajedrez (el color distingue rarezas y piezas), la Carrera, la Pesca y Pez
// Gordo (colores de cada coche, barco o jugador que también pinta el <canvas>/SVG del juego y deben seguir casando) y
// las hojas base de estilos/ (index.css es generado; la paleta base ya la cambian las variables de la S4).
const SHEETS = [
  'roulette/Roulette.css',
  'crash/Crash.css',
  'plinko/Plinko.css',
  'frog/Frog.css',
  'tower/Tower.css',
  'heist/Heist.css',
  'auction/Auction.css',
  'hilo/Hilo.css',
  'bingo/Bingo.css',
  'elevator/Elevator.css',
  'elevator/ElevatorView.css',
  'inmo/Inmobiliaria.css',
  'suiza/Suiza.css',
  'table/table.css',
  'table/Blackjack.css',
  'table/blackjack-ui.css',
  'table/chat.css',
  'poker/poker.css',
  'poker/poker-ui.css',
  'banca/banca.css',
  'banca/hacienda.css',
  'banca/banca-panel.css',
  'hub/Lobby.css',
  'hub/hub.css',
  'hub/score.css',
  'estilos/scenes.css',
  'estilos/chrome.css',
  'season4/season4.css',
  'season4/s4-juegos.css',
  'season4/fiestas.css',
  'season4/blackjack-beach.css',
  'season4/poker-beach.css',
  'season4/plinko-beach.css',
  'season4/score-beach.css',
  'season4/tower-beach.css',
]

// Ilustraciones decorativas que se tiñen por atributo (nunca piezas de juego cuyo color importe para apostar).
const ART_FILES = [
  'src/juegos/season4/IslandScene.jsx',
  'src/juegos/season4/BlackjackBeach.jsx',
  'src/juegos/season4/PokerBeach.jsx',
  'src/juegos/season4/PlinkoBeach.jsx',
  'src/juegos/season4/ScoreBeach.jsx',
  'src/juegos/season4/TowerBeach.jsx',
  'src/juegos/season4/PescaArt.jsx',
  'src/juegos/season4/FishArt.jsx',
  'src/juegos/season4/FiestasArt.jsx',
  'src/juegos/season4/PaseParts.jsx',
  'src/juegos/hub/HubArt.jsx',
]
const ART_SCOPE = ':is(.hub-scene, .is4-scene, .bjb-layer, [class*="pkb__"], .sb-beach__svg, .tw-shore, .tw-city, .tw-bunting, .tw-lantern, .s4-ring, .plinko__beach)'

const PREFIX = '.juegos-root.s5:where(:not(.halloween))'
// Propiedades que pueden llevar color. Se copian de TODAS las reglas, también sin color (como «.x.is-off { background:
// none }» o «color: var(--ink)»): si solo se copiaran las que tienen color, la copia de «.x», con una clase más,
// ganaría a la regla de estado original.
// De los fondos van todas las propiedades (también background-clip, -size…): «background» las reinicia, y sin ellas un
// texto con degradado (background-clip: text) se vería como una caja de color.
const COLOR_PROP =
  /^(--.*|background(-[a-z-]+)?|-webkit-background-clip|color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|box-shadow|fill|stroke|outline(-color)?|text-shadow|filter|stop-color|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|-webkit-text-fill-color|-webkit-text-stroke(-color)?|scrollbar-color)$/

// ---------- Mini lector de CSS: reglas, @media/@supports anidados y @keyframes ----------

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Lee un bloque {...} empezando en «open» (la posición de «{»); devuelve el índice del «}» que lo cierra.
function matchBrace(css, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < css.length; i++) {
    const c = css[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  throw new Error('Llave sin cerrar')
}

function parse(css) {
  const nodes = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const head = css.slice(i, open).trim()
    const close = matchBrace(css, open)
    const body = css.slice(open + 1, close)
    if (head.startsWith('@')) {
      if (/^@(media|supports|container|layer)/.test(head)) nodes.push({ type: 'group', head, children: parse(body) })
      else if (/^@(-webkit-)?keyframes/.test(head)) nodes.push({ type: 'keyframes', name: head.split(/\s+/)[1], body })
      // @font-face, @property…: fuera
    } else if (head) nodes.push({ type: 'rule', sel: head, body })
    i = close + 1
  }
  return nodes
}

// Separa declaraciones por «;» sin romper url(data:…;…) ni cadenas.
function declarations(body) {
  const out = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ';' && depth === 0) {
      out.push(body.slice(start, i))
      start = i + 1
    }
  }
  out.push(body.slice(start))
  return out
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const colon = d.indexOf(':')
      return { prop: d.slice(0, colon).trim(), value: d.slice(colon + 1).trim() }
    })
}

// Separa selectores por comas de primer nivel.
function selectors(sel) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === '(') depth++
    else if (sel[i] === ')') depth--
    else if (sel[i] === ',' && depth === 0) {
      out.push(sel.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(sel.slice(start).trim())
  return out
}

function scopeSelector(sel) {
  // Lo que solo vale fuera de la S4 o con Halloween no se toca.
  if (/:not\(\.s4\)/.test(sel) || /\.halloween(?![^(]*\))/.test(sel.replace(/:not\(\.halloween\)/g, ''))) return null
  if (!sel.startsWith('.juegos-root')) return null
  return PREFIX + sel.slice('.juegos-root'.length)
}

// ---------- Generación ----------


function emit(nodes, indent = '') {
  let out = ''
  for (const n of nodes) {
    if (n.type === 'group') {
      const inner = emit(n.children, indent + '  ')
      if (inner.trim()) out += `${indent}${n.head} {\n${inner}${indent}}\n`
    } else if (n.type === 'keyframes') {
      // Los @keyframes se quedan como están: copiarlos con otro nombre obligaría a copiar también «animation», y eso
      // pisaría las reglas de estado que la paran o la cambian.
      continue
    } else {
      const keep = declarations(n.body).filter((d) => COLOR_PROP.test(d.prop))
      if (!keep.length) continue
      const sels = selectors(n.sel).map(scopeSelector).filter(Boolean)
      if (!sels.length) continue
      const body = keep.map((d) => `${indent}  ${d.prop}: ${navidadCss(d.value)};`).join('\n')
      out += `${indent}${sels.join(',\n' + indent)} {\n${body}\n${indent}}\n`
    }
  }
  return out
}

let css = `/* GENERADO por scripts/season5-tinte.mjs: no editar aquí (se pisa al volver a generarlo).
   Season 5 · Navidad: las hojas de cada juego y de la Season 4 (Islas) con los colores de Navidad (src/juegos/season5/tinte.js).
   Lo hecho a mano de la S5 está en season5.css, que se carga después. */\n\n`

const sheets = SHEETS.map((f) => ({ f, nodes: parse(stripComments(readFileSync(join(JUEGOS, f), 'utf8'))) }))
for (const { f, nodes } of sheets) css += `/* ===== ${f} ===== */\n${emit(nodes)}\n`

// Ilustraciones: un color de atributo → su color de Navidad.
const attrs = { fill: new Set(), stroke: new Set(), 'stop-color': new Set() }
for (const f of ART_FILES) {
  const src = readFileSync(join(ROOT, f), 'utf8')
  for (const [, attr, color] of src.matchAll(/\b(fill|stroke|stopColor)="(#[0-9a-fA-F]{3,8})"/g)) {
    attrs[attr === 'stopColor' ? 'stop-color' : attr].add(color.toLowerCase())
  }
}
css += '/* ===== Ilustraciones SVG (atributos fill, stroke y stop-color) ===== */\n'
for (const [attr, set] of Object.entries(attrs)) {
  for (const color of [...set].sort()) {
    const to = navidadCss(color)
    if (to === color) continue
    css += `${PREFIX} ${ART_SCOPE} [${attr}="${color}" i] {\n  ${attr}: ${to};\n}\n`
  }
}

// Los cielos (degradados con «sky» en el id): noche de invierno en vez de atardecer rojo y oro. Van después y con un
// selector más específico, así ganan a la regla general de su color.
const skies = new Set()
for (const f of ART_FILES) {
  const src = readFileSync(join(ROOT, f), 'utf8')
  for (const [, body] of src.matchAll(/<(?:linear|radial)Gradient[^>]*id="[^"]*sky[^"]*"[^>]*>([\s\S]*?)<\/(?:linear|radial)Gradient>/gi)) {
    for (const [, color] of body.matchAll(/stopColor="(#[0-9a-fA-F]{3,8})"/g)) skies.add(color.toLowerCase())
  }
}
css += '/* ===== Cielos de las ilustraciones: noche de invierno ===== */\n'
for (const color of [...skies].sort()) {
  css += `${PREFIX} ${ART_SCOPE} :is(linearGradient, radialGradient)[id*="sky" i] > stop[stop-color="${color}" i] {\n  stop-color: ${nocheHex(color)};\n}\n`
}

writeFileSync(OUT, css)
console.log(`${OUT}: ${css.split('\n').length} líneas`)
