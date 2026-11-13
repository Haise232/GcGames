// Pruebas del motor de la Feria de las Islas: node --test (npm test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import * as F from './feria.js'

// El mismo azar que el servidor (HMAC por etiqueta), con una semilla fija.
function randOf(seed) {
  return (label) => {
    let block = 0
    let bytes = Buffer.alloc(0)
    let pos = 0
    return (n) => {
      if (pos + 4 > bytes.length) {
        bytes = createHmac('sha256', String(seed)).update(`${label}:${block++}`).digest()
        pos = 0
      }
      const v = bytes.readUInt32BE(pos)
      pos += 4
      return Math.floor((v / 2 ** 32) * n)
    }
  }
}

const user = (i) => ({ id: `u${i}`, name: `Jugador ${i}`, avatar: null })

function lobby(n, rounds = F.ROUNDS, t0 = 1000) {
  const s = F.newMatch(t0, '2026-W46', rounds)
  for (let i = 0; i < n; i++) assert.equal(F.addPlayer(s, user(i), t0 + i), null)
  return s
}

// Juega la partida entera: cada uno compra o mejora si le llega (o pasa, según choose) y tira en los duelos.
function play(s, seed, { choose = () => true, t = s.startAt } = {}) {
  const rnd = randOf(seed)
  F.advance(s, t, rnd)
  let guard = 0
  while (s.phase === 'play') {
    assert.ok(guard++ < 500, 'la partida no acaba')
    const cur = s.cur
    const at = cur.at + F.MOVE_MS
    for (const [seat, offer] of Object.entries(cur.offers)) {
      const id = s.players[seat].id
      if (offer.done) continue
      if (choose(s, Number(seat), offer)) F.accept(s, id, at)
      else F.pass(s, id, at)
    }
    for (const duel of cur.duels) for (const seat of duel.seats) F.tug(s, s.players[seat].id, 40 + seat, cur.duelEnd)
    F.advance(s, cur.end, rnd)
  }
  return s
}

const totalPrize = (s) => s.result.reduce((a, r) => a + r.prize, 0)

test('constantes: de 2 a 8 personas y modos de 8, 12 y 20 rondas', () => {
  assert.equal(F.SEATS, 8)
  assert.equal(F.MIN_PLAYERS, 2)
  assert.deepEqual(F.ROUND_MODES, [8, 12, 20])
  assert.equal(F.validRounds(20), 20)
  assert.equal(F.validRounds(7), F.ROUNDS)
})

test('la sala: no arranca con uno solo, se llena con 8 y no admite un noveno', () => {
  const s = lobby(1)
  assert.equal(s.startAt, null)
  assert.equal(F.due(s, 1e12), false)
  F.advance(s, 1e12, randOf(1))
  assert.equal(s.phase, 'lobby')
  assert.equal(F.addPlayer(s, user(1), 5000), null)
  assert.equal(s.startAt, 5000 + F.LOBBY_MS)
  for (let i = 2; i < 8; i++) F.addPlayer(s, user(i), 6000)
  assert.equal(s.startAt, 6000 + F.FULL_MS)
  assert.equal(F.addPlayer(s, user(9), 6001), 'FERIA_FULL')
  assert.equal(F.addPlayer(s, user(3), 6001), 'FERIA_IN')
})

test('si se queda uno solo en la sala, la cuenta atrás se para', () => {
  const s = lobby(2)
  assert.ok(s.startAt)
  assert.equal(F.removePlayer(s, 'u1'), null)
  assert.equal(s.startAt, null)
  assert.equal(F.due(s, 1e12), false)
})

test('ningún bot entra en la partida, ni con dos personas', () => {
  for (const n of [2, 3, 8]) {
    const s = lobby(n)
    F.advance(s, s.startAt, randOf(n))
    assert.equal(s.phase, 'play')
    assert.equal(s.players.length, n)
    assert.ok(s.players.every((p) => !p.bot))
    assert.equal(s.pot, n * F.ENTRY)
  }
})

