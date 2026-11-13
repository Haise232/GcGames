// El tablero de la Feria de las Islas: un tablero de mesa de feria canaria (marco de pino, casillas de cartón crema con
// la franja de su isla, toldos a rayas y farolillos por nivel) con las 28 casillas en el borde de una rejilla de 8×8 y el
// mar en el centro. Aquí van el dibujo de las casillas (memo: solo cambia con dueños, niveles y resaltes), el arte (SVG
// propio, en cadenas fijas) y la geometría de las fichas (dónde descansan dentro de cada casilla sin tapar el nombre).
import { memo } from 'react'
import { BOARD, ISLANDS, SIZE, TAX, GO_BONUS, cellOf, hasIsland, rentOf } from './feria.js'

// Un color por asiento (8), pensados para leerse sobre el cartón crema; con su tinta para la inicial.
export const SEAT_COLORS = ['#e63946', '#2f6bff', '#f6b300', '#12b5a5', '#8e4dff', '#ff7a1a', '#5fb92d', '#f06bb6']
export const SEAT_INK = ['#fff', '#fff', '#2a1d14', '#fff', '#fff', '#fff', '#2a1d14', '#2a1d14']

// ---------- Arte ----------
// El toldo del puesto: cinco rayas (colores c1/c2), el mostrador con su género y los dos palos.
export function awning(c1, c2) {
  let s = ''
  for (let i = 0; i < 5; i++) {
    const tx = 18 + i * 8.8
    const bx = 6 + i * 13.6
    const col = i % 2 ? c2 : c1
    s += `<polygon points="${tx},6 ${tx + 8.8},6 ${bx + 13.6},26 ${bx},26" fill="${col}" stroke="#2a1d14" stroke-width="1.2" stroke-linejoin="round"/>`
    s += `<circle cx="${bx + 6.8}" cy="26" r="6.8" fill="${col}" stroke="#2a1d14" stroke-width="1.2"/>`
  }
  return `<svg viewBox="0 0 80 56" aria-hidden="true"><rect x="10" y="22" width="3" height="31" fill="#6a4126"/><rect x="67" y="22" width="3" height="31" fill="#6a4126"/><rect x="13" y="38" width="54" height="11" rx="1.5" fill="#8a5a36" stroke="#2a1d14" stroke-width="1.2"/><circle cx="24" cy="35" r="4" fill="#e9a23c" stroke="#2a1d14" stroke-width="1"/><circle cx="34" cy="35.5" r="3.4" fill="#c4432b" stroke="#2a1d14" stroke-width="1"/><circle cx="45" cy="35" r="4" fill="#7ab648" stroke="#2a1d14" stroke-width="1"/><rect x="53" y="30" width="8" height="8" rx="1" fill="#f3e8cf" stroke="#2a1d14" stroke-width="1"/>${s}</svg>`
}
const FREE_AWNING = awning('#efe3c4', '#d1bf92')

