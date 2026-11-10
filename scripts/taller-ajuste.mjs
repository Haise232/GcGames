// Ritmo del Taller de Papá Noel (tycoon): simula a alguien que juega activo (toca lo que no tiene encargado, contrata
// encargados en cuanto puede y mejora siempre el cuello de botella, abriendo plantas cuando compensa) y dice cuántas
// galletas por segundo produce al cabo de un rato y cuánto tarda en poder canjear el tope del día.
// Uso: node scripts/taller-ajuste.mjs
import { CARRIERS, DAILY_CAP, PACK, PLANTAS, TAP_S, packsFor, advance, bottleneck, bulk, carrierCost, flow, fresh, plantaCost } from '../src/juegos/taller/taller.js'

let t = 0
let st = fresh(0)
const tap = () => {
  st.plantas.forEach((_, i) => {
    if (!st.boss.p[i] && st.work.p[i] <= t) st.work.p[i] = t + TAP_S * 1000
  })
  if (!st.boss.e && st.work.e <= t) st.work.e = t + TAP_S * 1000
  if (!st.boss.s && st.work.s <= t) st.work.s = t + TAP_S * 1000
}
function shop() {
  for (let guard = 0; guard < 200; guard++) {
    // Encargados primero (de lo más barato a lo más caro).
    const bosses = [
      ...st.plantas.map((_, i) => (!st.boss.p[i] ? { k: 'p', i, c: PLANTAS[i].boss } : null)),
      !st.boss.e ? { k: 'e', c: CARRIERS.e.boss } : null,
      !st.boss.s ? { k: 's', c: CARRIERS.s.boss } : null,
    ].filter(Boolean)
    const b = bosses.sort((x, y) => x.c - y.c)[0]
    if (b && st.cookies >= b.c) {
      st.cookies -= b.c
      if (b.k === 'p') st.boss.p[b.i] = true
      else st.boss[b.k] = true
      continue
    }
    // Abrir la siguiente planta si cuesta menos que ~2 horas de producción.
    const next = st.plantas.length
    if (next < PLANTAS.length && st.cookies >= PLANTAS[next].unlock && PLANTAS[next].unlock < flow(st) * 7200 + 1000) {
      st.cookies -= PLANTAS[next].unlock
      st.plantas.push(1)
      st.boss.p.push(false)
      st.work.p.push(0)
      continue
    }
    // Mejorar el cuello de botella (en las plantas, la más barata de mejorar).
    const k = bottleneck(st)
    let cost, apply
    if (k === 'p') {
      const i = st.plantas.reduce((best, lvl, j) => (plantaCost(j, lvl) / PLANTAS[j].rate < plantaCost(best, st.plantas[best]) / PLANTAS[best].rate ? j : best), 0)
      cost = plantaCost(i, st.plantas[i])
      apply = () => st.plantas[i]++
    } else {
      cost = carrierCost(k, st[k])
      apply = () => st[k]++
    }
    if (st.cookies < cost) return
    st.cookies -= cost
    apply()
  }
}
const DAYS = 14
let capAt = null
let total = 0
// El primer día juega 3 horas seguidas; después, una vez cada 4 horas (de 8 a 24 h): entra, compra y se va.
for (let s = 1; s <= DAYS * 86400; s++) {
  const hour = Math.floor(s / 3600) % 24
  const active = s <= 3 * 3600 || (hour >= 8 && s % (4 * 3600) < 60) || (hour === 20 && s % 3600 === 0)
  if (!active) continue
  t = s * 1000
  tap()
  const r = advance(st, t)
  st = r.st
  total += r.earned
  shop()
  const perDay = flow(st) * 86400
  if (capAt === null && packsFor(flow(st) * 6 * 4 * 3600, 0).n * PACK >= DAILY_CAP) capAt = s
  // Informe: a los 10 min, a la hora, a las 3 h y en la última visita de cada día (a las 20 h).
  const report = [600, 3600, 3 * 3600].includes(s) || (s > 86400 && hour === 20 && s % 3600 === 0)
  if (report) {
    console.log(
      `${s < 86400 ? `${Math.round(s / 60)} min` : `día ${Math.floor(s / 86400) + 1}`} · ${Math.round(flow(st)).toLocaleString('es-ES').padStart(12)} 🍪/s · plantas ${st.plantas.length} [${st.plantas.join(',')}] · montacargas ${st.e} · trineo ${st.s} · €/día canjeando lo de 6 visitas: ${packsFor(flow(st) * 6 * 14400, 0).n * PACK}`,
    )
  }
}
console.log(`Llega al tope del día (${DAILY_CAP} €) viniendo 6 veces al día a partir del ${capAt === null ? 'nunca' : `día ${(capAt / 86400).toFixed(1)}`}`)
