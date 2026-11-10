// Reglas puras de Criaturas de las Islas (Season 5): las usan la pantalla (Criaturas.jsx) y el servidor
// (api/_juegos/solo.mjs). Un juego de rol por turnos: tienes un equipo de criaturas que dura toda la temporada (suben de
// nivel, aprenden ataques y se unen otras nuevas) y apuestas en cada combate contra un rival de la IA.
//
// El rival se hace a la medida de tu equipo (mismo número de criaturas y niveles según la dificultad), así subir de
// nivel no convierte a nadie en invencible: lo que cuenta es elegir bien los ataques y a quién sacar. Los premios de
// cada dificultad están ajustados con una simulación (ver scripts/criaturas-ajuste.mjs) para que quien juega bien
// recupere alrededor del 96 % y quien juega mal, menos.
//
// Todo el combate lo decide el servidor (precisión, daño, golpes críticos y lo que hace el rival) con su generador; la
// pantalla solo enseña lo que pasó.

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const SEASON = 's5'
export const MAX_LEVEL = 30
export const TEAM_MAX = 6 // criaturas que puedes tener
export const PARTY = 3 // las que combaten (las tres primeras)
export const START_LEVEL = 5
export const BIG_MOVE_LEVEL = 8 // a este nivel se aprende el ataque fuerte de su tipo
export const JOIN_CHANCE = 35 // % de que una criatura del rival quiera unirse a ti tras ganarle

// Tipos: cada uno es muy eficaz (×2) contra los de `strong` y poco eficaz (×0,5) contra los de `weak`.
export const TYPES = {
  fuego: { name: 'Fuego', color: '#ff7a3a', strong: ['planta', 'hielo'], weak: ['agua', 'fuego'] },
  agua: { name: 'Agua', color: '#4aa8ff', strong: ['fuego'], weak: ['planta', 'agua'] },
  planta: { name: 'Planta', color: '#4fd18b', strong: ['agua'], weak: ['fuego', 'hielo', 'planta'] },
  hielo: { name: 'Hielo', color: '#a8e4ff', strong: ['planta'], weak: ['fuego', 'agua', 'hielo'] },
  normal: { name: 'Normal', color: '#c8c0b0', strong: [], weak: [] },
}
export const effectiveness = (moveType, targetType) =>
  moveType === 'normal' ? 1 : TYPES[moveType].strong.includes(targetType) ? 2 : TYPES[moveType].weak.includes(targetType) ? 0.5 : 1

// Ataques: tipo, potencia y precisión (%).
export const MOVES = {
  placaje: { name: 'Placaje', type: 'normal', power: 40, acc: 100 },
  ascuas: { name: 'Ascuas', type: 'fuego', power: 55, acc: 100 },
  erupcion: { name: 'Erupción', type: 'fuego', power: 90, acc: 80 },
  chorro: { name: 'Chorro', type: 'agua', power: 55, acc: 100 },
  maremoto: { name: 'Maremoto', type: 'agua', power: 90, acc: 80 },
  latigo: { name: 'Látigo de savia', type: 'planta', power: 55, acc: 100 },
  drago: { name: 'Furia del drago', type: 'planta', power: 90, acc: 80 },
  escarcha: { name: 'Escarcha', type: 'hielo', power: 55, acc: 100 },
  ventisca: { name: 'Ventisca', type: 'hielo', power: 90, acc: 80 },
}
const TYPE_MOVES = { fuego: ['ascuas', 'erupcion'], agua: ['chorro', 'maremoto'], planta: ['latigo', 'drago'], hielo: ['escarcha', 'ventisca'] }

