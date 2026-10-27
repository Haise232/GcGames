// Hacienda: la gente gana demasiado y lo que se lleva va a la jaula del bingo.
//
// - Tramos: al pasar de 100.000 €, 200.000 €, 300.000 €… (una vez cada uno por semana) llega la declaración. Se puede
//   pagar el tipo del tramo (taxRate) o «declarar de menos»: a cara o cruz, o no pagas nada o te pillan y pagas el doble.
//   El importe se fija al llegar la declaración (sobre el saldo de ese momento). Si no contestas en DECIDE_MS, se paga.
//   O «sobornar al inspector»: le pasas un sobre (BRIBE_PCT % de lo que pide). Con BRIBE_OK % lo acepta y no pagas nada
//   más; si no, te denuncia: pagas el doble, pierdes el sobre y pasas JAIL_MS en la cárcel sin poder jugar (game.mjs).
// - Inspección sorpresa: mientras tengas 100.000 € o más, en cada rato de SLOT_MS el inspector puede pasar a por un
//   INSPECT_RATE % del saldo (el sorteo sale de HMAC(secreto, usuario y rato): da igual cuántas peticiones hagas). A quien
//   se libró declarando de menos le visita más a menudo y le cobra más.
// - Redada: el master manda a Hacienda a por todos los que pasen de cierto saldo (desde el panel de la banca).
// Lo cobrado sale en un aviso para el que paga (la animación grande). Los demás no se enteran: el aviso «hacienda_todos»
// solo lo ve el master en el historial de la banca.
// Estado de cada cuenta en juegos_cuentas.hacienda: { tramo, pend: { tramo, rate, amount, base, desde }, fraude, insp,
// carcel } (carcel: hasta cuándo está preso).
// No se cobra a quien está sentado en una mesa de póker o blackjack: espera a que se levante.
import { randomInt } from 'node:crypto'
import { BANK_TOPIC } from './banca.mjs'
import { hmacStream } from './solo.mjs'

export const TAX_STEP = 100_000
export const taxRate = (tramo) => Math.min(50, 15 + 5 * tramo) // 100k: 20 %, 200k: 25 %… hasta el 50 %
export const tramoOf = (balance) => Math.floor(balance / TAX_STEP)
export const DECIDE_MS = 90_000
const SLOT_MS = 10 * 60_000
const INSPECT_P = 0.06
const INSPECT_P_FRAUD = 0.25
const INSPECT_RATE = 10
const INSPECT_RATE_FRAUD = 30
export const BRIBE_PCT = 15
const BRIBE_OK = 50
export const JAIL_MS = 5 * 60_000
export const bribeOf = (amount) => Math.max(1, Math.floor((amount * BRIBE_PCT) / 100))
// ¿Está en la cárcel? (hacienda: el estado de la cuenta)
export const jailedUntil = (hacienda, t) => (hacienda?.carcel > t ? hacienda.carcel : null)
export const RAID_PCTS = [10, 20, 30]
export const RAID_FLOORS = [50_000, 100_000, 200_000]

