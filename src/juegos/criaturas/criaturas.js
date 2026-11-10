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
//
// Además: las criaturas se entrenan pulsando (cada toque, TRAIN_XP de experiencia; el servidor no admite más de
// TRAIN_RATE por segundo), evolucionan al nivel EVOLVE_LEVEL y se puede retar a otros jugadores en la mesa en vivo
// (engine/criaturas-room.mjs). Ahí todas luchan en su forma final al nivel DUEL_LEVEL: cuenta la estrategia, no los
// toques.

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const SEASON = 's5'
export const MAX_LEVEL = 30
export const TEAM_MAX = 6 // criaturas que puedes tener
export const PARTY = 3 // las que combaten (las tres primeras)
export const START_LEVEL = 5
export const BIG_MOVE_LEVEL = 8 // a este nivel se aprende el ataque fuerte de su tipo
export const ULTRA_MOVE_LEVEL = 20 // y a este, el definitivo (solo las criaturas en su forma final)
export const EVOLVE_LEVEL = 16
export const TRAIN_XP = 1 // experiencia por toque de entrenamiento
export const TRAIN_RATE = 12 // toques por segundo como mucho (lo que pase de ahí no cuenta)
export const TRAIN_BATCH = 60 // toques que se mandan juntos como mucho
export const DUEL_LEVEL = 25 // nivel al que luchan todas en la mesa contra jugadores
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
  volcan: { name: 'Corazón de volcán', type: 'fuego', power: 120, acc: 70 },
  tsunami: { name: 'Mar de fondo', type: 'agua', power: 120, acc: 70 },
  laurisilva: { name: 'Laurisilva', type: 'planta', power: 120, acc: 70 },
  glaciar: { name: 'Nevada del Teide', type: 'hielo', power: 120, acc: 70 },
}
const TYPE_MOVES = {
  fuego: ['ascuas', 'erupcion', 'volcan'],
  agua: ['chorro', 'maremoto', 'tsunami'],
  planta: ['latigo', 'drago', 'laurisilva'],
  hielo: ['escarcha', 'ventisca', 'glaciar'],
}