test('solo quien abrió la sala elige las rondas, y solo antes de empezar', () => {
  const s = lobby(3)
  assert.equal(F.setRounds(s, 'u1', 8), 'FERIA_NOT_HOST')
  assert.equal(F.setRounds(s, 'u0', 9), 'BAD_MESSAGE')
  assert.equal(F.setRounds(s, 'u0', 20), null)
  assert.equal(s.rounds, 20)
  F.advance(s, s.startAt, randOf(2))
  assert.equal(F.setRounds(s, 'u0', 8), 'FERIA_RUNNING')
})

for (const rounds of F.ROUND_MODES) {
  test(`una partida de ${rounds} rondas juega exactamente ${rounds}`, () => {
    const s = play(lobby(4, rounds), `r${rounds}`)
    assert.equal(s.phase, 'done')
    assert.equal(s.round, rounds - 1)
  })
}

test('determinismo: la misma semilla da la misma partida', () => {
  const a = play(lobby(5), 'misma')
  const b = play(lobby(5), 'misma')
  assert.deepEqual(a.result, b.result)
  assert.deepEqual(a.owners, b.owners)
})

test('avance perezoso: ponerse al día de golpe da lo mismo que ir ronda a ronda (sin decisiones)', () => {
  const a = lobby(3)
  const b = lobby(3)
  const rnd = randOf('perezoso')
  // a: va preguntando cada ronda; b: nadie pregunta hasta que todo ha acabado.
  F.advance(a, a.startAt, rnd)
  while (a.phase === 'play') F.advance(a, a.cur.end, rnd)
  const out = F.advance(b, 1e13, rnd)
  assert.equal(out.finished, true)
  assert.deepEqual(a.result, b.result)
  assert.equal(b.endAt, a.endAt)
})

test('partida de 2: el bote entero (1000 €) es para el que acaba con más perras', () => {
  const s = play(lobby(2), 'dos')
  assert.equal(s.pot, 2 * F.ENTRY)
  assert.equal(totalPrize(s), s.pot)
  const best = Math.max(...s.players.map((p) => p.cash))
  const winners = s.result.filter((r) => r.prize > 0)
  assert.ok(winners.every((r) => r.cash === best))
  assert.equal(s.result[0].place, 1)
})

test('partida de 8: se conserva el dinero y hay un único ganador (o reparto exacto si empatan)', () => {
  for (let seed = 0; seed < 30; seed++) {
    const s = play(lobby(8), `ocho${seed}`, { choose: (st, seat) => seat % 2 === 0 })
    assert.equal(s.players.length, 8)
    assert.equal(s.pot, 4000)
    assert.equal(totalPrize(s), 4000)
    const top = s.result[0]
    for (const r of s.result) {
      if (r.prize > 0) {
        assert.equal(r.cash, top.cash)
        assert.equal(r.worth, top.worth)
      } else assert.ok(r.cash < top.cash || r.worth < top.worth)
    }
  }
})

test('desempate: con las mismas perras gana el de más patrimonio', () => {
  const s = lobby(3)
  s.pot = 1500
  s.players[0].cash = 900
  s.players[1].cash = 900
  s.players[2].cash = 400
  s.owners = { 1: 1 } // un puesto para el asiento 1
  const res = F.prizesFor(F.standings(s), s.players, s.pot)
  assert.deepEqual(
    res.map((r) => [r.seat, r.place, r.prize]),
    [
      [1, 1, 1500],
      [0, 2, 0],
      [2, 3, 0],
    ],
  )
})

test('empate total: el bote a partes iguales, sin crear ni perder un euro; el resto al primer asiento', () => {
  const s = lobby(3)
  s.pot = 1000 // 1000 entre 3 no es exacto
  for (const p of s.players) p.cash = 700
  const res = F.prizesFor(F.standings(s), s.players, s.pot)
  assert.deepEqual(
    res.map((r) => [r.seat, r.place, r.prize]),
    [
      [0, 1, 334],
      [1, 1, 333],
      [2, 1, 333],
    ],
  )
  assert.deepEqual(F.splitPot(4000, 3), [1334, 1333, 1333])
  assert.deepEqual(F.splitPot(1000, 2), [500, 500])
})