// Especies: tipo y estadísticas base [vida, ataque, defensa, velocidad].
export const SPECIES = {
  lavin: { name: 'Lavín', type: 'fuego', base: [46, 58, 46, 58], blurb: 'Una bolita de lava del Teide que nunca se enfría.' },
  pulpin: { name: 'Pulpín', type: 'agua', base: [50, 52, 52, 48], blurb: 'Pulpito de La Restinga; escupe tinta con mucha puntería.' },
  draguito: { name: 'Draguito', type: 'planta', base: [54, 52, 54, 42], blurb: 'Un drago bebé de Icod. Dentro de mil años será enorme.' },
  copito: { name: 'Copito', type: 'hielo', base: [46, 56, 46, 56], blurb: 'Muñeco de nieve de las Cañadas, con bufanda roja.' },
  perenquen: { name: 'Perenquén', type: 'fuego', base: [40, 56, 40, 70], blurb: 'Salamanquesa de las paredes encaladas: rapidísimo.' },
  pardela: { name: 'Pardela', type: 'agua', base: [44, 54, 40, 66], blurb: 'Ave marina que llora por las noches en los acantilados.' },
  lagarton: { name: 'Lagartón', type: 'planta', base: [64, 56, 62, 28], blurb: 'Lagarto gigante de El Hierro: lento, pero un muro.' },
  renito: { name: 'Renito', type: 'hielo', base: [56, 60, 50, 44], blurb: 'Reno joven que se escapó del trineo para quedarse en las islas.' },
}
export const SPECIES_IDS = Object.keys(SPECIES)
export const STARTERS = ['lavin', 'pulpin', 'draguito', 'copito']

// Rivales: cuántos niveles más (o menos) que la media de tu equipo y lo que paga ganarles.
export const TIERS = {
  facil: { name: 'Paseante de la playa', blurb: 'Dos niveles por debajo de tu mejor criatura.', offset: -2, mult: 1.47 },
  normal: { name: 'Entrenadora del barrio', blurb: 'Al nivel de tu mejor criatura.', offset: 0, mult: 2.17 },
  dificil: { name: 'Guardián del faro', blurb: 'Tres niveles por encima.', offset: 3, mult: 4.7 },
  campeon: { name: 'Campeona del Teide', blurb: 'Seis niveles por encima. Solo para valientes.', offset: 6, mult: 10.2 },
}
export const TIER_IDS = Object.keys(TIERS)

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validTier = (t) => typeof t === 'string' && Object.hasOwn(TIERS, t)
export const validSpecies = (s) => typeof s === 'string' && Object.hasOwn(SPECIES, s)
export const payout = (bet, tier) => Math.floor(bet * TIERS[tier].mult + 1e-6)

// --- Criaturas ---
export const statsOf = (sp, lvl) => {
  const [hp, atk, def, spd] = SPECIES[sp].base
  const s = (b) => Math.floor((b * 2 * lvl) / 100) + 5
  return { hp: Math.floor((hp * 2 * lvl) / 100) + lvl + 10, atk: s(atk), def: s(def), spd: s(spd) }
}
export const movesOf = (sp, lvl) => {
  const [small, big] = TYPE_MOVES[SPECIES[sp].type]
  return lvl >= BIG_MOVE_LEVEL ? ['placaje', small, big] : ['placaje', small]
}
export const xpToNext = (lvl) => 12 * lvl
// Una criatura lista para combatir (con la vida llena).
export function fighter(sp, lvl) {
  const st = statsOf(sp, lvl)
  return { sp, lvl, hp: st.hp, max: st.hp }
}
// XP que da ganar un combate a cada criatura que combatió.
export const xpFor = (rivalLevels, tier) => Math.round((rivalLevels.reduce((a, b) => a + b, 0) / rivalLevels.length) * (TIER_IDS.indexOf(tier) + 2) * 1.6)

// Sube niveles con la XP ganada. Devuelve la criatura nueva y cuántos niveles subió.
export function gainXp(c, xp) {
  let { lvl } = c
  let total = c.xp + xp
  let ups = 0
  while (lvl < MAX_LEVEL && total >= xpToNext(lvl)) {
    total -= xpToNext(lvl)
    lvl++
    ups++
  }
  if (lvl >= MAX_LEVEL) total = 0
  return { c: { ...c, lvl, xp: total }, ups }
}

