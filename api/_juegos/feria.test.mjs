// Pruebas del servidor de la Feria con una base de datos de mentira en memoria: el dinero se conserva (lo cobrado en
// inscripciones = lo que se paga al ganador) y el reparto no se paga dos veces. node --test (npm test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as feria from '../../src/juegos/feria/feria.js'
import { createFeria } from './feria.mjs'

// Solo entiende las consultas que hace feria.mjs.
function fakeDb(balances) {
  const rows = new Map() // ronda → datos
  const fed = []
  const clone = (x) => JSON.parse(JSON.stringify(x))
  async function q(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ')
    if (s.includes(`values ('feria', 0, '{}'::jsonb)`)) {
      if (!rows.has(0)) rows.set(0, {})
      return { rows: [] }
    }
    if (s.startsWith('select datos from public.juegos_rondas') && s.includes('ronda = 0')) return { rows: rows.has(0) ? [{ datos: clone(rows.get(0)) }] : [] }
    if (s.includes(`values ('feria', 0, $1)`)) {
      rows.set(0, JSON.parse(params[0]))
      return { rows: [] }
    }
    if (s.includes(`values ('feria', $1, $2)`)) {
      if (rows.has(params[0])) return { rows: [] }
      rows.set(params[0], JSON.parse(params[1]))
      return { rows: [{ ronda: params[0] }] }
    }
    if (s.startsWith('select ronda, datos')) return { rows: [...rows].filter(([k]) => k > 0).map(([ronda, datos]) => ({ ronda, datos: clone(datos) })) }
    if (s.startsWith('select saldo')) return { rows: [{ saldo: balances[params[0]] ?? 0 }] }
    throw new Error(`Consulta inesperada: ${s}`)
  }
  const db = { query: q, tx: (fn) => fn(q) }
  const move = async (_q, deltas, check = false) => {
    if (check && Object.entries(deltas).some(([id, d]) => (balances[id] ?? 0) + d < 0)) return false
    for (const [id, d] of Object.entries(deltas)) balances[id] = (balances[id] ?? 0) + d
    return true
  }
  const feed = async (_q, amount) => fed.push(amount)
  return { db, rows, move, feed, fed }
}

async function run(n, rounds = 8) {
  const balances = Object.fromEntries(Array.from({ length: n }, (_, i) => [`u${i}`, 1000]))
  const { db, rows, move, feed, fed } = fakeDb(balances)
  let clock = Date.now()
  const server = createFeria({ db, now: () => clock, secret: 'prueba', move, feed })
  const users = Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `J${i}`, avatar: null }))
  const send = async (u, msg) => {
    const reply = { me: {} }
    await server.handle(u, msg, reply)
    return reply
  }
  const first = await send(users[0], { a: 'join', rounds })
  assert.equal(first.error, undefined)
  for (const u of users.slice(1)) assert.equal((await send(u, { a: 'join' })).error, undefined)
  const lobby = await send(users[0], { a: 'sync' })
  assert.equal(lobby.feria.pot, n * feria.ENTRY, 'el bote de la sala es lo cobrado')
  assert.equal(lobby.feria.rounds, rounds)
  for (const u of users) assert.equal(balances[u.id], 1000 - feria.ENTRY)
  // Pasa el tiempo: todo el mundo compra cuando puede.
  let guard = 0
  for (;;) {
    assert.ok(guard++ < 1000)
    const v = (await send(users[0], { a: 'sync' })).feria
    if (v.phase === 'done') break
    if (v.phase === 'play') {
      clock = Math.max(clock, v.cur.at + feria.MOVE_MS)
      for (const [seat, o] of Object.entries(v.cur.offers)) if (!o.done) await send(users[seat], { a: Number(seat) % 2 ? 'pass' : 'take', r: v.round })
      clock = Math.max(clock + 1, v.cur.end)
    } else clock = v.startAt
  }
  return { balances, rows, fed, send, users, server, setClock: (t) => (clock = t) }
}

for (const n of [2, 8]) {
  test(`servidor, ${n} jugadores: el ganador cobra el bote entero y el dinero se conserva`, async () => {
    const { balances, rows, fed, send, users } = await run(n)
    const state = rows.get(0)
    const total = Object.values(balances).reduce((a, b) => a + b, 0)
    assert.equal(total, n * 1000, 'ni se crea ni se pierde dinero')
    assert.deepEqual(fed, [], 'la casa no se queda nada')
    const done = (await send(users[0], { a: 'sync' })).feria
    assert.equal(done.pot, n * feria.ENTRY)
    const winners = state.result.filter((r) => r.prize > 0)
    for (const r of state.result) assert.equal(balances[`u${r.seat}`], 1000 - feria.ENTRY + r.prize)
    assert.equal(
      winners.reduce((a, r) => a + r.prize, 0),
      n * feria.ENTRY,
    )
    const hist = rows.get(state.id)
    assert.equal(hist.pot, n * feria.ENTRY)
    assert.equal(hist.players.length, n)
  })
}

test('servidor: si el reparto se ejecuta otra vez, no se paga dos veces', async () => {
  const { balances, rows, send, users } = await run(2)
  const before = { ...balances }
  // Simula que la fila de la sala vuelve a quedar sin repartir (p. ej. un reintento): el historial ya existe.
  const state = rows.get(0)
  state.paid = false
  state.phase = 'play'
  state.round = state.rounds - 1
  rows.set(0, state)
  await send(users[0], { a: 'sync' })
  assert.equal(rows.get(0).phase, 'done')
  assert.deepEqual(balances, before)
})

test('servidor: una sala guardada con la versión 1 se sigue leyendo', async () => {
  const balances = { u0: 500, u1: 500 }
  const { db, rows, move, feed } = fakeDb(balances)
  const t = Date.now()
  const server = createFeria({ db, now: () => t, secret: 'x', move, feed })
  const old = feria.newMatch(t - 1000, 'x')
  feria.addPlayer(old, { id: 'u0', name: 'A' }, t - 1000)
  old.v = 1
  old.startAt = t + 99999
  delete old.rounds
  rows.set(0, old)
  const reply = { me: {} }
  await server.handle({ id: 'u1', name: 'B' }, { a: 'join' }, reply)
  assert.equal(reply.error, undefined)
  assert.equal(reply.feria.players.length, 2)
  assert.equal(rows.get(0).v, feria.VERSION)
  assert.equal(reply.feria.pot, 1000)
})
