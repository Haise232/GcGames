// Reglas puras del Campeonato de Pesca de La Restinga (Season 4, en vivo): las usan la pantalla (Pesca.jsx) y el
// servidor (api/_juegos/pesca.mjs). Cada ROUND_MS hay un campeonato para todos:
//   · Inscripción (JOIN_MS): pagas ENTRY. Mientras tanto se ve el podio del campeonato anterior.
//   · Pesca (FISH_MS): todos pescan en el mismo mar. Los peces son sombras que cruzan el agua; cada sombra es un pez
//     concreto (especie y peso) que sale de la semilla de la ronda, igual para todos. Lanzas el anzuelo a un punto; tarda
//     en caer (castMs) y, si al caer tiene un pez libre cerca, pica y es tuyo: nadie más puede engancharlo. Si no, el
//     anzuelo tarda RECAST_MS en volver.
//   · La pelea: un juego de tensión. Mantén para recoger sedal; si tiras con el sedal muy tenso, se parte; si lo dejas
//     flojo demasiado rato, el pez se suelta; si se lleva todo el sedal, se escapa. El pez da tirones («carreras»): suelta
//     mientras corre y recoge cuando descansa. Es una simulación determinista (como Pez Gordo): el navegador manda cuándo
//     pulsaste y soltaste y el servidor la repite para darte el pez.
// Gana quien más kilos saca. El bote (las inscripciones menos BOTE_CUT, más lo que pone la Cofradía si hay al menos
// COFRADIA_MIN pescadores) se reparte entre el podio. BOTE_CUT de cada inscripción va al Bote del Marlín, que se lleva
// entero quien saque un marlín azul.

export const VERSION = 1
export const ROUND_MS = 120000
export const JOIN_MS = 30000
export const FISH_MS = ROUND_MS - JOIN_MS
export const ENTRY = 2000
export const BOTE_CUT = 0.1 // de cada inscripción, al Bote del Marlín
export const BOTE_SEED = 10000 // con lo que abre el bote la Cofradía cada semana
export const BOTE_RESEED = 5000 // y lo que vuelve a poner cuando alguien se lo lleva
export const COFRADIA_PER = 500 // lo que pone la Cofradía por pescador cuando hay al menos COFRADIA_MIN
export const COFRADIA_MIN = 3
export const RECAST_MS = 1400 // lo que tarda en volver el anzuelo cuando no pica nada
export const BITE_R = 34 // radio en el que pica un pez (más su tamaño)
export const LOOKAHEAD_MS = 6000 // el servidor enseña los peces que entran en el agua en los próximos segundos

// El mar, en unidades: W × H. Los pescadores están en el muelle, abajo (y = H).
export const W = 1000
export const H = 560
export const DOCK_Y = H

// Lo que tarda en caer el anzuelo según lo lejos que lo tires (desde el centro del muelle): de 0,45 s a 1,1 s.
export const castMs = (x, y) => Math.round(450 + Math.min(1, Math.hypot(x - W / 2, DOCK_Y - y) / 1100) * 650)

export const validPoint = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= W && y >= 0 && y <= H - 30

// Fases de una ronda según el reloj.
export const roundOf = (t) => Math.floor(t / ROUND_MS)
export const fishStart = (round) => round * ROUND_MS + JOIN_MS
export const fishEnd = (round) => (round + 1) * ROUND_MS
export function phaseAt(t) {
  const round = roundOf(t)
  return { round, phase: t < fishStart(round) ? 'join' : 'fish', start: fishStart(round), end: fishEnd(round) }
}

