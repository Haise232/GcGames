// Pruebas del calendario del Cohete: rondas encadenadas (apuestas, vuelo hasta la explosión y pausa corta) que nunca se
// solapan ni se pasan de la hora, y roundAt/prevRound coherentes con él. node --test (npm test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BETS_MS, EPOCH_MS, FLIGHT_MS, PAUSE_MS, ROUNDS_PER_EPOCH, crashFromUniform, msFor, phaseOf, prevRound, roundAt, schedule } from './crash.js'

// Explosiones de mentira pero deterministas (como el HMAC del servidor).
const crashOf = (round) => crashFromUniform(((Math.imul(round, 2654435761) >>> 0) % 100000) / 100000)
const cache = new Map()
const sched = (epoch) => {
  if (!cache.has(epoch)) cache.set(epoch, schedule(epoch, crashOf))
  return cache.get(epoch)
}

test('las rondas se encadenan: apuestas, vuelo hasta explotar y pausa', () => {
  const epoch = 490000
  const rounds = sched(epoch)
  assert.ok(rounds.length > 50 && rounds.length < ROUNDS_PER_EPOCH)
  assert.equal(rounds[0].launch, epoch * EPOCH_MS + BETS_MS)
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]
    assert.equal(r.round, epoch * ROUNDS_PER_EPOCH + i)
    assert.equal(r.end, r.launch + msFor(crashOf(r.round)) + PAUSE_MS)
    if (i) assert.equal(r.launch, rounds[i - 1].end + BETS_MS)
  }
  // La última cabe entera aunque llegara a 25×.
  const last = rounds[rounds.length - 1]
  assert.ok(last.launch + FLIGHT_MS + PAUSE_MS <= (epoch + 1) * EPOCH_MS)
})

test('roundAt: la ronda en curso en cualquier instante y la primera de la hora siguiente al final', () => {
  const epoch = 490001
  const rounds = sched(epoch)
  for (const r of rounds.slice(0, 40)) {
    assert.equal(roundAt(r.launch - 1, sched).round, r.round) // apostando
    assert.equal(roundAt(r.launch + 1, sched).round, r.round) // volando
    assert.equal(roundAt(r.end - 1, sched).round, r.round) // en la pausa tras explotar
    assert.equal(roundAt(r.end, sched).round, r.round + 1 < epoch * ROUNDS_PER_EPOCH + rounds.length ? r.round + 1 : (epoch + 1) * ROUNDS_PER_EPOCH)
  }
  const last = rounds[rounds.length - 1]
  const first = roundAt(last.end + 1, sched)
  assert.equal(first.round, (epoch + 1) * ROUNDS_PER_EPOCH)
  assert.equal(first.launch, (epoch + 1) * EPOCH_MS + BETS_MS)
  assert.equal(roundAt((epoch + 1) * EPOCH_MS + 5, sched).round, first.round)
})

test('prevRound cruza la hora hacia atrás', () => {
  const epoch = 490002
  assert.equal(prevRound(epoch * ROUNDS_PER_EPOCH + 5, sched), epoch * ROUNDS_PER_EPOCH + 4)
  const before = sched(epoch - 1)
  assert.equal(prevRound(epoch * ROUNDS_PER_EPOCH, sched), before[before.length - 1].round)
})

test('tras explotar, la siguiente ronda abre apuestas en PAUSE_MS (no al cabo de 30 s)', () => {
  const r = sched(490003)[3]
  const crash = crashOf(r.round)
  const boom = r.launch + msFor(crash)
  assert.equal(phaseOf(boom - 1, r.launch, crash).phase, 'flight')
  assert.equal(phaseOf(boom, r.launch, crash).phase, 'pause')
  const next = roundAt(boom + PAUSE_MS, sched)
  assert.equal(next.round, r.round + 1)
  assert.equal(phaseOf(boom + PAUSE_MS, next.launch, null).left, BETS_MS)
})
