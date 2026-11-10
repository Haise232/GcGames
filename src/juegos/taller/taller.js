// Reglas puras del Taller de Papá Noel (Season 5): las usan la pantalla (Taller.jsx) y el servidor
// (api/_juegos/solo.mjs). Un idle tycoon con su propia moneda, las galletas (🍪):
//   - Las PLANTAS del taller fabrican juguetes (cada una vale más que la anterior). Los juguetes se apilan en la planta.
//   - El MONTACARGAS los sube de las plantas al almacén.
//   - El TRINEO los reparte desde el almacén y los convierte en galletas.
// Cada parte tiene nivel (mejorarla cuesta galletas y cada vez más; en los niveles hito, la producción se dobla) y se
// pone a trabajar tocándola (un turno de TAP_S segundos) hasta que contratas a su ENCARGADO, que la hace trabajar sola,
// también cuando no estás (hasta AWAY_MAX_S seguidos). La parte más lenta de la cadena es la que manda: hay que ir
// mejorando el cuello de botella.
//
// Las galletas se canjean por € del casino en paquetes de PACK €: el primero del día cuesta PACK_COST galletas y cada
// uno más, ese día, un PACK_GROWTH más que el anterior, hasta DAILY_CAP € al día. Es dinero que sale de la nada: así
// producir el doble no da el doble de euros y el tope evita que el Taller decida la clasificación. El Taller dura toda
// la temporada.
//
// Todas las cuentas las hace el servidor con advance(): la pantalla solo interpola entre lo que le llega.

export const SEASON = 's5'
export const PACK = 100 // € por paquete
export const PACK_COST = 30000 // galletas del primer paquete del día
export const PACK_GROWTH = 1.3
export const DAILY_CAP = 3000 // € que se pueden canjear al día
export const TAP_S = 5 // un toque hace trabajar a esa parte este tiempo (y hasta entonces no se puede volver a tocar)
export const AWAY_MAX_S = 4 * 3600 // lo que trabajan los encargados sin que vengas (más no se acumula)
export const MILESTONES = [25, 50, 100, 150, 200, 300] // en estos niveles la producción se dobla
export const MAX_BUY = 100 // niveles que se compran de una vez como mucho

// Las plantas, de abajo arriba. rate: galletas por segundo que vale lo que fabrica a nivel 1. cost: la primera mejora.
// unlock: lo que cuesta abrirla. boss: lo que cuesta su encargado.
export const PLANTAS = [
  { name: 'Envoltorio', icon: '🎁', rate: 1, cost: 15, unlock: 0, boss: 150 },
  { name: 'Carpintería', icon: '🪵', rate: 6, cost: 150, unlock: 8000, boss: 6000 },
  { name: 'Muñecas', icon: '🪆', rate: 36, cost: 1600, unlock: 400000, boss: 200000 },
  { name: 'Peluches', icon: '🧸', rate: 216, cost: 17000, unlock: 2e7, boss: 7e6 },
  { name: 'Bicis', icon: '🚲', rate: 1300, cost: 180000, unlock: 1e9, boss: 2.5e8 },
  { name: 'Trenes', icon: '🚂', rate: 7800, cost: 1.9e6, unlock: 5e10, boss: 9e9 },
  { name: 'Robots', icon: '🤖', rate: 47000, cost: 2e7, unlock: 2.5e12, boss: 3e11 },
  { name: 'Consolas', icon: '🎮', rate: 280000, cost: 2.1e8, unlock: 1.2e14, boss: 1e13 },
]
const PLANTA_GROWTH = 1.17

// El montacargas y el trineo: cuánto mueven por segundo a nivel 1 (crece con el nivel y los hitos) y su primera mejora.
export const CARRIERS = {
  e: { name: 'Montacargas', icon: '🛗', rate: 3, cost: 40, costGrow: 1.125, boss: 400 },
  s: { name: 'Trineo', icon: '🛷', rate: 3, cost: 40, costGrow: 1.125, boss: 300 },
}

const milestoneMult = (lvl) => 2 ** MILESTONES.filter((m) => lvl >= m).length
export const nextMilestone = (lvl) => MILESTONES.find((m) => m > lvl) ?? null

// Producción de una planta (galletas/s) y capacidad del montacargas o el trineo (galletas/s), a ese nivel.
export const plantaRate = (i, lvl) => (lvl > 0 ? PLANTAS[i].rate * lvl * milestoneMult(lvl) : 0)
export const carrierRate = (k, lvl) => CARRIERS[k].rate * lvl * milestoneMult(lvl)
// Lo que cuesta subir del nivel lvl al siguiente.
export const plantaCost = (i, lvl) => Math.ceil(PLANTAS[i].cost * PLANTA_GROWTH ** (lvl - 1))
export const carrierCost = (k, lvl) => Math.ceil(CARRIERS[k].cost * CARRIERS[k].costGrow ** (lvl - 1))
const costOf = (part, i, lvl) => (part === 'p' ? plantaCost(i, lvl) : carrierCost(part, lvl))