// --- Rival ---
// El equipo del rival: tantas criaturas como las tuyas que combaten, de especies al azar, al nivel de la dificultad
// contado desde tu criatura más fuerte (si fuera la media, una de nivel 30 con dos de nivel 2 arrasaría).
export function rivalTeam(myLevels, tier, rand) {
  const base = Math.max(...myLevels) + TIERS[tier].offset
  return myLevels.map(() => {
    const sp = SPECIES_IDS[rand(SPECIES_IDS.length)]
    const lvl = Math.max(2, Math.min(MAX_LEVEL + 6, base + rand(3) - 1))
    return fighter(sp, lvl)
  })
}

// --- Combate ---
// Daño de un ataque. rand(n): entero de 0 a n−1. Devuelve { dmg, eff, crit, miss }.
export function attack(from, to, moveId, rand) {
  const m = MOVES[moveId]
  if (rand(100) >= m.acc) return { dmg: 0, eff: 1, crit: false, miss: true }
  const a = statsOf(from.sp, from.lvl)
  const d = statsOf(to.sp, to.lvl)
  const eff = effectiveness(m.type, SPECIES[to.sp].type)
  const stab = m.type === SPECIES[from.sp].type ? 1.5 : 1
  const crit = rand(16) === 0
  const base = Math.floor(Math.floor((Math.floor((2 * from.lvl) / 5 + 2) * m.power * a.atk) / d.def) / 50) + 2
  const roll = 85 + rand(16)
  const dmg = Math.max(1, Math.floor((base * stab * eff * (crit ? 1.5 : 1) * roll) / 100))
  return { dmg, eff, crit, miss: false }
}

// Daño esperado de un ataque (para elegir el mejor y para las pistas de la pantalla).
export function expected(from, to, moveId) {
  const m = MOVES[moveId]
  const a = statsOf(from.sp, from.lvl)
  const d = statsOf(to.sp, to.lvl)
  const eff = effectiveness(m.type, SPECIES[to.sp].type)
  const stab = m.type === SPECIES[from.sp].type ? 1.5 : 1
  const base = Math.floor(Math.floor((Math.floor((2 * from.lvl) / 5 + 2) * m.power * a.atk) / d.def) / 50) + 2
  return base * stab * eff * 0.925 * (m.acc / 100)
}

// Lo que hace el rival: casi siempre el ataque con más daño esperado (si puede tumbarte, el más seguro); a veces otro.
export function rivalMove(rival, mine, rand) {
  const moves = movesOf(rival.sp, rival.lvl)
  if (rand(100) < 15) return moves[rand(moves.length)]
  let best = moves[0]
  let bestScore = -1
  for (const id of moves) {
    const e = expected(rival, mine, id)
    // Si con el daño medio te tumba, se prefiere el que no falla.
    const score = e / (MOVES[id].acc / 100) >= mine.hp ? 1000 + MOVES[id].acc : e
    if (score > bestScore) {
      best = id
      bestScore = score
    }
  }
  return best
}

// ¿Quién ataca primero? El más rápido; si empatan, al azar.
export const firstIsMine = (mine, rival, rand) => {
  const a = statsOf(mine.sp, mine.lvl).spd
  const b = statsOf(rival.sp, rival.lvl).spd
  return a === b ? rand(2) === 0 : a > b
}

// Índices de las criaturas que siguen en pie.
export const alive = (team) => team.map((c, i) => (c.hp > 0 ? i : -1)).filter((i) => i >= 0)