test('partidas antiguas con feriantes: los bots no cobran, el bote es de las personas', () => {
  const s = lobby(2)
  s.players.push({ id: null, name: 'Chacho', avatar: null, bot: true, cash: 5000, pos: 0 })
  s.pot = 1000
  s.players[0].cash = 100
  s.players[1].cash = 200
  const res = F.prizesFor(F.standings(s), s.players, s.pot)
  assert.equal(res[0].seat, 2)
  assert.equal(res[0].prize, 0)
  assert.equal(res.find((r) => r.seat === 1).prize, 1000)
})

test('alquiler: se paga lo que se tiene y el dinero de la partida no se crea al pagar', () => {
  const s = lobby(2)
  F.advance(s, s.startAt, randOf('alq'))
  // Asiento 1 dueño de todos los puestos; asiento 0 sin perras: no queda en negativo.
  for (const sq of F.BOARD.filter((b) => b.kind === 'puesto')) s.owners[sq.i] = 1
  s.players[0].cash = 10
  const rnd = randOf('alq2')
  F.advance(s, s.cur.end, rnd)
  assert.ok(s.players[0].cash >= 0)
})

test('construcción: el último nivel solo con la isla entera, y el alquiler sube por niveles', () => {
  const sq = F.stallsOf(0)[0]
  const owners = { [sq]: 0 }
  assert.equal(F.canUpgrade(owners, { [sq]: 0 }, sq), true)
  assert.equal(F.canUpgrade(owners, { [sq]: 1 }, sq), true)
  assert.equal(F.canUpgrade(owners, { [sq]: 2 }, sq), false)
  for (const o of F.stallsOf(0)) owners[o] = 0
  assert.equal(F.canUpgrade(owners, { [sq]: 2 }, sq), true)
  assert.equal(F.canUpgrade(owners, { [sq]: 3 }, sq), false)
  const rents = [0, 1, 2, 3].map((l) => F.rentOf(sq, l, true))
  for (let l = 1; l < 4; l++) assert.ok(rents[l] > rents[l - 1], `nivel ${l} paga más que ${l - 1}`)
  assert.equal(F.rentOf(sq, 0, true), 2 * F.rentOf(sq, 0, false))
})

test('al caer en tu puesto en el nivel 2 sin la isla, no hay oferta de mejora', () => {
  const s = lobby(2)
  const rnd = randOf('mejora')
  F.advance(s, s.startAt, rnd)
  // Coloca al asiento 0 de modo que caiga en su propio puesto la ronda siguiente: le damos todos los puestos a nivel 2.
  for (const b of F.BOARD.filter((x) => x.kind === 'puesto')) {
    s.owners[b.i] = 0
    s.levels[b.i] = 2
  }
  // Quitamos un puesto de cada isla para que ninguna esté completa.
  for (let k = 0; k < F.ISLANDS.length; k++) delete s.owners[F.stallsOf(k)[0]]
  F.advance(s, s.cur.end, rnd)
  for (const [seat, offer] of Object.entries(s.cur.offers)) if (Number(seat) === 0) assert.equal(offer.kind, 'buy')
  const ev = s.cur.steps[0].ev
  if (ev.k === 'home') assert.equal(ev.lock, true)
})

test('la ventana de decisión se cierra antes cuando todos han decidido', () => {
  let checked = 0
  for (let seed = 0; seed < 60 && checked < 5; seed++) {
    const s = lobby(2)
    const rnd = randOf(`cierre${seed}`)
    F.advance(s, s.startAt, rnd)
    while (s.phase === 'play') {
      const cur = s.cur
      const open = Object.entries(cur.offers).filter(([seat, o]) => !o.done && s.players[seat].cash >= o.cost)
      if (!cur.duels.length && open.length) {
        const fullEnd = cur.end
        const t = cur.at + F.MOVE_MS + 1000
        const [first, ...rest] = open
        F.pass(s, s.players[first[0]].id, t)
        if (rest.length) {
          assert.equal(cur.end, fullEnd, 'con alguien sin decidir no se cierra')
          for (const [seat] of rest) F.pass(s, s.players[seat].id, t)
        }
        assert.equal(cur.end, t + F.REVEAL_MS)
        assert.ok(cur.early)
        assert.equal(F.pass(s, s.players[first[0]].id, t), 'FERIA_NO_OFFER')
        checked++
      }
      F.advance(s, cur.end, rnd)
    }
  }
  assert.ok(checked > 0)
})