// --- Especies ---
// kg: [mínimo, máximo] · size: largo de la sombra · speed: unidades por segundo · weight: cuántas salen
// Pelea: pull (fuerza base), runs (cada cuántos pasos corre, de media), runPow (fuerza de la carrera), runLen (pasos que
// dura), stamina (cuánto aguanta antes de cansarse), line (sedal que tiene que recoger).
export const SPECIES = {
  caballa: { name: 'Caballa', kg: [0.3, 0.9], size: 30, speed: 120, weight: 30, pull: 18, runs: 60, runPow: 20, runLen: 6, stamina: 40, line: 50, color: '#5d7fa0' },
  vieja: { name: 'Vieja', kg: [0.6, 2.4], size: 38, speed: 55, weight: 26, pull: 22, runs: 70, runPow: 24, runLen: 8, stamina: 60, line: 60, color: '#c4513a' },
  sama: { name: 'Sama', kg: [1.5, 5], size: 48, speed: 80, weight: 18, pull: 30, runs: 50, runPow: 34, runLen: 10, stamina: 90, line: 75, color: '#d36a6a' },
  morena: { name: 'Morena', kg: [2, 6], size: 56, speed: 45, weight: 9, pull: 34, runs: 22, runPow: 52, runLen: 5, stamina: 80, line: 70, color: '#6b6a2a' },
  cherne: { name: 'Cherne', kg: [6, 18], size: 66, speed: 38, weight: 9, pull: 40, runs: 55, runPow: 38, runLen: 14, stamina: 150, line: 90, color: '#5a4a3a' },
  medregal: { name: 'Medregal', kg: [8, 24], size: 74, speed: 105, weight: 7, pull: 38, runs: 34, runPow: 50, runLen: 16, stamina: 170, line: 100, color: '#b9a24a' },
  atun: { name: 'Atún rojo', kg: [45, 130], size: 104, speed: 95, weight: 0, pull: 46, runs: 38, runPow: 56, runLen: 18, stamina: 200, line: 100, color: '#2a3c6a' },
  marlin: { name: 'Marlín azul', kg: [160, 360], size: 138, speed: 130, weight: 0, pull: 50, runs: 30, runPow: 62, runLen: 20, stamina: 260, line: 110, color: '#1f5fb8' },
}
export const SPECIES_ORDER = ['caballa', 'vieja', 'sama', 'morena', 'cherne', 'medregal', 'atun', 'marlin']
const COMMON = SPECIES_ORDER.filter((k) => SPECIES[k].weight > 0)
const COMMON_TOTAL = COMMON.reduce((s, k) => s + SPECIES[k].weight, 0)
export const MARLIN_CHANCE = 0.4 // rondas con marlín
export const COMMON_FISH = 34

// Generador de enteros de 32 bits (mulberry32), igual en el navegador y en el servidor.
export function rng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
  return { next, int: (n) => next() % n, unit: () => next() / 4294967296 }
}

// Gramos de un pez (enteros: el peso se guarda y se suma en gramos).
const gramsOf = (sp, u) => Math.round((SPECIES[sp].kg[0] + (SPECIES[sp].kg[1] - SPECIES[sp].kg[0]) * u * u) * 1000)

// Los peces de una ronda a partir de su semilla (un entero de 32 bits). Cada pez:
// { id, sp, g (gramos), t0, t1 (cuándo entra y sale del agua, en ms desde que empieza la pesca), x0, y0, vx, amp, w, ph, seed }
// Nada en horizontal (de un lado al otro) ondulando en vertical: posición en fishAt.
export function seaOf(seed) {
  const r = rng(seed)
  const fish = []
  const add = (sp, t0) => {
    const s = SPECIES[sp]
    const dir = r.int(2) ? 1 : -1
    const speed = s.speed * (0.8 + r.unit() * 0.4)
    const margin = s.size
    const x0 = dir > 0 ? -margin : W + margin
    const travel = W + margin * 2
    const dur = Math.round((travel / speed) * 1000)
    const yMin = 50 + s.size / 2
    const yMax = H - 90 - s.size / 2
    fish.push({
      id: fish.length,
      sp,
      g: gramsOf(sp, r.unit()),
      t0,
      t1: t0 + dur,
      x0,
      y0: Math.round(yMin + r.unit() * (yMax - yMin)),
      vx: dir * speed,
      amp: Math.round(10 + r.unit() * 40),
      w: 0.6 + r.unit() * 1.4,
      ph: r.unit() * 6.283,
      seed: r.next(),
    })
  }
  // Los comunes, repartidos por toda la pesca (los primeros ya entrando al empezar).
  for (let i = 0; i < COMMON_FISH; i++) {
    let pick = r.int(COMMON_TOTAL)
    let sp = COMMON[0]
    for (const k of COMMON) {
      if (pick < SPECIES[k].weight) {
        sp = k
        break
      }
      pick -= SPECIES[k].weight
    }
    const slot = FISH_MS / COMMON_FISH
    add(sp, Math.max(0, Math.round(i * slot - 4000 + r.unit() * slot)))
  }
  // Dos atunes, uno en cada mitad.
  add('atun', Math.round(8000 + r.unit() * 25000))
  add('atun', Math.round(45000 + r.unit() * 25000))
  // Y a veces, el marlín.
  if (r.unit() < MARLIN_CHANCE) add('marlin', Math.round(20000 + r.unit() * 45000))
  fish.sort((a, b) => a.t0 - b.t0 || a.id - b.id)
  return fish
}

