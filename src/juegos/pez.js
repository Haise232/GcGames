// Reglas puras de Pez Gordo (Season 4): las usan la pantalla (Pez.jsx) para jugar y dibujar y el servidor
// (api/_juegos/solo.mjs) para comprobar la partida. Eres un pez en el mar: comes plancton y peces más pequeños para
// crecer y huyes de los grandes. Cuanto más pesas, más vale salir del agua; si te comen, pierdes la apuesta.
//
// La partida es una simulación determinista: con la misma semilla y los mismos movimientos sale lo mismo en el navegador
// y en el servidor (solo sumas, productos, divisiones y raíces, que dan igual en todas partes, y un generador de enteros).
// El navegador manda tus movimientos al acabar y el servidor la repite para pagar: no se puede inventar el resultado.

export const TICK_MS = 100 // 10 pasos por segundo; la pantalla interpola entre paso y paso
export const MAX_TICKS = 600 // 60 s: al acabar el tiempo sales del agua tú solo
export const WORLD = 1400
export const START_MASS = 20
export const MAX_MULT = 10
export const MIN_BET = 100
export const MAX_BET = 20000
export const BETS = [100, 500, 1000, 2500, 5000, 10000]
const PELLETS = 180
const GOLD_EVERY = 23 // uno de cada tantos es plancton dorado
const GOLD_MASS = 6
const BOTS = 15
const EAT_RATIO = 1.15 // para comerte a otro tienes que pesar al menos esto más que él
const DECAY_FROM = 150 // por encima de este peso se adelgaza un poco en cada paso
const DECAY = 0.0012
const THINK_EVERY = 4 // los peces de la casa deciden adónde ir cada tantos pasos
const SIGHT = 300
const CELL = 100
const GRID = WORLD / CELL

// Nombres de los peces de la casa: peces de Canarias.
const NAMES = ['Vieja', 'Sama', 'Cherne', 'Abadejo', 'Morena', 'Sargo', 'Salema', 'Fula', 'Chopa', 'Bocinegro', 'Medregal', 'Pejeverde', 'Gallo', 'Mero', 'Bicuda', 'Caballa', 'Palometa', 'Pejeperro']
const SHARKS = ['Marrajo', 'Tintorera', 'Tiburón ángel', 'Cornuda']

// Lo que se cobra al salir del agua con ese peso: empiezas en ×0,28, con 3,5 veces tu peso recuperas la apuesta
// (×1) y a ×10 se acaba.
export const BREAK_EVEN = 70
export const multOf = (mass) => Math.min(MAX_MULT, Math.floor((mass / BREAK_EVEN) * 100) / 100)
export const payout = (bet, mass) => Math.floor(bet * multOf(mass))
export const validBet = (bet) => Number.isSafeInteger(bet) && bet >= MIN_BET && bet <= MAX_BET
export const radiusOf = (mass) => 4 + Math.sqrt(mass) * 3.2
export const speedOf = (mass) => 210 / Math.sqrt(mass + 45)

// Generador de enteros de 32 bits (mulberry32), igual en todas partes.
function rng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
  return { int: (n) => next() % n, unit: () => next() / 4294967296 }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// Movimientos del jugador: cambios de rumbo [paso, dx, dy] (enteros de −100 a 100: hacia dónde y con cuánta prisa).
export function validInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length > MAX_TICKS + 1) return false
  let prev = -1
  for (const it of inputs) {
    if (!Array.isArray(it) || it.length !== 3) return false
    const [t, dx, dy] = it
    if (!Number.isSafeInteger(t) || t <= prev || t > MAX_TICKS) return false
    if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || Math.abs(dx) > 100 || Math.abs(dy) > 100) return false
    prev = t
  }
  return true
}

export function createWorld(seed) {
  const r = rng(seed)
  const pellets = []
  for (let i = 0; i < PELLETS; i++) pellets.push(newPellet(r, i))
  const bots = []
  for (let i = 0; i < BOTS; i++) bots.push(newBot(r, i, null))
  return {
    r,
    tick: 0,
    me: { id: -1, name: 'Tú', shark: false, x: WORLD / 2, y: WORLD / 2, mass: START_MASS, vx: 0, vy: 0, tx: 0, ty: 0, hue: 0, alive: true, power: 0, rad: radiusOf(START_MASS), eatenBy: null },
    pellets,
    bots,
    nextId: BOTS,
    dir: [0, 0],
    events: [], // lo que pasó en el último paso (para sonidos y efectos de la pantalla)
    best: START_MASS,
    head: new Int32Array(GRID * GRID),
    next: new Int32Array(PELLETS),
  }
}