// Iconos de las especiales de lado: la papeleta de la Tómbola y la perra agujereada de la Tasa.
const SIDE_ICON = {
  suerte: `<svg viewBox="0 0 80 56" aria-hidden="true"><g transform="rotate(-8 40 28)"><path d="M8 10h64v12a5 5 0 0 0 0 10v14H8V32a5 5 0 0 0 0-10z" fill="#d6452f" stroke="#2a1d14" stroke-width="2" stroke-linejoin="round"/><path d="M52 10v36" stroke="#f3e8cf" stroke-width="2" stroke-dasharray="3 3"/><text x="29" y="36" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-weight="900" font-size="24" fill="#f3e8cf">?</text><text x="62" y="32" text-anchor="middle" font-family="Bricolage Grotesque,sans-serif" font-weight="800" font-size="9" fill="#f3e8cf">Nº</text></g></svg>`,
  tasa: `<svg viewBox="0 0 80 56" aria-hidden="true"><ellipse cx="40" cy="48" rx="26" ry="4" fill="rgba(42,29,20,.2)"/><circle cx="30" cy="26" r="19" fill="#e9b23c" stroke="#2a1d14" stroke-width="2"/><circle cx="30" cy="26" r="13" fill="none" stroke="#b97f10" stroke-width="2"/><rect x="26" y="22" width="8" height="8" fill="#f3e8cf" stroke="#2a1d14" stroke-width="2"/><path d="M52 34h22M52 42h16" stroke="#2a1d14" stroke-width="3" stroke-linecap="round"/><path d="M62 6v14m-6-6 6 7 6-7" fill="none" stroke="#d6452f" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
}
// Las cuatro esquinas: el barco del Muelle, el mostrador de la Tasa, los banderines de la Verbena y el bombo de la Tómbola.
const CORNER_ART = {
  salida: `<svg viewBox="0 0 120 84" aria-hidden="true"><path d="M0 70q15-8 30 0t30 0t30 0t30 0v14H0z" fill="#1b94a6" stroke="#2a1d14" stroke-width="2.4"/><path d="M12 58h84l-10 14H24z" fill="#c4432b" stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round"/><path d="M12 58h84" stroke="#f3e8cf" stroke-width="4"/><path d="M52 8v50" stroke="#2a1d14" stroke-width="3"/><path d="M54 10 90 52H54z" fill="#f3e8cf" stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round"/><path d="M50 18 24 52h26z" fill="#e9b23c" stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round"/><path d="M52 8l12 4-12 4z" fill="#d6452f" stroke="#2a1d14" stroke-width="1.6"/></svg>`,
  tasa: `<svg viewBox="0 0 120 84" aria-hidden="true"><ellipse cx="60" cy="76" rx="42" ry="6" fill="rgba(42,29,20,.22)"/><rect x="26" y="44" width="68" height="28" rx="4" fill="#6a4126" stroke="#2a1d14" stroke-width="2.6"/><path d="M26 56h68" stroke="#2a1d14" stroke-width="2"/><rect x="54" y="52" width="12" height="9" rx="1.5" fill="#e9b23c" stroke="#2a1d14" stroke-width="2"/><rect x="38" y="6" width="44" height="26" rx="3" fill="#f3e8cf" stroke="#2a1d14" stroke-width="2.6"/><path d="M45 15h30M45 22h20" stroke="#2a1d14" stroke-width="2.6" stroke-linecap="round"/><circle cx="82" cy="30" r="13" fill="#d6452f" stroke="#2a1d14" stroke-width="2.6"/><text x="82" y="33" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-weight="900" font-size="7.5" fill="#fff3cf">TASA</text></svg>`,
  verbena: `<svg viewBox="0 0 120 84" aria-hidden="true"><path d="M2 6Q60 36 118 6" fill="none" stroke="#2a1d14" stroke-width="2"/>${[14, 32, 50, 70, 88, 106]
    .map((x, i) => {
      const y = 6 + (1 - ((x - 60) / 58) ** 2) * 21
      const c = ['#d6452f', '#e9b23c', '#1f9d9a', '#c23b82', '#e9b23c', '#3c58b0'][i]
      return `<path d="M${x - 7} ${y} h14 l-7 14z" fill="${c}" stroke="#2a1d14" stroke-width="1.8" stroke-linejoin="round"/>`
    })
    .join(
      '',
    )}<ellipse cx="60" cy="78" rx="30" ry="5" fill="rgba(42,29,20,.22)"/><path d="M36 52q-4 26 24 26t24-26z" fill="#c8793c" stroke="#2a1d14" stroke-width="2.6"/><path d="M40 60h40M42 68h36" stroke="#2a1d14" stroke-width="2" stroke-dasharray="4 3"/><ellipse cx="60" cy="52" rx="24" ry="6" fill="#8a4c20" stroke="#2a1d14" stroke-width="2.6"/><circle cx="48" cy="48" r="6" fill="#e9b23c" stroke="#2a1d14" stroke-width="2"/><circle cx="62" cy="45" r="6.5" fill="#f2c85a" stroke="#2a1d14" stroke-width="2"/><circle cx="74" cy="49" r="5.5" fill="#e9b23c" stroke="#2a1d14" stroke-width="2"/></svg>`,
  suerte: `<svg viewBox="0 0 120 84" aria-hidden="true"><circle cx="60" cy="40" r="30" fill="#d6452f" stroke="#2a1d14" stroke-width="2.8"/><circle cx="60" cy="40" r="22" fill="#f3e8cf" stroke="#2a1d14" stroke-width="2"/><g stroke="#2a1d14" stroke-width="1.8" fill="#e9b23c"><rect x="42" y="30" width="14" height="9" transform="rotate(-18 49 34)"/><rect x="62" y="26" width="14" height="9" transform="rotate(14 69 30)" fill="#1f9d9a"/><rect x="50" y="44" width="14" height="9" transform="rotate(8 57 48)" fill="#c23b82"/><rect x="66" y="42" width="12" height="8" transform="rotate(-22 72 46)"/></g><path d="M24 76h72" stroke="#2a1d14" stroke-width="3"/><path d="M40 68 33 80M80 68l7 12" stroke="#2a1d14" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="40" r="3.5" fill="#2a1d14"/></svg>`,
}
const CORNER = {
  salida: ['Muelle', `Salida · cobras +${GO_BONUS}`, 'is-salida'],
  tasa: ['Tasa', `Pagas ${TAX} al bote`, 'is-tasa'],
  verbena: ['Verbena', 'Te llevas el bote', 'is-verbena'],
  suerte: ['Tómbola', 'Saca una papeleta', 'is-tombola'],
}
// La tinaja del bote (trazos de estilo aborigen) y la escena del logotipo: sol, islas y el roque sobre el mar.
export const JAR = `<svg viewBox="0 0 100 110" aria-hidden="true"><ellipse cx="50" cy="104" rx="30" ry="4.5" fill="rgba(0,0,0,.3)"/><path d="M30 22q-18 20-12 52 4 28 32 28t32-28q6-32-12-52z" fill="#c8793c" stroke="#2a1d14" stroke-width="3"/><path d="M26 44q24 10 48 0M22 62q28 12 56 0" fill="none" stroke="#2a1d14" stroke-width="2.6"/><path d="M30 52l5 6 5-6 5 6 5-6 5 6 5-6 5 6 5-6" fill="none" stroke="#f3e8cf" stroke-width="2.4"/><path d="M28 22q22 8 44 0" fill="#8a4c20" stroke="#2a1d14" stroke-width="3"/><ellipse cx="50" cy="19" rx="23" ry="8" fill="#6a4126" stroke="#2a1d14" stroke-width="3"/><circle cx="40" cy="14" r="7" fill="#e9b23c" stroke="#2a1d14" stroke-width="2.2"/><circle cx="55" cy="11" r="7.5" fill="#f2c85a" stroke="#2a1d14" stroke-width="2.2"/><circle cx="66" cy="16" r="6" fill="#e9b23c" stroke="#2a1d14" stroke-width="2.2"/></svg>`
const SCENE = `<svg class="fe-logo__scene" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="fe-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb35c" stop-opacity="0"/><stop offset="1" stop-color="#ffd98a" stop-opacity=".55"/></linearGradient></defs><rect width="600" height="220" fill="url(#fe-sky)"/><circle cx="300" cy="150" r="82" fill="#ffd36a" opacity=".55"/><circle cx="300" cy="150" r="58" fill="#ffe7a1" opacity=".5"/><path d="M0 170 80 128 112 148 150 118 200 160 210 170Z" fill="#14485a" opacity=".85"/><path d="M600 170 520 112 490 134 460 100 420 150 380 170Z" fill="#14485a" opacity=".85"/><path d="M232 176 240 120 232 104 246 96 252 60 262 64 264 36 292 30 304 44 324 40 330 70 344 78 340 104 352 118 352 176Z" fill="#3a2626" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/><path d="M262 64 270 120M300 44 296 100" stroke="#5a3d38" stroke-width="3" fill="none"/><path d="M0 176q30-10 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0V220H0Z" fill="#1b94a6" opacity=".9"/><path d="M0 196q30-10 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0V220H0Z" fill="#0f6f86"/></svg>`
// Silueta sencilla de una isla (cumbre volcánica sobre el mar) para la cabecera del boleto; cambia un poco por isla.
export function islandShape(k) {
  const peak = 30 + ((k * 37) % 50)
  const h = 18 + ((k * 13) % 14)
  return `<svg viewBox="0 0 160 60" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><path d="M8 52 Q${peak - 30} ${52 - h * 0.6} ${peak - 8} ${52 - h} L${peak} ${52 - h - 10} L${peak + 10} ${52 - h + 2} Q${peak + 50} ${52 - h * 0.7} 152 52Z" fill="rgba(0,0,0,.22)"/><path d="M0 54q20-6 40 0t40 0t40 0t40 0V60H0Z" fill="rgba(255,255,255,.25)"/></svg>`
}

