// Ajuste del Taller de Papá Noel: simula a alguien que lo monta con `inicial` € el día `desde` (0 = lunes) y recoge
// cada `cada` horas mientras está despierto (de 8 a 24 h), reinvirtiendo en lo que antes se recupera mientras dé tiempo
// a recuperarlo antes del domingo a las 23:59. Dice con cuánto acaba la semana. Uso: node scripts/taller-ajuste.mjs
import { HOUR, STATION_IDS, UPGRADES, UPGRADE_IDS, capHours, multOf, ratePerHour, stationCost, storedAt, upgradeCost, STATIONS } from '../src/juegos/taller/taller.js'

function semana({ inicial = 15000, desde = 0, cada = 3 }) {
  const end = 7 * 24 * HOUR
  let cash = inicial
  const st = { units: {}, upgrades: {}, stored: 0, at: desde * 24 * HOUR }
  const invest = (t) => {
    for (;;) {
      const left = (end - t) / HOUR
      // La compra que antes se recupera (puestos y mejoras de producción; el almacén, si hace falta).
      let best = null
      for (const id of STATION_IDS) {
        const cost = stationCost(id, st.units[id] ?? 0)
        const gain = STATIONS[id].rate * multOf(st.upgrades)
        if (cost <= cash && (!best || cost / gain < best.pay)) best = { kind: 'st', id, cost, pay: cost / gain }
      }
      for (const id of UPGRADE_IDS) {
        const lvl = st.upgrades[id] ?? 0
        const cost = upgradeCost(id, lvl)
        if (cost === null || cost > cash) continue
        let gain
        if (id === 'almacen') gain = ratePerHour(st.units, st.upgrades) * 0.5 // de noche se perdería producción
        else gain = ratePerHour(st.units, { ...st.upgrades, [id]: lvl + 1 }) - ratePerHour(st.units, st.upgrades)
        if (gain > 0 && (!best || cost / gain < best.pay)) best = { kind: 'up', id, cost, pay: cost / gain }
      }
      if (!best || best.pay > left * 0.8) return
      cash -= best.cost
      if (best.kind === 'st') st.units[best.id] = (st.units[best.id] ?? 0) + 1
      else st.upgrades[best.id] = (st.upgrades[best.id] ?? 0) + 1
    }
  }
  invest(st.at)
  for (let t = st.at + HOUR; t <= end; t += HOUR) {
    const h = (t / HOUR) % 24
    if (h < 8 || (h - 8) % cada !== 0) continue
    cash += storedAt(st, t)
    st.stored = 0
    st.at = t
    invest(t)
  }
  cash += storedAt(st, end) // lo último, el domingo por la noche
  return cash
}

for (const cfg of [{ desde: 0, cada: 2 }, { desde: 0, cada: 4 }, { desde: 0, cada: 8 }, { desde: 2, cada: 3 }, { desde: 4, cada: 3 }, { desde: 5, cada: 3 }, { desde: 0, cada: 3, inicial: 3000 }]) {
  const fin = semana(cfg)
  const ini = cfg.inicial ?? 15000
  console.log(`desde el día ${cfg.desde}, recogiendo cada ${cfg.cada} h, con ${ini} €: acaba con ${Math.round(fin)} € (${fin >= ini ? '+' : ''}${Math.round(((fin - ini) / ini) * 100)} %)`)
}
