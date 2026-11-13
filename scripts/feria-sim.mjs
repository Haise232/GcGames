// Simulador de la Feria de las Islas: juega N partidas con el motor de verdad (src/juegos/feria/feria.js) y saca
// estadísticas de balance: quién gana según cómo juega, ventaja por asiento, duración y perras al acabar.
//   node scripts/feria-sim.mjs [partidas=1000] [jugadores=2..8 o «todos»] [rondas=8|12|20 o «todas»]
// Las estrategias se reparten por asiento rotando en cada partida, para que el asiento no sesgue la comparación.
import { createHmac } from 'node:crypto'
import * as F from '../src/juegos/feria/feria.js'

const games = Number(process.argv[2] ?? 1000)
const sizes = process.argv[3] && process.argv[3] !== 'todos' ? [Number(process.argv[3])] : [2, 4, 8]
const modes = process.argv[4] && process.argv[4] !== 'todas' ? [Number(process.argv[4])] : F.ROUND_MODES

function randOf(seed) {
  return (label) => {
    let block = 0
    let bytes = Buffer.alloc(0)
    let pos = 0
    return (n) => {
      if (pos + 4 > bytes.length) {
        bytes = createHmac('sha256', seed).update(`${label}:${block++}`).digest()
        pos = 0
      }
      const v = bytes.readUInt32BE(pos)
      pos += 4
      return Math.floor((v / 2 ** 32) * n)
    }
  }
}

// Cómo decide cada jugador ante una oferta (comprar o mejorar).
const STRATEGIES = {
  nunca: () => false, // no compra nada: guarda las perras
  prudente: (p, o) => p.cash - o.cost >= 400,
  compra: (p, o) => o.kind === 'buy', // compra todo lo que puede, no mejora
  todo: () => true, // compra y mejora siempre que le llega
}
const names = Object.keys(STRATEGIES)

function playOne(n, rounds, seed, offset) {
  const s = F.newMatch(1, 'sim', rounds)
  const strat = []
  for (let i = 0; i < n; i++) {
    F.addPlayer(s, { id: `u${i}`, name: `J${i}` }, 1)
    strat.push(names[(i + offset) % names.length])
  }
  const rnd = randOf(seed)
  const tapRand = rnd('taps')
  F.advance(s, s.startAt, rnd)
  let early = 0
  let duels = 0
  while (s.phase === 'play') {
    const cur = s.cur
    const t = cur.at + F.MOVE_MS + 500
    for (const [seat, offer] of Object.entries(cur.offers)) {
      const p = s.players[seat]
      if (offer.done || p.cash < offer.cost) continue
      if (STRATEGIES[strat[seat]](p, offer)) F.accept(s, p.id, t)
      else F.pass(s, p.id, t)
    }
    duels += cur.duels.length
    for (const duel of cur.duels) for (const seat of duel.seats) F.tug(s, s.players[seat].id, 40 + tapRand(60), cur.duelEnd)
    if (cur.early) early++
    F.advance(s, cur.end, rnd)
  }
  return { s, strat, early, duels }
}

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`
const avg = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length)

for (const n of sizes) {
  for (const rounds of modes) {
    const wins = Object.fromEntries(names.map((k) => [k, 0]))
    const plays = Object.fromEntries(names.map((k) => [k, 0]))
    const cashBy = Object.fromEntries(names.map((k) => [k, []]))
    const seatWins = Array(n).fill(0)
    const lengths = []
    let early = 0
    let duels = 0
    let ties = 0
    for (let g = 0; g < games; g++) {
      const out = playOne(n, rounds, `sim:${n}:${rounds}:${g}`, g % names.length)
      const { s, strat } = out
      const paid = s.result.reduce((a, r) => a + r.prize, 0)
      if (paid !== s.pot || s.pot !== n * F.ENTRY) throw new Error(`Dinero sin cuadrar en la partida ${g}: bote ${s.pot}, pagado ${paid}`)
      const winners = s.result.filter((r) => r.prize > 0)
      if (winners.length > 1) ties++
      for (const r of s.result) {
        plays[strat[r.seat]]++
        cashBy[strat[r.seat]].push(r.cash)
      }
      for (const w of winners) {
        wins[strat[w.seat]] += 1 / winners.length
        seatWins[w.seat] += 1 / winners.length
      }
      lengths.push(s.endAt - s.startAt)
      early += out.early
      duels += out.duels
    }
    console.log(`\n== ${n} jugadores · ${rounds} rondas · ${games} partidas ==`)
    console.log(`Duración media: ${(avg(lengths) / 60000).toFixed(1)} min · rondas cerradas antes: ${(early / games).toFixed(1)} por partida · duelos: ${(duels / games).toFixed(1)} por partida · empates al primero: ${ties}`)
    for (const k of names) {
      if (!plays[k]) continue
      console.log(`  ${k.padEnd(9)} gana el ${pct(wins[k], plays[k])} de las veces que juega (lo justo: ${pct(1, n)}) · perras medias al final ${Math.round(avg(cashBy[k]))}`)
    }
    console.log(`  Victorias por asiento: ${seatWins.map((w, i) => `${i}: ${pct(w, games)}`).join(' · ')}`)
  }
}
