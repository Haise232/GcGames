// Reglas puras del Taller de Papá Noel (Season 5): las usan la pantalla (Taller.jsx) y el servidor
// (api/_juegos/solo.mjs). Un tycoon: inviertes saldo en puestos del taller (elfos que envuelven, carpinteros,
// muñecas…) y producen euros cada hora aunque no estés. Recoges cuando quieras; lo producido se guarda en el almacén
// hasta que se llena, así que hay que pasarse a recoger. Las mejoras multiplican la producción o agrandan el almacén.
//
// Como el saldo, el taller se reinicia el domingo a las 23:59: lo invertido solo rinde esa semana. Cada puesto de más
// del mismo tipo cuesta un GROWTH más que el anterior, así que invertir sin fin rinde cada vez menos. Ajustado con
// scripts/taller-ajuste.mjs: montándolo el lunes y recogiendo cada pocas horas, la semana rinde un +35-45 %
// de lo invertido; empezando a mitad de semana, mucho menos (y el sábado ya no se recupera).

export const HOUR = 3600000
export const GROWTH = 1.18

// Puestos: precio del primero y euros por hora de cada uno.
export const STATIONS = {
  elfo: { name: 'Elfo envolvedor', icon: '🧝', cost: 200, rate: 2.4, blurb: 'Papel, celo y un lazo: regalo listo.' },
  madera: { name: 'Carpintería', icon: '🪵', cost: 1500, rate: 19, blurb: 'Caballitos y trenes de madera de pino canario.' },
  munecas: { name: 'Cadena de muñecas', icon: '🪆', cost: 6000, rate: 80, blurb: 'Una cinta que no para de día ni de noche.' },
  bicis: { name: 'Taller de bicis', icon: '🚲', cost: 20000, rate: 280, blurb: 'Ruedas, timbres y cintas en el manillar.' },
  consolas: { name: 'Fábrica de consolas', icon: '🎮', cost: 60000, rate: 880, blurb: 'Lo que todos los niños piden en su carta.' },
}
export const STATION_IDS = Object.keys(STATIONS)

// Mejoras: cada una tiene niveles con su precio. mult: multiplica toda la producción. cap: horas de almacén.
export const UPGRADES = {
  villancicos: { name: 'Villancicos en la radio', icon: '🎶', blurb: 'Los elfos trabajan más contentos.', levels: [{ cost: 2500, mult: 1.15 }, { cost: 9000, mult: 1.3 }] },
  chocolate: { name: 'Chocolate caliente', icon: '☕', blurb: 'Una taza a media mañana y todo va más rápido.', levels: [{ cost: 8000, mult: 1.25 }, { cost: 30000, mult: 1.5 }] },
  almacen: { name: 'Almacén', icon: '📦', blurb: 'Cabe más producción antes de tener que venir a recoger.', levels: [{ cost: 1500, cap: 8 }, { cost: 7000, cap: 16 }] },
}
export const UPGRADE_IDS = Object.keys(UPGRADES)
export const BASE_CAP = 4 // horas de almacén sin mejorar

export const validStation = (id) => typeof id === 'string' && Object.hasOwn(STATIONS, id)
export const validUpgrade = (id) => typeof id === 'string' && Object.hasOwn(UPGRADES, id)

// Precio del siguiente puesto de ese tipo si ya tienes `n`.
export const stationCost = (id, n) => Math.round(STATIONS[id].cost * GROWTH ** n)
// Precio del siguiente nivel de una mejora (o null si ya está al máximo).
export const upgradeCost = (id, lvl) => UPGRADES[id].levels[lvl]?.cost ?? null

// Multiplicador de las mejoras, horas de almacén y producción por hora con lo que tienes.
export function multOf(upgrades) {
  let m = 1
  for (const id of ['villancicos', 'chocolate']) {
    const lvl = upgrades[id] ?? 0
    if (lvl > 0) m *= UPGRADES[id].levels[lvl - 1].mult
  }
  return m
}
export const capHours = (upgrades) => ((upgrades.almacen ?? 0) > 0 ? UPGRADES.almacen.levels[upgrades.almacen - 1].cap : BASE_CAP)
export function ratePerHour(units, upgrades) {
  const raw = STATION_IDS.reduce((sum, id) => sum + (units[id] ?? 0) * STATIONS[id].rate, 0)
  return raw * multOf(upgrades)
}

// Lo que hay en el almacén al instante t: lo de antes más lo producido desde `at`, sin pasar del almacén lleno.
export function storedAt(state, t) {
  const rate = ratePerHour(state.units, state.upgrades)
  const cap = rate * capHours(state.upgrades)
  const made = (rate * Math.max(0, t - state.at)) / HOUR
  return Math.min(cap, (state.stored ?? 0) + made)
}

// Horas que tarda en recuperarse lo que cuesta un puesto, con tus mejoras.
export const paybackHours = (id, n, upgrades) => stationCost(id, n) / (STATIONS[id].rate * multOf(upgrades))