test('comprar en una ronda con duelo no acorta la ronda', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = lobby(8)
    const rnd = randOf(`duelo${seed}`)
    F.advance(s, s.startAt, rnd)
    for (let k = 0; k < 6 && s.phase === 'play'; k++) {
      const cur = s.cur
      const offer = Object.entries(cur.offers).find(([, o]) => !o.done)
      if (cur.duels.length && offer) {
        const end = cur.end
        F.accept(s, s.players[offer[0]].id, cur.at + F.MOVE_MS)
        assert.equal(cur.end, end)
        return
      }
      F.advance(s, cur.end, rnd)
    }
  }
  assert.fail('no se encontró una ronda con duelo y oferta')
})

test('duelo: gana quien más tira y se queda el puesto gratis', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = lobby(8)
    const rnd = randOf(`tira${seed}`)
    F.advance(s, s.startAt, rnd)
    const cur = s.cur
    if (!cur.duels.length) continue
    const duel = cur.duels[0]
    const [a, b] = duel.seats
    const cashA = s.players[a].cash
    assert.equal(F.tug(s, s.players[a].id, 9999, cur.duelEnd), null)
    F.tug(s, s.players[b].id, 3, cur.duelEnd)
    assert.equal(duel.taps[a], F.MAX_TAPS) // no se pueden apuntar más tirones de los posibles
    F.advance(s, cur.resolveAt, rnd)
    assert.equal(duel.winner, a)
    assert.equal(s.owners[duel.sq], a)
    assert.equal(s.players[a].cash, cashA)
    return
  }
  assert.fail('no hubo ningún duelo')
})

test('las acciones a destiempo se rechazan', () => {
  const s = lobby(2)
  assert.equal(F.accept(s, 'u0', 0), 'BAD_PHASE')
  F.advance(s, s.startAt, randOf('tiempo'))
  assert.equal(F.accept(s, 'nadie', s.cur.at + F.MOVE_MS), 'FERIA_OUT')
  assert.equal(F.removePlayer(s, 'u0'), 'FERIA_RUNNING')
  assert.equal(F.addPlayer(s, user(5), 0), 'FERIA_RUNNING')
})

test('migración: un estado de la versión 1 en curso sigue y acaba con el bote de las personas', () => {
  // Estado v1 tal como lo guardaba la versión anterior: 2 personas y 2 feriantes, a mitad de partida.
  const s = lobby(2)
  F.advance(s, s.startAt, randOf('v1'))
  const v1 = JSON.parse(JSON.stringify(s))
  v1.v = 1
  delete v1.rounds
  delete v1.pot
  v1.players.push({ id: null, name: 'Chacho', avatar: null, bot: true, cash: 1500, pos: 0 })
  v1.players.push({ id: null, name: 'Gara', avatar: null, bot: true, cash: 1500, pos: 0 })
  for (const st of [v1.cur.steps]) while (st.length < 4) st.push({ dice: [1, 1], from: 0, to: 2, lap: false, ev: null })
  const m = F.migrateState(v1)
  assert.equal(m.v, F.VERSION)
  assert.equal(m.rounds, 12)
  assert.equal(m.pot, 1000)
  F.advance(m, 1e13, randOf('v1'))
  assert.equal(m.phase, 'done')
  assert.equal(m.round, 11)
  assert.equal(totalPrize(m), 1000)
  assert.ok(m.result.filter((r) => r.prize > 0).every((r) => !m.players[r.seat].bot))
})

test('migración: una sala v1 con uno solo espera a otra persona; lo desconocido se descarta', () => {
  const s = lobby(1)
  s.v = 1
  s.startAt = 99
  delete s.rounds
  const m = F.migrateState(s)
  assert.equal(m.startAt, null)
  assert.equal(F.due(m, 1e12), false)
  assert.equal(F.migrateState({ v: 99 }), null)
  assert.equal(F.migrateState({}), null)
  assert.equal(F.migrateState(null), null)
  const cur = lobby(2)
  assert.equal(F.migrateState(cur), cur)
})