function newPellet(r, i) {
  const x = 20 + r.int(WORLD - 40)
  const y = 20 + r.int(WORLD - 40)
  return { x, y, cell: Math.floor(y / CELL) * GRID + Math.floor(x / CELL), gold: i % GOLD_EVERY === 0, hue: r.int(6), eaten: -1 }
}

// Un pez de la casa: la mayoría pequeños, algunos medianos y unos pocos tiburones. Nace lejos de ti.
function newBot(r, id, me) {
  const roll = r.int(100)
  const shark = roll >= 88
  const mass = shark ? 160 + r.int(200) : roll >= 62 ? 40 + r.int(70) : 8 + r.int(26)
  let x = 0
  let y = 0
  for (let k = 0; k < 8; k++) {
    x = 60 + r.int(WORLD - 120)
    y = 60 + r.int(WORLD - 120)
    if (!me) {
      const dx = x - WORLD / 2
      const dy = y - WORLD / 2
      if (dx * dx + dy * dy > 330 * 330) break
    } else {
      const dx = x - me.x
      const dy = y - me.y
      if (dx * dx + dy * dy > 520 * 520) break
    }
  }
  const pool = shark ? SHARKS : NAMES
  return { id, name: pool[r.int(pool.length)], shark, x, y, mass, vx: 0, vy: 0, tx: x, ty: y, hue: r.int(8), alive: true, power: 0.55, rad: radiusOf(mass), eatenBy: null }
}

// Rumbo del jugador desde un paso concreto.
export function inputAt(inputs, from) {
  let i = from
  return (tick) => {
    while (i < inputs.length && inputs[i][0] <= tick) i++
    return i > 0 ? inputs[i - 1] : null
  }
}

function moveToward(f, dx, dy, power) {
  const len = Math.sqrt(dx * dx + dy * dy)
  const sp = speedOf(f.mass)
  if (len < 0.0001 || power <= 0) {
    f.vx *= 0.6
    f.vy *= 0.6
  } else {
    // Gira y acelera poco a poco (los peces no frenan en seco).
    f.vx = f.vx * 0.55 + (dx / len) * sp * power * 0.45
    f.vy = f.vy * 0.55 + (dy / len) * sp * power * 0.45
  }
  const r = radiusOf(f.mass)
  f.x = clamp(f.x + f.vx, r * 0.5, WORLD - r * 0.5)
  f.y = clamp(f.y + f.vy, r * 0.5, WORLD - r * 0.5)
}

const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
// a se come a b si pesa bastante más y lo tiene casi encima.
function eats(a, b) {
  if (a.mass < b.mass * EAT_RATIO) return false
  const dx = a.x - b.x
  const dy = a.y - b.y
  const far = a.rad + b.rad
  if (dx * dx + dy * dy > far * far) return false
  const reach = a.rad - b.rad * 0.35
  return reach > 0 && dist2(a, b) < reach * reach
}

function think(w, bot, fishes) {
  const r = w.r
  let threat = null
  let threatD = SIGHT * SIGHT
  let prey = null
  let preyD = SIGHT * SIGHT
  for (const o of fishes) {
    if (o === bot || !o.alive) continue
    const d = dist2(bot, o)
    if (o.mass >= bot.mass * EAT_RATIO && d < threatD) {
      threat = o
      threatD = d
    } else if (bot.mass >= o.mass * EAT_RATIO && d < preyD) {
      prey = o
      preyD = d
    }
  }
  if (threat && threatD < 200 * 200) {
    bot.tx = clamp(bot.x + (bot.x - threat.x) * 3, 40, WORLD - 40)
    bot.ty = clamp(bot.y + (bot.y - threat.y) * 3, 40, WORLD - 40)
    bot.power = 1
  } else if (prey) {
    bot.tx = prey.x
    bot.ty = prey.y
    // Los tiburones persiguen con ganas; los demás, a ratos.
    bot.power = bot.shark ? 0.92 : 0.8
  } else {
    const dx = bot.tx - bot.x
    const dy = bot.ty - bot.y
    if (dx * dx + dy * dy < 60 * 60 || r.int(12) === 0) {
      bot.tx = 60 + r.int(WORLD - 120)
      bot.ty = 60 + r.int(WORLD - 120)
    }
    bot.power = 0.55
  }
}