// Un combate: { mine, rival (listas de luchadores), a, b (quién está fuera de cada lado), need ('switch' si te han
// tumbado una y tienes que sacar otra) }. Un turno con tu acción: { kind: 'move', move } o { kind: 'switch', to }.
// Devuelve { battle, log, end: null | 'win' | 'lose' }; log son los sucesos en orden, para que la pantalla los enseñe:
//   { t: 'move', side, move, dmg, eff, crit, miss } · { t: 'faint', side } · { t: 'send', side, idx }
export function turn(battle, action, rand) {
  const b = { ...battle, mine: battle.mine.map((c) => ({ ...c })), rival: battle.rival.map((c) => ({ ...c })) }
  const log = []
  if (b.need === 'switch') {
    if (action.kind !== 'switch' || !alive(b.mine).includes(action.to)) return { error: true }
    b.a = action.to
    b.need = null
    log.push({ t: 'send', side: 'me', idx: b.a })
    return { battle: b, log, end: null }
  }
  // Una parte ataca a la otra; devuelve si la tumbó.
  const hit = (side, moveId) => {
    const from = side === 'me' ? b.mine[b.a] : b.rival[b.b]
    const to = side === 'me' ? b.rival[b.b] : b.mine[b.a]
    const r = attack(from, to, moveId, rand)
    to.hp = Math.max(0, to.hp - r.dmg)
    log.push({ t: 'move', side, move: moveId, ...r })
    if (to.hp > 0) return false
    log.push({ t: 'faint', side: side === 'me' ? 'rival' : 'me' })
    return true
  }
  // El rival saca la siguiente; si no le quedan, has ganado.
  const rivalNext = () => {
    const left = alive(b.rival)
    if (!left.length) return 'win'
    b.b = left[0]
    log.push({ t: 'send', side: 'rival', idx: b.b })
    return null
  }
  // Te han tumbado la tuya: si te quedan, eliges cuál sale; si no, has perdido.
  const mineDown = () => {
    if (!alive(b.mine).length) return 'lose'
    b.need = 'switch'
    return null
  }

  if (action.kind === 'switch') {
    if (action.to === b.a || !alive(b.mine).includes(action.to)) return { error: true }
    b.a = action.to
    log.push({ t: 'send', side: 'me', idx: b.a })
    const end = hit('rival', rivalMove(b.rival[b.b], b.mine[b.a], rand)) ? mineDown() : null
    return { battle: b, log, end }
  }
  if (action.kind !== 'move' || !movesOf(b.mine[b.a].sp, b.mine[b.a].lvl).includes(action.move)) return { error: true }
  const theirs = rivalMove(b.rival[b.b], b.mine[b.a], rand)
  if (firstIsMine(b.mine[b.a], b.rival[b.b], rand)) {
    if (hit('me', action.move)) return { battle: b, log, end: rivalNext() }
    const end = hit('rival', theirs) ? mineDown() : null
    return { battle: b, log, end }
  }
  if (hit('rival', theirs)) return { battle: b, log, end: mineDown() }
  const end = hit('me', action.move) ? rivalNext() : null
  return { battle: b, log, end }
}

// La mejor jugada «de manual» (la que usa la simulación del ajuste y la pista de la pantalla): el ataque con más daño
// esperado, y si te tumban, sacar la que mejor le pega al rival que hay fuera.
export function bestMove(mine, rival) {
  return movesOf(mine.sp, mine.lvl).reduce((best, id) => (expected(mine, rival, id) > expected(mine, rival, best) ? id : best))
}
export function bestSwitch(battle) {
  const r = battle.rival[battle.b]
  return alive(battle.mine)
    .filter((i) => i !== battle.a || battle.mine[battle.a].hp <= 0)
    .reduce((best, i) => (best === -1 || expected(battle.mine[i], r, bestMove(battle.mine[i], r)) > expected(battle.mine[best], r, bestMove(battle.mine[best], r)) ? i : best), -1)
}

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
export const effText = (eff) => (eff >= 2 ? '¡Es muy eficaz!' : eff <= 0.5 ? 'No es muy eficaz…' : '')