// Especies: tipo y estadísticas base [vida, ataque, defensa, velocidad]. `evolves`: en qué se convierte al nivel
// EVOLVE_LEVEL. `from`: de cuál viene (las formas finales, que son las que luchan contra jugadores).
export const SPECIES = {
  lavin: { name: 'Lavín', type: 'fuego', base: [46, 58, 46, 58], evolves: 'magmon', blurb: 'Una bolita de lava del Teide que nunca se enfría.' },
  magmon: { name: 'Magmón', type: 'fuego', base: [62, 80, 60, 74], from: 'lavin', blurb: 'Una roca volcánica con brazos: donde pisa, deja el suelo humeando.' },
  pulpin: { name: 'Pulpín', type: 'agua', base: [50, 52, 52, 48], evolves: 'pulpazo', blurb: 'Pulpito de La Restinga; escupe tinta con mucha puntería.' },
  pulpazo: { name: 'Pulpazo', type: 'agua', base: [68, 72, 70, 64], from: 'pulpin', blurb: 'Ocho brazos y mucha paciencia: espera a que el rival se canse.' },
  draguito: { name: 'Draguito', type: 'planta', base: [54, 52, 54, 42], evolves: 'dragonal', blurb: 'Un drago bebé de Icod. Dentro de mil años será enorme.' },
  dragonal: { name: 'Dragonal', type: 'planta', base: [76, 70, 76, 54], from: 'draguito', blurb: 'Un drago milenario que camina. Su savia es roja como la sangre.' },
  copito: { name: 'Copito', type: 'hielo', base: [46, 56, 46, 56], evolves: 'ventisquero', blurb: 'Muñeco de nieve de las Cañadas, con bufanda roja.' },
  ventisquero: { name: 'Ventisquero', type: 'hielo', base: [64, 76, 62, 72], from: 'copito', blurb: 'Tres bolas de nieve y una tormenta dentro. Lleva la bufanda de su infancia.' },
  perenquen: { name: 'Perenquén', type: 'fuego', base: [40, 56, 40, 70], evolves: 'salamandron', blurb: 'Salamanquesa de las paredes encaladas: rapidísimo.' },
  salamandron: { name: 'Salamandrón', type: 'fuego', base: [56, 74, 52, 92], from: 'perenquen', blurb: 'Corre por las paredes y deja chispas a su paso.' },
  pardela: { name: 'Pardela', type: 'agua', base: [44, 54, 40, 66], evolves: 'pardelon', blurb: 'Ave marina que llora por las noches en los acantilados.' },
  pardelon: { name: 'Pardelón', type: 'agua', base: [60, 72, 54, 88], from: 'pardela', blurb: 'Planea de isla en isla sin batir las alas.' },
  renito: { name: 'Renito', type: 'hielo', base: [56, 60, 50, 44], evolves: 'renazo', blurb: 'Reno joven que se escapó del trineo para quedarse en las islas.' },
  renazo: { name: 'Renazo', type: 'hielo', base: [76, 80, 66, 58], from: 'renito', blurb: 'Tira del trineo él solo. La nariz le brilla cuando se enfada.' },
  lagarton: { name: 'Lagartón', type: 'planta', base: [72, 66, 74, 40], blurb: 'Lagarto gigante de El Hierro: lento, pero un muro.' },
  guirre: { name: 'Guirre', type: 'fuego', base: [64, 72, 58, 76], blurb: 'Alimoche de Fuerteventura. Vuela tan alto que se tuesta al sol.' },
  cardon: { name: 'Cardón', type: 'planta', base: [70, 68, 80, 44], blurb: 'Un cardón con mal genio: pincha a quien se acerque.' },
  pejeverde: { name: 'Pejeverde', type: 'agua', base: [66, 70, 60, 74], blurb: 'Pez de los charcos con colores de arcoíris. Muerde fuerte.' },
}
export const SPECIES_IDS = Object.keys(SPECIES)
// Las que se encuentran (las que no vienen de otra): de ellas salen los rivales.
export const WILD_IDS = SPECIES_IDS.filter((id) => !SPECIES[id].from)
// Su forma final (para la mesa contra jugadores) y la forma que le toca a un nivel.
export const finalOf = (sp) => SPECIES[sp].evolves ?? sp
export const formAt = (sp, lvl) => (SPECIES[sp].evolves && lvl >= EVOLVE_LEVEL ? SPECIES[sp].evolves : sp)
export const STARTERS = ['lavin', 'pulpin', 'draguito', 'copito']

// Rivales: cuántos niveles más (o menos) que la media de tu equipo y lo que paga ganarles.
export const TIERS = {
  facil: { name: 'Paseante de la playa', blurb: 'Dos niveles por debajo de tu mejor criatura.', offset: -2, mult: 1.46 },
  normal: { name: 'Entrenadora del barrio', blurb: 'Al nivel de tu mejor criatura.', offset: 0, mult: 2.14 },
  dificil: { name: 'Guardián del faro', blurb: 'Tres niveles por encima.', offset: 3, mult: 4.55 },
  campeon: { name: 'Campeona del Teide', blurb: 'Seis niveles por encima. Solo para valientes.', offset: 6, mult: 9.7 },
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
  const [small, big, ultra] = TYPE_MOVES[SPECIES[sp].type]
  const out = ['placaje', small]
  if (lvl >= BIG_MOVE_LEVEL) out.push(big)
  if (lvl >= ULTRA_MOVE_LEVEL && !SPECIES[sp].evolves) out.push(ultra)
  return out
}
export const xpToNext = (lvl) => 12 * lvl
// Una criatura lista para combatir (con la vida llena).
export function fighter(sp, lvl) {
  const st = statsOf(sp, lvl)
  return { sp, lvl, hp: st.hp, max: st.hp }
}
// XP que da ganar un combate a cada criatura que combatió.
export const xpFor = (rivalLevels, tier) => Math.round((rivalLevels.reduce((a, b) => a + b, 0) / rivalLevels.length) * (TIER_IDS.indexOf(tier) + 2) * 1.6)