const Art = ({ svg, className }) => <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />

// ---------- Geometría ----------
// El tablero mide 9 anchos de casilla (w) por lado: las esquinas y el fondo de cada casilla miden 1,5 w.
const span = (c) => (c === 1 ? [0, 1.5] : c === 8 ? [7.5, 1.5] : [1.5 + (c - 2), 1])
const DEEP = 0.81 // la parte de fuera de la casilla de lado (donde no está el nombre): ahí descansan las fichas
// Zona de descanso de las fichas en cada casilla, en anchos de casilla. En las de lado, la mitad de fuera (toldo, farolillos
// y precio), nunca la franja ni el nombre; en las esquinas, la franja de abajo (el texto se sube para dejarles sitio).
function region(i) {
  const { r, c, side } = cellOf(i)
  const [x, w] = span(c)
  const [y, h] = span(r)
  if (side === 'b') return { x, y: y + h - DEEP, w, h: DEEP, long: 'x' }
  if (side === 't') return { x, y, w, h: DEEP, long: 'x' }
  if (side === 'l') return { x, y, w: DEEP, h, long: 'y' }
  if (side === 'r') return { x: x + w - DEEP, y, w: DEEP, h, long: 'y' }
  return { x, y: y + h - 0.64, w, h: 0.62, long: 'x', corner: true }
}
// Cuántas por fila (a, a lo largo), cuántas filas (b) y tamaño (s, en anchos de casilla) según cuántas fichas hay.
function grid(n, corner) {
  if (corner) return n <= 4 ? { a: Math.max(1, n), s: 0.32 } : { a: 4, s: 0.27 }
  if (n === 1) return { a: 1, s: 0.42 }
  if (n === 2) return { a: 2, s: 0.36 }
  if (n <= 4) return { a: 2, s: 0.3 }
  if (n <= 6) return { a: 3, s: 0.26 }
  return { a: 4, s: 0.21 }
}
const GAP = 0.04
// Centro de la zona de una casilla: por donde pasan las fichas al andar.
export function anchorOf(i) {
  const z = region(i)
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 }
}
// Dónde descansa la ficha j de las n que hay en la casilla i: { x, y, s } en anchos de casilla.
export function slotOf(i, j, n) {
  const z = region(i)
  const { a, s } = grid(n, z.corner)
  const rows = Math.ceil(n / a)
  const row = Math.floor(j / a)
  const inRow = Math.min(a, n - row * a)
  const along = ((j % a) - (inRow - 1) / 2) * (s + GAP)
  const across = (row - (rows - 1) / 2) * (s + GAP)
  const cx = z.x + z.w / 2
  const cy = z.y + z.h / 2
  return z.long === 'x' ? { x: cx + along, y: cy + across, s } : { x: cx + across, y: cy + along, s }
}
export const TRACK = 9 // anchos de casilla por lado del tablero

