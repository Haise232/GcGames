// Ajuste de los premios de Criaturas de las Islas: simula muchos combates con la jugada «de manual» (bestMove y
// bestSwitch, la de alguien que juega bien) contra el rival de cada dificultad, con equipos y niveles al azar, y dice
// qué multiplicador dejaría el retorno en el 96 %. Uso: node scripts/criaturas-ajuste.mjs [combates]
import { randomInt } from 'node:crypto'
import { TIERS, TIER_IDS, WILD_IDS, alive, bestMove, bestSwitch, fighter, formAt, rivalTeam, turn } from '../src/juegos/criaturas/criaturas.js'

const N = Number(process.argv[2] ?? 20000)
const rand = (n) => randomInt(n)
for (const tier of TIER_IDS) {
  let wins = 0
  let naive = 0
  for (let i = 0; i < N; i++) {
    const size = 1 + rand(3)
    const lvl = 5 + rand(26)
    const mine = Array.from({ length: size }, () => {
      const l = Math.max(2, lvl + rand(5) - 2)
      return fighter(formAt(WILD_IDS[rand(WILD_IDS.length)], l), l)
    })
    const rival = rivalTeam(mine.map((c) => c.lvl), tier, rand)
    for (const smart of [true, false]) {
      let b = { mine: mine.map((c) => ({ ...c })), rival: rival.map((c) => ({ ...c })), a: 0, b: 0, need: null }
      let end = null
      for (let t = 0; t < 200 && !end; t++) {
        let action
        if (b.need === 'switch') action = { kind: 'switch', to: smart ? bestSwitch(b) : alive(b.mine)[0] }
        else if (smart) action = { kind: 'move', move: bestMove(b.mine[b.a], b.rival[b.b]) }
        else action = { kind: 'move', move: 'placaje' } // quien solo da placajes
        const r = turn(b, action, rand)
        b = r.battle
        end = r.end
      }
      if (end === 'win') smart ? wins++ : naive++
    }
  }
  const p = wins / N
  console.log(
    `${tier.padEnd(8)} gana ${(p * 100).toFixed(1)} % · ×${TIERS[tier].mult} → retorno ${(p * TIERS[tier].mult * 100).toFixed(1)} %` +
      ` (para el 96 %: ×${(0.96 / p).toFixed(2)}) · solo placajes: ${((naive / N) * TIERS[tier].mult * 100).toFixed(1)} %`,
  )
}