// Un paso de la partida. dir: [dx, dy] del jugador (enteros de −100 a 100).
export function step(w, dir) {
  w.events = []
  w.tick++
  const me = w.me
  const fishes = [me, ...w.bots]

  if (me.alive) {
    const [dx, dy] = dir ?? [0, 0]
    const len = Math.sqrt(dx * dx + dy * dy)
    moveToward(me, dx, dy, len < 8 ? 0 : Math.min(1, len / 60))
  }
  for (const bot of w.bots) {
    if (!bot.alive) continue
    if ((w.tick + bot.id) % THINK_EVERY === 0) think(w, bot, fishes)
    moveToward(bot, bot.tx - bot.x, bot.ty - bot.y, bot.power)
  }

  // Plancton: se reparte en una rejilla para mirar solo lo que hay cerca de cada pez.
  // Listas enlazadas en arrays fijos (head: primer plancton de cada celda, next: el siguiente de la misma celda).
  const head = w.head
  const next = w.next
  head.fill(-1)
  const pellets = w.pellets
  for (let i = pellets.length - 1; i >= 0; i--) {
    const cell = pellets[i].cell
    next[i] = head[cell]
    head[cell] = i
  }
  let anyEaten = false
  for (const f of fishes) {
    if (!f.alive) continue
    const rad = radiusOf(f.mass)
    const c0 = Math.max(0, Math.floor((f.x - rad) / CELL))
    const c1 = Math.min(GRID - 1, Math.floor((f.x + rad) / CELL))
    const r0 = Math.max(0, Math.floor((f.y - rad) / CELL))
    const r1 = Math.min(GRID - 1, Math.floor((f.y + rad) / CELL))
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        for (let i = head[row * GRID + col]; i !== -1; i = next[i]) {
          const p = pellets[i]
          if (p.eaten === w.tick) continue
          const dx = f.x - p.x
          const dy = f.y - p.y
          if (dx * dx + dy * dy < rad * rad) {
            p.eaten = w.tick
            anyEaten = true
            f.mass += p.gold ? GOLD_MASS : 1
            if (f === me) w.events.push({ kind: p.gold ? 'gold' : 'pellet', x: p.x, y: p.y })
          }
        }
      }
    }
  }
  if (anyEaten) for (let i = 0; i < pellets.length; i++) if (pellets[i].eaten === w.tick) pellets[i] = newPellet(w.r, i)

  // Peces que se comen a otros: cada pareja una vez, en el orden fijo de la lista (tú primero), así sale igual siempre.
  const n = fishes.length
  for (let i = 0; i < n; i++) fishes[i].rad = radiusOf(fishes[i].mass)
  for (let i = 0; i < n; i++) {
    const a = fishes[i]
    for (let j = i + 1; j < n && a.alive; j++) {
      const b = fishes[j]
      if (!b.alive) continue
      const big = eats(a, b) ? a : eats(b, a) ? b : null
      if (!big) continue
      const small = big === a ? b : a
      big.mass += small.mass
      big.rad = radiusOf(big.mass)
      small.alive = false
      if (small === me) {
        me.eatenBy = big.name
        w.events.push({ kind: 'eaten', by: big.name, x: small.x, y: small.y })
      } else if (big === me) w.events.push({ kind: 'eat', name: small.name, mass: small.mass, x: small.x, y: small.y })
      else w.events.push({ kind: 'bite', x: small.x, y: small.y })
    }
  }
  // Los peces de la casa que se comen vuelven a nacer lejos de ti.
  w.bots = w.bots.map((bot) => (bot.alive ? bot : newBot(w.r, w.nextId++, me)))

  for (const f of [me, ...w.bots]) if (f.alive && f.mass > DECAY_FROM) f.mass -= (f.mass - DECAY_FROM) * DECAY
  if (me.alive && me.mass > w.best) w.best = me.mass
  return w
}

// La partida entera desde la semilla con tus movimientos hasta el paso «until» (lo que hace el servidor).
// Devuelve { alive, mass, tick, eatenBy }: si te comen antes, la partida acaba en ese paso.
export function simulate(seed, inputs, until) {
  const w = createWorld(seed)
  const at = inputAt(inputs, 0)
  const end = Math.min(until, MAX_TICKS)
  while (w.tick < end && w.me.alive) {
    const it = at(w.tick)
    step(w, it ? [it[1], it[2]] : null)
  }
  return { alive: w.me.alive, mass: w.me.mass, tick: w.tick, eatenBy: w.me.eatenBy, best: w.best }
}
