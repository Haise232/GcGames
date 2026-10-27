// Cuenta en Suiza (reglas en src/juegos/suiza.js): efectivo guardado donde Hacienda no mira.
// Una fila de juegos_suiza por jugador: { saldo, saldo_semana (lo ingresado en la semana «semana»), semana, movs (los
// últimos movimientos, solo para su dueño) }. Es secreta: nadie ve lo que tienen los demás.
//   suiza   cualquiera: a «estado», «ingresar» { importe } o «retirar» { importe }
import * as rules from '../../src/juegos/suiza.js'
import { weekOf } from './engine/week.mjs'

const MOVS = 12

export const SUIZA_ERRORS = {
  SUIZA_MIN: `El banco suizo no acepta ingresos de menos de ${rules.MIN_DEPOSIT.toLocaleString('es-ES', { useGrouping: 'always' })} €.`,
  SUIZA_FUNDS: 'No te llega el saldo de la semana.',
  SUIZA_EMPTY: 'No tienes tanto en Suiza.',
  SUIZA_HACIENDA: 'Tienes una declaración de Hacienda pendiente: hasta que la contestes, el banco suizo no acepta ingresos.',
}

const asAccount = (row) => ({ balance: Number(row?.saldo ?? 0), weekBalance: Number(row?.saldo_semana ?? 0), week: row?.semana ?? null })
const validAmount = (n) => Number.isSafeInteger(n) && n > 0

export function createSuiza({ db, now, move, feed }) {
  const remember = (movs, mov) => [mov, ...(movs ?? [])].slice(0, MOVS)

  async function deposit(user, msg, week) {
    if (!validAmount(msg.importe)) return { error: 'BAD_MESSAGE' }
    if (msg.importe < rules.MIN_DEPOSIT) return { error: 'SUIZA_MIN' }
    return db.tx(async (q) => {
      // Primero la cuenta de juegos (como en el resto) y después la de Suiza.
      const acc = (await q(`select saldo, hacienda from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])).rows[0]
      if (acc?.hacienda?.pend) return { error: 'SUIZA_HACIENDA' }
      if (!(await move(q, { [user.id]: -msg.importe }, true))) return { error: 'SUIZA_FUNDS' }
      const row = (await q(`select movs from public.juegos_suiza where usuario_id = $1 for update`, [user.id])).rows[0]
      const movs = remember(row?.movs, { t: now(), tipo: 'ingreso', importe: msg.importe })
      await q(
        `insert into public.juegos_suiza (usuario_id, saldo, saldo_semana, semana, movs) values ($1, $2, $2, $3, $4)
         on conflict (usuario_id) do update set
           saldo = juegos_suiza.saldo + $2,
           saldo_semana = case when juegos_suiza.semana = $3 then juegos_suiza.saldo_semana + $2 else $2 end,
           semana = $3, movs = $4, actualizado = now()`,
        [user.id, msg.importe, week, JSON.stringify(movs)],
      )
      return { result: { deposited: msg.importe } }
    })
  }

  async function withdraw(user, msg, week) {
    if (!validAmount(msg.importe)) return { error: 'BAD_MESSAGE' }
    return db.tx(async (q) => {
      await q(`select saldo from public.juegos_cuentas where usuario_id = $1 for update`, [user.id])
      const row = (await q(`select * from public.juegos_suiza where usuario_id = $1 for update`, [user.id])).rows[0]
      const account = asAccount(row)
      if (msg.importe > account.balance) return { error: 'SUIZA_EMPTY' }
      const out = rules.withdrawal(account, msg.importe, week)
      const left = rules.split(account, week).now - out.fromNow
      const movs = remember(row.movs, { t: now(), tipo: 'retirada', importe: msg.importe, neto: out.got })
      await q(`update public.juegos_suiza set saldo = saldo - $2, saldo_semana = $3, semana = $4, movs = $5, actualizado = now() where usuario_id = $1`, [
        user.id,
        msg.importe,
        left,
        week,
        JSON.stringify(movs),
      ])
      if (out.got > 0) await move(q, { [user.id]: out.got })
      if (out.fee > 0) await feed(q, out.fee)
      return { result: { withdrawn: msg.importe, got: out.got, fee: out.fee } }
    })
  }

  async function view(userId, week) {
    const row = (await db.query(`select * from public.juegos_suiza where usuario_id = $1`, [userId])).rows[0]
    const account = asAccount(row)
    return { ...account, ...rules.split(account, week), currentWeek: week, movs: row?.movs ?? [] }
  }

  const ACTIONS = { ingresar: deposit, retirar: withdraw }

  async function handle(user, msg, reply) {
    const week = weekOf(now()).key
    if (Object.hasOwn(ACTIONS, msg.a)) {
      const out = await ACTIONS[msg.a](user, msg, week)
      if (out.error) reply.error = { code: out.error }
      else reply.result = out.result
    } else if (msg.a !== 'estado') reply.error = { code: 'BAD_MESSAGE' }
    reply.suiza = await view(user.id, week)
  }

  return { handle }
}