// ---------- Casillas ----------
const sideClass = { b: 'is-b', l: 'is-l', t: 'is-t', r: 'is-r', c: 'is-c' }

function label(sq, owner, level, players, me) {
  if (sq.kind !== 'puesto') return sq.name
  const who = owner === undefined ? 'libre' : `de ${owner === me ? 'ti' : (players[owner]?.name ?? '?')}, nivel ${level}`
  return `${sq.name}, ${ISLANDS[sq.island].name}, ${sq.price} perras, ${who}`
}

const Casilla = memo(function Casilla({ sq, owner, level, full, toks, hit, dest, sel, mine, onSel, ariaLabel }) {
  const { r, c, side } = cellOf(sq.i)
  let inner
  if (sq.kind === 'puesto') {
    const isl = ISLANDS[sq.island]
    const owned = owner !== undefined
    const cls = `${full ? 'is-full' : ''} ${level === 3 ? 'is-lv3' : ''} ${owned ? 'has-own' : ''}`
    inner = (
      <div className={`fe-tile ${cls}`} style={{ '--g': isl.color, '--gi': isl.ink, '--oc': owned ? SEAT_COLORS[owner] : undefined }}>
        <div className="fe-band">
          <b>{isl.name}</b>
        </div>
        <div className="fe-nm">{sq.name}</div>
        <Art className="fe-stand" svg={owned ? awning(SEAT_COLORS[owner], '#fff7e2') : FREE_AWNING} />
        {owned && (
          <div className="fe-lamps">
            {[1, 2, 3].map((n) => (
              <i key={n} className={`fe-lamp ${level >= n ? 'on' : ''}`} />
            ))}
          </div>
        )}
        <div className="fe-price">
          <span className="fe-perra" />
          {owned ? rentOf(sq.i, level, full) : sq.price}
        </div>
        {owned && <div className="fe-own" />}
      </div>
    )
  } else if (side === 'c') {
    const [title, small, cls] = CORNER[sq.kind]
    inner = (
      <div className={`fe-corner ${cls} ${toks ? 'has-toks' : ''}`}>
        <Art className="fe-corner__art" svg={CORNER_ART[sq.kind]} />
        <h3>{title}</h3>
        <small>{small}</small>
      </div>
    )
  } else {
    inner = (
      <div className={`fe-tile fe-tile--sp is-${sq.kind}`}>
        <span className="fe-kicker">{sq.kind === 'suerte' ? 'Papeleta' : 'Impuesto'}</span>
        <Art className="fe-sp__art" svg={SIDE_ICON[sq.kind]} />
        <div className="fe-nm">{sq.name}</div>
        <div className="fe-tag">{sq.kind === 'suerte' ? 'buena o mala' : `Pagas ${TAX}`}</div>
      </div>
    )
  }
  return (
    <div
      className={`fe-sq ${sideClass[side]} ${hit ? 'is-hit' : ''} ${dest ? 'is-dest' : ''} ${sel ? 'is-sel' : ''} ${mine ? 'is-mine' : ''}`}
      style={{ gridArea: `${r} / ${c}`, '--hit': hit ?? undefined }}
      data-sq={sq.i}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={sel}
      onClick={() => onSel(sq.i)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSel(sq.i))}
    >
      {inner}
      <div className="fe-fx" />
    </div>
  )
})