// Cuántos niveles puedes comprar de golpe (hasta `want`) con `have` galletas, y lo que cuestan.
export function bulk(part, i, lvl, want, have) {
  let n = 0
  let total = 0
  while (n < want) {
    const c = costOf(part, i, lvl + n)
    if (total + c > have) break
    total += c
    n++
  }
  return { n, total }
}

export function fresh(now) {
  return {
    season: SEASON,
    plantas: [1], // niveles de las plantas abiertas
    boss: { p: [false], e: false, s: false },
    e: 1,
    s: 1,
    pile: 0, // juguetes esperando en las plantas (en galletas)
    store: 0, // juguetes en el almacén
    cookies: 0,
    work: { p: [0], e: 0, s: 0 }, // hasta cuándo trabaja cada parte por un toque (ms)
    at: now,
    day: null,
    swapped: 0, // € canjeados hoy
    made: 0, // galletas ganadas en total
  }
}

// Lo que produce y mueve cada parte ahora mismo (las que no tienen encargado, solo mientras dura su toque).
function rates(st, t) {
  const on = (boss, until) => boss || until > t
  let make = 0
  st.plantas.forEach((lvl, i) => {
    if (on(st.boss.p[i], st.work.p[i])) make += plantaRate(i, lvl)
  })
  return { make, lift: on(st.boss.e, st.work.e) ? carrierRate('e', st.e) : 0, sell: on(st.boss.s, st.work.s) ? carrierRate('s', st.s) : 0 }
}

// Avanza el taller hasta el instante t: fabricar, subir al almacén y repartir, a pasos. Si no viniste en mucho rato,
// solo cuentan AWAY_MAX_S segundos. Devuelve el estado nuevo y lo ganado en ese rato.
export function advance(st, t) {
  const out = { ...st, boss: { ...st.boss, p: [...st.boss.p] }, work: { ...st.work, p: [...st.work.p] }, plantas: [...st.plantas] }
  let from = st.at
  if (t - from > AWAY_MAX_S * 1000) from = t - AWAY_MAX_S * 1000
  let earned = 0
  // Pasos de 1 s (como mucho 2000; si hay más rato, más largos). Los toques acaban en mitad: se corta ahí.
  const span = Math.max(0, t - from)
  const step = Math.max(1000, span / 2000)
  for (let now = from; now < t; ) {
    const ends = [out.work.e, out.work.s, ...out.work.p].filter((w) => w > now && w < now + step)
    const next = Math.min(t, now + step, ...ends)
    const h = (next - now) / 1000
    const r = rates(out, now)
    out.pile += r.make * h
    const up = Math.min(out.pile, r.lift * h)
    out.pile -= up
    out.store += up
    const sold = Math.min(out.store, r.sell * h)
    out.store -= sold
    out.cookies += sold
    earned += sold
    now = next
  }
  out.at = t
  out.made = (out.made ?? 0) + earned
  return { st: out, earned }
}

// Galletas por segundo que da la cadena entera trabajando sola (el cuello de botella manda).
export function flow(st) {
  const make = st.plantas.reduce((sum, lvl, i) => sum + plantaRate(i, lvl), 0)
  return Math.min(make, carrierRate('e', st.e), carrierRate('s', st.s))
}
export function bottleneck(st) {
  const make = st.plantas.reduce((sum, lvl, i) => sum + plantaRate(i, lvl), 0)
  const e = carrierRate('e', st.e)
  const s = carrierRate('s', st.s)
  const min = Math.min(make, e, s)
  return min === make ? 'p' : min === e ? 'e' : 's'
}

// --- Canje ---
// Lo que cuesta el siguiente paquete si hoy ya canjeaste `done` paquetes, y cuántos paquetes (y galletas) da `have`.
export const packCost = (done) => Math.ceil(PACK_COST * PACK_GROWTH ** done)
export function packsFor(have, done) {
  let n = 0
  let total = 0
  while ((done + n) * PACK < DAILY_CAP) {
    const c = packCost(done + n)
    if (total + c > have) break
    total += c
    n++
  }
  return { n, total }
}

// --- Ayudas de la pantalla ---
const UNITS = [
  [1e12, 'B'],
  [1e9, 'mil M'],
  [1e6, 'M'],
  [1e3, 'k'],
]
export function fmtCookies(n) {
  const v = Math.floor(n)
  for (const [d, u] of UNITS) if (v >= d) return `${(v / d).toLocaleString('es-ES', { maximumFractionDigits: v >= d * 100 ? 0 : v >= d * 10 ? 1 : 2 })} ${u}`
  return v.toLocaleString('es-ES')
}