// Dónde está un pez a los ms de pesca (null si aún no ha entrado o ya salió).
export function fishAt(f, ms) {
  if (ms < f.t0 || ms > f.t1) return null
  const s = (ms - f.t0) / 1000
  const x = f.x0 + f.vx * s
  const y = Math.min(H - 60, Math.max(30, f.y0 + f.amp * Math.sin(f.w * s + f.ph)))
  return { x, y, dir: f.vx > 0 ? 1 : -1 }
}

// El pez que pica en (x, y) a los ms de pesca, de entre los libres (taken: Set de ids ya enganchados o sacados): el más
// cercano dentro de su radio. null si no pica ninguno.
export function biteAt(fish, x, y, ms, taken) {
  let best = null
  let bestD = Infinity
  for (const f of fish) {
    if (taken.has(f.id)) continue
    const p = fishAt(f, ms)
    if (!p) continue
    // El anzuelo tiene que caer cerca de la cabeza o del cuerpo: se mide al punto más cercano del pez (un segmento).
    const half = SPECIES[f.sp].size / 2
    const cx = Math.max(p.x - half, Math.min(p.x + half, x))
    const d = Math.hypot(x - cx, y - p.y)
    if (d <= BITE_R && d < bestD) {
      best = f
      bestD = d
    }
  }
  return best
}

// --- La pelea ---
export const TICK_MS = 50 // 20 pasos por segundo
export const MAX_FIGHT_TICKS = 900 // 45 s como mucho
export const SNAP = 100 // tensión a la que se parte el sedal
export const SLACK = 12 // por debajo, el sedal va flojo
export const SLACK_TICKS = 34 // y si va flojo tanto rato (1,7 s), el pez se suelta
export const WARN_TICKS = 6 // aviso antes de cada carrera (0,3 s)
// Constantes de la pelea (afinadas con una simulación de jugadores con 0,25 s de reflejos).
export const K = { up: 0.07, upBase: 1.3, gain: 1.6, gainMin: 0.4, gainPull: 0.014, down: 2.6, downPull: 0.02, give: 0.02 }

// Estado inicial de la pelea de un pez.
export function fightStart(f) {
  const s = SPECIES[f.sp]
  // El peso dentro de su especie hace la pelea un poco más dura.
  const heavy = (f.g / 1000 - s.kg[0]) / (s.kg[1] - s.kg[0])
  return {
    tick: 0,
    tension: 30,
    line: s.line * 0.6, // sedal fuera (cuando llega a 0, el pez está en el muelle)
    maxLine: s.line,
    stamina: s.stamina * (1 + heavy * 0.35),
    slack: 0,
    run: 0, // pasos de carrera que le quedan
    warn: 0, // pasos para que empiece la carrera que se está avisando
    end: null, // 'landed' | 'snap' | 'loose' | 'escaped'
    reel: false,
  }
}