// Las 28 casillas en el borde de la rejilla. occupied: casillas con fichas, como «|0|12|» (las esquinas suben su texto
// para dejarles sitio); es una cadena para que el memo no se rompa con cada cuadro.
export const Casillas = memo(function Casillas({ owners, levels, sel, hit, hitColor, dest, me, players, occupied, onSel }) {
  return BOARD.map((sq) => {
    const owner = owners[sq.i]
    const level = levels[sq.i] ?? 0
    const full = sq.kind === 'puesto' && owner !== undefined && hasIsland(owners, owner, sq.island)
    return (
      <Casilla
        key={sq.i}
        sq={sq}
        owner={owner}
        level={level}
        full={full}
        toks={occupied.includes(`|${sq.i}|`)}
        hit={hit === sq.i ? hitColor : null}
        dest={dest === sq.i}
        sel={sel === sq.i}
        mine={owner !== undefined && owner === me}
        onSel={onSel}
        ariaLabel={label(sq, owner, level, players, me)}
      />
    )
  })
})

// ---------- Centro: lo que no cambia ----------
export const Logo = memo(function Logo() {
  return (
    <div className="fe-logo">
      <Art className="fe-logo__bg" svg={SCENE} />
      <i className="fe-azulejo fe-azulejo--t" />
      <i className="fe-azulejo fe-azulejo--b" />
      <div className="fe-logo__word">
        <i>la</i>
        <b>Feria de las Islas</b>
        <em>Gran Canaria · 7 islas · {SIZE} casillas</em>
      </div>
    </div>
  )
})

export const Jar = memo(function Jar() {
  return <Art className="fe-jar__art" svg={JAR} />
})

export const AwningArt = ({ c1, c2, className }) => <Art className={className} svg={awning(c1, c2)} />
export const IslandArt = ({ k, className }) => <Art className={className} svg={islandShape(k)} />