// Sube niveles con la XP ganada (y evoluciona al llegar al nivel). Devuelve la criatura nueva, cuántos niveles subió y
// en qué evolucionó (o null).
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
  const sp = formAt(c.sp, lvl)
  return { c: { ...c, sp, lvl, xp: total }, ups, evolved: sp !== c.sp ? sp : null }
}

// --- Rival ---
// El equipo del rival: tantas criaturas como las tuyas que combaten, de especies al azar, al nivel de la dificultad
// contado desde tu criatura más fuerte (si fuera la media, una de nivel 30 con dos de nivel 2 arrasaría).
export function rivalTeam(myLevels, tier, rand) {
  const base = Math.max(...myLevels) + TIERS[tier].offset
  return myLevels.map(() => {
    const lvl = Math.max(2, Math.min(MAX_LEVEL + 6, base + rand(3) - 1))
    return fighter(formAt(WILD_IDS[rand(WILD_IDS.length)], lvl), lvl)
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

// --- Duelo entre jugadores (mesa en vivo) ---
// Cada uno elige a la vez qué hace; cuando están las dos (o se acaba el tiempo) se resuelve el turno: primero los
// cambios y después los ataques, el más rápido antes. Quien se queda sin criatura en pie pierde. duel: { sides: [{ team,
// a, need }, …] }; acts: [acción del 0, acción del 1], cada una { kind: 'move', move } | { kind: 'switch', to } | null
// (no eligió: pierde el turno). Devuelve { duel, log, end: null | 0 | 1 (quién gana) }. En el log, side es 0 o 1.
export const duelFighter = (sp) => fighter(finalOf(sp), DUEL_LEVEL)

export function duelTurn(duel, acts, rand) {
  const d = { sides: duel.sides.map((s) => ({ ...s, team: s.team.map((c) => ({ ...c })) })) }
  const log = []
  const active = (i) => d.sides[i].team[d.sides[i].a]
  const valid = (i, act) => {
    if (!act) return false
    const side = d.sides[i]
    if (act.kind === 'switch') return Number.isInteger(act.to) && act.to !== side.a && side.team[act.to]?.hp > 0
    if (act.kind === 'move') return !side.need && movesOf(active(i).sp, active(i).lvl).includes(act.move)
    return false
  }
  const clean = acts.map((act, i) => (valid(i, act) ? act : null))
  // Cambios forzados (te tumbaron la tuya en el turno anterior): solo cambian quienes lo necesitan, nadie ataca.
  if (d.sides.some((s) => s.need)) {
    d.sides.forEach((side, i) => {
      if (!side.need) return
      const to = clean[i]?.kind === 'switch' ? clean[i].to : alive(side.team)[0]
      side.a = to
      side.need = false
      log.push({ t: 'send', side: i, idx: to })
    })
    return { duel: d, log, end: null }
  }
  // Cambios voluntarios.
  clean.forEach((act, i) => {
    if (act?.kind !== 'switch') return
    d.sides[i].a = act.to
    log.push({ t: 'send', side: i, idx: act.to })
  })
  // Ataques, el más rápido primero (empate: al azar).
  const order = [0, 1].filter((i) => clean[i]?.kind === 'move')
  if (order.length === 2) {
    const s0 = statsOf(active(0).sp, active(0).lvl).spd
    const s1 = statsOf(active(1).sp, active(1).lvl).spd
    if (s1 > s0 || (s1 === s0 && rand(2) === 1)) order.reverse()
  }
  for (const i of order) {
    const j = 1 - i
    if (active(i).hp <= 0) continue
    const r = attack(active(i), active(j), clean[i].move, rand)
    active(j).hp = Math.max(0, active(j).hp - r.dmg)
    log.push({ t: 'move', side: i, move: clean[i].move, ...r })
    if (active(j).hp <= 0) {
      log.push({ t: 'faint', side: j })
      if (!alive(d.sides[j].team).length) return { duel: d, log, end: i }
      d.sides[j].need = true
      break // la tumbada no ataca este turno
    }
  }
  for (const [i, act] of clean.entries()) if (!act) log.push({ t: 'idle', side: i })
  return { duel: d, log, end: null }
}

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
export const effText = (eff) => (eff >= 2 ? '¡Es muy eficaz!' : eff <= 0.5 ? 'No es muy eficaz…' : '')