export function createHacienda({ db, now, secret, move, feed, ping }) {
  const inspectorComes = (userId, slot, fraude) =>
    hmacStream(secret, `hacienda:${userId}:${slot}`)() / 2 ** 32 < (fraude ? INSPECT_P_FRAUD : INSPECT_P)

  // Cobra dentro de una transacción y deja los dos avisos. Devuelve lo que pagó (lo que haya si no le llega).
  async function charge(q, userId, name, amount, datos) {
    const balance = Number((await q(`select saldo from public.juegos_cuentas where usuario_id = $1`, [userId])).rows[0]?.saldo ?? 0)
    const paid = Math.max(0, Math.min(amount, balance))
    if (paid > 0) {
      await move(q, { [userId]: -paid })
      await feed(q, paid)
    }
    await q(`insert into public.juegos_avisos (usuario_id, tipo, importe, datos) values ($1, 'hacienda', $2, $3)`, [userId, paid, datos])
    if (paid > 0) {
      await q(`insert into public.juegos_avisos (usuario_id, sujeto, tipo, importe, texto, datos) values (null, $1, 'hacienda_todos', $2, $3, $4)`, [
        userId,
        paid,
        name,
        datos,
      ])
    }
    return paid
  }

  // Al empezar cada petición de Juegos (account: lo que leyó touchAccount). Casi siempre no consulta nada.
  async function check(user, account) {
    if (account.mesa) return null
    const state = account.hacienda ?? {}
    const balance = Number(account.saldo)
    const t = now()
    const slot = Math.floor(t / SLOT_MS)
    if (state.pend) {
      if (t > state.pend.desde + DECIDE_MS) return (await decide(user, 'pagar', true)).balance ?? null
      return null
    }
    const declare = tramoOf(balance) > (state.tramo ?? 0)
    const inspect = !declare && balance >= TAX_STEP && state.insp !== slot && inspectorComes(user.id, slot, state.fraude)
    if (!declare && !inspect) return null
    const out = await db.tx(async (q) => {
      const row = (await q(`select saldo, hacienda, mesa, nombre from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])).rows[0]
      if (!row || row.mesa) return null
      const s = row.hacienda ?? {}
      const saldo = Number(row.saldo)
      if (s.pend) return null
      const tramo = tramoOf(saldo)
      if (tramo > (s.tramo ?? 0)) {
        const rate = taxRate(tramo)
        const pend = { tramo, rate, base: saldo, amount: Math.floor((saldo * rate) / 100), desde: t }
        await q(`update public.juegos_cuentas set hacienda = $2 where usuario_id = $1`, [user.id, { ...s, pend }])
        return { saldo }
      }
      if (saldo < TAX_STEP || s.insp === slot || !inspectorComes(user.id, slot, s.fraude)) return null
      const rate = s.fraude ? INSPECT_RATE_FRAUD : INSPECT_RATE
      await q(`update public.juegos_cuentas set hacienda = $2 where usuario_id = $1`, [user.id, { ...s, insp: slot, fraude: false }])
      const paid = await charge(q, user.id, row.nombre ?? user.name, Math.floor((saldo * rate) / 100), {
        kind: 'inspeccion',
        rate,
        fraude: Boolean(s.fraude),
        base: saldo,
      })
      return { saldo: saldo - paid }
    })
    if (!out) return null
    await ping(BANK_TOPIC)
    return out.saldo
  }

  // La declaración pendiente: «pagar», «fraude» (declarar de menos) o «soborno». auto: se acabó el tiempo y paga sola.
  async function decide(user, choice, auto = false) {
    if (choice !== 'pagar' && choice !== 'fraude' && choice !== 'soborno') return { error: 'BAD_MESSAGE' }
    const out = await db.tx(async (q) => {
      const row = (await q(`select saldo, hacienda, nombre from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])).rows[0]
      const s = row?.hacienda ?? {}
      const pend = s.pend
      if (!pend) return null
      const fraud = choice === 'fraude' && !auto
      const bribing = choice === 'soborno' && !auto
      const caught = fraud && randomInt(2) === 0
      const bribe = bribeOf(pend.amount)
      const bought = bribing && randomInt(100) < BRIBE_OK
      const carcel = bribing && !bought ? now() + JAIL_MS : null
      let amount = fraud ? (caught ? pend.amount * 2 : 0) : pend.amount
      let kind = fraud ? (caught ? 'pillado' : 'escapado') : auto ? 'auto' : 'tramo'
      if (bribing) {
        amount = bought ? bribe : pend.amount * 2 + bribe
        kind = bought ? 'sobornado' : 'cazado'
      }
      const datos = { kind, rate: pend.rate, tramo: pend.tramo, base: pend.base, amount: pend.amount, ...(bribing ? { bribe, carcel } : {}) }
      await q(`update public.juegos_cuentas set hacienda = $2 where usuario_id = $1`, [
        user.id,
        { ...s, pend: null, tramo: pend.tramo, fraude: s.fraude || (fraud && !caught), ...(carcel ? { carcel } : {}) },
      ])
      // Quien se escapa no sale en ningún aviso: ni el suyo (ya lo ve en la respuesta) ni el de todos.
      let paid = 0
      if (kind === 'auto' || amount > 0) {
        paid = auto ? await charge(q, user.id, row.nombre, amount, datos) : await chargeQuiet(q, user.id, row.nombre, amount, datos)
      }
      return { ...datos, paid, balance: Number(row.saldo) - paid }
    })
    if (!out) return { error: 'HACIENDA_NONE' }
    await ping(BANK_TOPIC)
    return out
  }

  // Como charge, pero sin el aviso personal (el que decide ya ve su resultado en la respuesta).
  async function chargeQuiet(q, userId, name, amount, datos) {
    const balance = Number((await q(`select saldo from public.juegos_cuentas where usuario_id = $1`, [userId])).rows[0]?.saldo ?? 0)
    const paid = Math.max(0, Math.min(amount, balance))
    if (paid <= 0) return 0
    await move(q, { [userId]: -paid })
    await feed(q, paid)
    await q(`insert into public.juegos_avisos (usuario_id, sujeto, tipo, importe, texto, datos) values (null, $1, 'hacienda_todos', $2, $3, $4)`, [
      userId,
      paid,
      name,
      datos,
    ])
    return paid
  }

  // Lo que la banca enseña de Hacienda: la declaración pendiente (con hasta cuándo se puede contestar y el sobre del
  // soborno) y, si estás preso, hasta cuándo.
  async function pending(userId) {
    const { rows } = await db.query(`select hacienda from public.juegos_cuentas where usuario_id = $1`, [userId])
    const s = rows[0]?.hacienda
    const pend = s?.pend
    return {
      declaracion: pend
        ? { tramo: pend.tramo, rate: pend.rate, base: pend.base, amount: pend.amount, bribe: bribeOf(pend.amount), hasta: pend.desde + DECIDE_MS }
        : null,
      carcel: jailedUntil(s, now()),
    }
  }

  // Redada del master: un pct del saldo de todos los que tengan floor o más (menos los sentados en una mesa).
  async function raid(pct, floor) {
    if (!RAID_PCTS.includes(pct) || !RAID_FLOORS.includes(floor)) return null
    const out = await db.tx(async (q) => {
      const rows = (
        await q(`select usuario_id, saldo from public.juegos_cuentas where saldo >= $1 and mesa is null order by usuario_id for update`, [floor])
      ).rows
      const deltas = {}
      let total = 0
      for (const r of rows) {
        const amount = Math.floor((Number(r.saldo) * pct) / 100)
        if (amount <= 0) continue
        deltas[r.usuario_id] = -amount
        total += amount
        await q(`insert into public.juegos_avisos (usuario_id, tipo, importe, datos) values ($1, 'hacienda', $2, $3)`, [
          r.usuario_id,
          amount,
          { kind: 'redada', rate: pct, base: Number(r.saldo), floor },
        ])
      }
      if (!total) return { personas: 0, total: 0 }
      await move(q, deltas)
      await feed(q, total)
      const n = Object.keys(deltas).length
      await q(`insert into public.juegos_avisos (usuario_id, tipo, importe, texto, datos) values (null, 'hacienda_todos', $1, $2, $3)`, [
        total,
        n === 1 ? '1 jugador' : `${n} jugadores`,
        { kind: 'redada', rate: pct, floor },
      ])
      return { personas: n, total }
    })
    if (out?.personas) await Promise.all([ping(BANK_TOPIC), ping('juegos-lobby')])
    return out
  }

  return { check, decide, pending, raid }
}