// Un paso de la pelea. reel: si estás recogiendo. r: el generador del pez (rng(f.seed)), que decide sus carreras.
export function fightStep(st, f, reel, r) {
  if (st.end) return st
  const s = SPECIES[f.sp]
  const tired = Math.max(0.3, st.stamina / (s.stamina * 1.35))
  // Las carreras se avisan: el pez se revuelve WARN_TICKS pasos antes de salir corriendo (la pantalla lo enseña).
  let { run, warn } = st
  if (run > 0) run--
  else if (warn > 0) {
    warn--
    if (warn === 0) run = s.runLen + r.int(s.runLen)
  } else if (r.int(s.runs) === 0) warn = WARN_TICKS
  const pull = (s.pull + (run > 0 ? s.runPow : 0)) * tired
  let { tension, line, stamina, slack } = st
  if (reel) {
    // Recoger: sube la tensión según lo que tira el pez y se gana sedal (menos cuanto más tira).
    tension += pull * K.up + K.upBase
    line -= Math.max(K.gainMin, K.gain - pull * K.gainPull)
    stamina -= 1 + pull * 0.03
  } else {
    // Soltar: la tensión baja (menos cuanto más tira) y el pez se lleva sedal.
    tension -= K.down - pull * K.downPull
    line += pull * K.give
    stamina -= 0.35
  }
  tension = Math.max(0, tension)
  line = Math.min(st.maxLine * 1.6, line)
  slack = tension < SLACK ? slack + 1 : 0
  let end = null
  if (tension >= SNAP) end = 'snap'
  else if (line <= 0) end = 'landed'
  else if (line >= st.maxLine * 1.6) end = 'escaped'
  else if (slack >= SLACK_TICKS) end = 'loose'
  else if (st.tick + 1 >= MAX_FIGHT_TICKS) end = 'escaped'
  return { ...st, tick: st.tick + 1, tension, line: Math.max(0, line), stamina: Math.max(0, stamina), slack, run, warn, end, reel, pull }
}

// Pulsaciones de la pelea: los pasos en los que cambias (empiezas a recoger, sueltas, recoges…), crecientes.
export function validToggles(toggles) {
  if (!Array.isArray(toggles) || toggles.length > MAX_FIGHT_TICKS) return false
  let prev = -1
  for (const t of toggles) {
    if (!Number.isSafeInteger(t) || t <= prev || t >= MAX_FIGHT_TICKS) return false
    prev = t
  }
  return true
}

// Repite una pelea entera hasta `ticks` pasos (o hasta que acabe) con las pulsaciones dadas.
export function simulateFight(f, toggles, ticks = MAX_FIGHT_TICKS) {
  const r = rng(f.seed)
  let st = fightStart(f)
  let reel = false
  let i = 0
  while (!st.end && st.tick < ticks) {
    while (i < toggles.length && toggles[i] <= st.tick) {
      reel = !reel
      i++
    }
    st = fightStep(st, f, reel, r)
  }
  return st
}

// --- Reparto ---
// Puestos que cobran y su parte del bote según cuántos han pescado algo.
export function splitOf(withFish) {
  if (withFish <= 0) return []
  if (withFish === 1) return [1]
  if (withFish === 2) return [0.65, 0.35]
  return [0.5, 0.3, 0.2]
}
// Lo que pone la Cofradía según cuántos se inscriben.
export const cofradiaOf = (n) => (n >= COFRADIA_MIN ? n * COFRADIA_PER : 0)
// El bote del campeonato (sin el Bote del Marlín).
export const potOf = (n) => n * ENTRY - Math.floor(n * ENTRY * BOTE_CUT) + cofradiaOf(n)
// Puntos de la Liga de la Cofradía (la semana) por puesto, en campeonatos de al menos 2 pescadores.
export const LEAGUE_POINTS = [10, 6, 4]
export const leaguePoints = (place, kg) => (kg > 0 ? (LEAGUE_POINTS[place] ?? 1) : 0)

// 12,4 kg · 850 g
export const fmtKg = (g) => (g >= 1000 ? `${(g / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: g < 100000 ? 1 : 0 })} kg` : `${g} g`)
