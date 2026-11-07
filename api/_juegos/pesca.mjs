// Campeonato de Pesca en vivo: un campeonato para todos cada pesca.ROUND_MS (reglas en src/juegos/pesca/pesca.js).
// El mar de cada ronda (qué peces, cuándo y por dónde) sale de HMAC(secreto, ronda), como la ruleta, y el servidor solo
// enseña los que están a punto de entrar en el agua (LOOKAHEAD_MS): nadie sabe de antemano cuándo llega el marlín.
// Lanzar, picar y pelear se comprueban aquí: el anzuelo cae donde y cuando dice castMs, pica el pez libre más cercano
// en ese momento (el primero que lo engancha se lo queda: los lanzamientos de una ronda van de uno en uno) y la pelea se
// repite con las pulsaciones del navegador (simulateFight) para ver si lo sacó.
// La partida de cada uno va en juegos_solo (juego «pesca»): { v, round, week, at, paid, lure, hook, catches, lost, ready,
// last } (lure: el último lanzamiento sin pez { x, y, at, land }; hook: el pez enganchado { fish, at } con at el momento
// en el que pica; catches: [{ f, sp, g, at }]; lost: ids de los que se soltaron; ready: cuándo se puede volver a lanzar).
// Al acabar la pesca, la primera petición reparte (settleDue): el bote del campeonato al podio, el Bote del Marlín a
// quien lo saque, y el campeonato queda en juegos_rondas (la ronda 0 guarda el Bote del Marlín). Todo se borra el
// domingo con el reinicio, así que la Liga de la Cofradía (puntos por puesto) es la de la semana.
//   pesca   cualquiera: a «sync», «join», «cast» (x, y, at: la hora del clic) o «land» (fish, toggles, ticks)
import * as pesca from '../../src/juegos/pesca/pesca.js'
import { hmacStream } from './solo.mjs'
import { weekOf } from './engine/week.mjs'

export const PESCA_TOPIC = 'juegos-pesca'
const JOIN_GRACE_MS = 600 // una inscripción que salió a tiempo del navegador y llega un poco tarde
const CAST_LAG_MS = 2500 // un lanzamiento cuenta desde que se hizo en el navegador (at), con este retraso como mucho
const LAND_GRACE_MS = 1500 // la pelea va con el reloj del navegador: lo que se le perdona de retraso
const PAY_PAD_MS = 2500 // se reparte cuando ya no puede llegar ninguna pelea
const FEED = 14
const LEAGUE = 10
const MEMO_MS = 4000

export const PESCA_ERRORS = {
  PESCA_CLOSED: 'La inscripción de este campeonato ya está cerrada: apúntate al siguiente.',
  PESCA_IN: 'Ya estás inscrito en este campeonato.',
  PESCA_OUT: 'No estás inscrito en este campeonato.',
  PESCA_WAIT: 'El anzuelo aún no ha vuelto.',
  PESCA_HOOKED: 'Ya tienes un pez enganchado.',
  PESCA_FIGHT: 'Esa pelea no cuadra.',
}

const seas = new Map()
// El mar de una ronda (caché: se mira en cada petición).
export function seaOfRound(secret, round) {
  const hit = seas.get(round)
  if (hit) return hit
  const sea = pesca.seaOf(hmacStream(secret, `pesca:${round}`)())
  if (seas.size > 200) seas.clear()
  seas.set(round, sea)
  return sea
}

// Gramos y la hora de la última captura (desempata: llegó antes) de una fila.
const totalOf = (estado) => (estado.catches ?? []).reduce((sum, c) => sum + c.g, 0)
const lastAtOf = (estado) => Math.max(0, ...(estado.catches ?? []).map((c) => c.at))

// Clasificación de un campeonato: las filas ordenadas por kilos, la última captura y la inscripción.
function standingsOf(rows) {
  return rows
    .map((r) => ({ r, g: totalOf(r.estado), lastAt: lastAtOf(r.estado) }))
    .sort((a, b) => b.g - a.g || a.lastAt - b.lastAt || Number(a.r.estado.at) - Number(b.r.estado.at))
}

// Ids de los peces que ya no están libres en una ronda.
function takenOf(rows) {
  const taken = new Map()
  for (const r of rows) {
    const e = r.estado
    for (const c of e.catches ?? []) taken.set(c.f, { owner: r.usuario_id, state: 'caught' })
    for (const id of e.lost ?? []) taken.set(id, { owner: r.usuario_id, state: 'lost' })
    if (e.hook) taken.set(e.hook.fish, { owner: r.usuario_id, state: 'hook', at: e.hook.at })
  }
  return taken
}

export function createPesca({ db, now, secret, move }) {
  let nextCheck = 0
  let memo = { at: 0, value: null }

  const rowsOf = async (q, round, lock = false) =>
    (
      await q(
        `select s.usuario_id, s.estado, c.nombre, c.avatar from public.juegos_solo s join public.juegos_cuentas c on c.usuario_id = s.usuario_id
         where s.juego = 'pesca' and s.estado->>'round' = $1 order by s.usuario_id${lock ? ' for update of s' : ''}`,
        [String(round)],
      )
    ).rows
  const payAt = (round) => pesca.fishEnd(round) + PAY_PAD_MS

  // El Bote del Marlín de la semana (en la ronda 0 de juegos_rondas; si no hay, el de salida).
  async function boteOf(q, lock = false) {
    const row = (await q(`select datos from public.juegos_rondas where juego = 'pesca' and ronda = 0${lock ? ' for update' : ''}`)).rows[0]
    return row && row.datos.week === weekOf(now()).key ? Number(row.datos.bote) : pesca.BOTE_SEED
  }

  async function settleDue() {
    const t = now()
    if (t < nextCheck) return
    const { rows } = await db.query(`select distinct (estado->>'round')::bigint as round from public.juegos_solo where juego = 'pesca' and estado->>'paid' = 'false'`)
    for (const r of rows.map((row) => Number(row.round)).sort((a, b) => a - b)) if (t >= payAt(r)) await pay(r)
    const round = pesca.roundOf(t)
    nextCheck = t < payAt(round - 1) ? payAt(round - 1) : payAt(round)
  }

  async function pay(round) {
    const week = weekOf(now()).key
    const sea = seaOfRound(secret, round)
    await db.tx(async (q) => {
      await q(`select pg_advisory_xact_lock(hashtext($1))`, [`pesca:${round}`])
      const rows = (await rowsOf(q, round, true)).filter((r) => r.estado.paid === false)
      if (!rows.length) return
      const stale = rows.some((r) => r.estado.week !== week)
      const n = rows.length
      const cut = Math.floor(n * pesca.ENTRY * pesca.BOTE_CUT)
      const standings = standingsOf(rows)
      const withFish = standings.filter((s) => s.g > 0).length
      const deltas = {}
      // Solo, o nadie ha pescado nada: se devuelve la inscripción (menos lo del Bote del Marlín) y la Cofradía no pone.
      const refund = n === 1 || withFish === 0
      const pot = refund ? 0 : pesca.potOf(n)
      const shares = refund ? [] : pesca.splitOf(withFish).map((p) => Math.floor(pot * p))
      if (shares.length) shares[0] += pot - shares.reduce((a, b) => a + b, 0)
      const back = pesca.ENTRY - Math.floor(pesca.ENTRY * pesca.BOTE_CUT)
      standings.forEach((s, i) => {
        deltas[s.r.usuario_id] = refund ? back : (shares[i] ?? 0)
      })
      // El Bote del Marlín: crece con cada campeonato y se lo lleva entero quien saque un marlín.
      let bote = (await boteOf(q, true)) + cut
      const marlinRow = rows.find((r) => (r.estado.catches ?? []).some((c) => c.sp === 'marlin'))
      let marlin = null
      if (marlinRow) {
        const c = marlinRow.estado.catches.find((x) => x.sp === 'marlin')
        marlin = { name: marlinRow.nombre, avatar: marlinRow.avatar ?? null, g: c.g, bote }
        deltas[marlinRow.usuario_id] = (deltas[marlinRow.usuario_id] ?? 0) + bote
        bote = pesca.BOTE_RESEED
      }
      if (!stale) {
        const real = Object.fromEntries(Object.entries(deltas).filter(([, d]) => d > 0))
        if (Object.keys(real).length) await move(q, real)
        await q(
          `insert into public.juegos_rondas (juego, ronda, datos) values ('pesca', 0, $1)
           on conflict (juego, ronda) do update set datos = excluded.datos, creado = now()`,
          [JSON.stringify({ bote, week })],
        )
      }
      const league = n >= 2 && !refund
      const players = standings.map((s, i) => {
        const catches = s.r.estado.catches ?? []
        const best = catches.reduce((b, c) => (!b || c.g > b.g ? c : b), null)
        return {
          id: s.r.usuario_id,
          name: s.r.nombre,
          avatar: s.r.avatar ?? null,
          g: s.g,
          n: catches.length,
          best: best ? { sp: best.sp, g: best.g } : null,
          paid: deltas[s.r.usuario_id] ?? 0,
          pts: league ? pesca.leaguePoints(i, s.g) : 0,
        }
      })
      for (const [i, s] of standings.entries()) {
        const p = players[i]
        const last = { round, place: i + 1, n, g: p.g, count: p.n, best: p.best, payout: p.paid, net: p.paid - pesca.ENTRY, stake: pesca.ENTRY, marlin: marlinRow?.usuario_id === s.r.usuario_id ? marlin.bote : 0, refund }
        await q(`update public.juegos_solo set estado = $3, actualizado = now() where usuario_id = $1 and juego = $2`, [s.r.usuario_id, 'pesca', { ...s.r.estado, paid: true, hook: null, last }])
      }
      const entry = { v: pesca.VERSION, week, n, pot, cofradia: refund ? 0 : pesca.cofradiaOf(n), refund, marlin, sea: sea.length, players }
      await q(`insert into public.juegos_rondas (juego, ronda, datos) values ('pesca', $1, $2) on conflict (juego, ronda) do nothing`, [round, JSON.stringify(entry)])
    })
    memo = { at: 0, value: null }
  }

  // Lo de la semana que no cambia en cada petición: el último campeonato, la Liga de la Cofradía y el récord.
  async function weekly() {
    const t = now()
    if (memo.value && t - memo.at < MEMO_MS) return memo.value
    const week = weekOf(t).key
    const [lastRows, rounds, bote] = await Promise.all([
      db.query(`select ronda, datos from public.juegos_rondas where juego = 'pesca' and ronda > 0 order by ronda desc limit 1`),
      db.query(`select datos->'players' as players from public.juegos_rondas where juego = 'pesca' and ronda > 0 and datos->>'week' = $1`, [week]),
      boteOf((sql, params) => db.query(sql, params)),
    ])
    const table = new Map()
    let record = null
    for (const { players } of rounds.rows) {
      for (const p of players ?? []) {
        const row = table.get(p.id) ?? { id: p.id, name: p.name, avatar: p.avatar, pts: 0, g: 0, wins: 0, played: 0 }
        Object.assign(row, { name: p.name, avatar: p.avatar })
        row.pts += p.pts
        row.g += p.g
        row.played++
        if (p.pts === pesca.LEAGUE_POINTS[0]) row.wins++
        table.set(p.id, row)
        if (p.best && (!record || p.best.g > record.g)) record = { name: p.name, avatar: p.avatar, sp: p.best.sp, g: p.best.g }
      }
    }
    const league = [...table.values()].filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts || b.g - a.g)
    const last = lastRows.rows[0] ? { round: Number(lastRows.rows[0].ronda), ...lastRows.rows[0].datos } : null
    memo = { at: t, value: { last, league, record, bote } }
    return memo.value
  }

  async function savedOf(q, userId, lock = false) {
    return (await q(`select estado from public.juegos_solo where usuario_id = $1 and juego = 'pesca'${lock ? ' for update' : ''}`, [userId])).rows[0]?.estado ?? null
  }
  const save = (q, userId, estado) =>
    q(
      `insert into public.juegos_solo (usuario_id, juego, estado) values ($1, 'pesca', $2)
       on conflict (usuario_id, juego) do update set estado = excluded.estado, actualizado = now()`,
      [userId, estado],
    )

  async function join(user) {
    const t = now()
    const { round, start } = pesca.phaseAt(t)
    // Al empezar la pesca la inscripción se cierra (con un pequeño margen para la que ya iba de camino).
    const target = t < start ? round : t - pesca.fishStart(round) < JOIN_GRACE_MS ? round : null
    if (target === null) return 'PESCA_CLOSED'
    const week = weekOf(t).key
    return db.tx(async (q) => {
      const saved = await savedOf(q, user.id, true)
      if (saved?.round === target) return 'PESCA_IN'
      if (saved && saved.paid === false) return 'BUSY'
      if (!(await move(q, { [user.id]: -pesca.ENTRY }, true))) return 'INSUFFICIENT_FUNDS'
      await save(q, user.id, { v: pesca.VERSION, round: target, week, at: t, paid: false, lure: null, hook: null, catches: [], lost: [], ready: 0, last: saved?.last ?? null })
      return null
    })
  }

  async function cast(user, x, y, sentAt) {
    if (!pesca.validPoint(x, y)) return { error: 'BAD_MESSAGE' }
    const t = now()
    // Se cuenta desde el clic (con el reloj del servidor que calcula el navegador), no desde que llega: si no, con la red
    // de por medio el pez ya se ha movido. Nunca en el futuro ni con más de CAST_LAG_MS de retraso.
    const at = Number.isFinite(sentAt) ? Math.min(t, Math.max(t - CAST_LAG_MS, Math.round(sentAt))) : t
    const { round, phase, start, end } = pesca.phaseAt(at)
    if (phase !== 'fish' || pesca.roundOf(t) !== round) return { error: 'BAD_PHASE' }
    const land = at + pesca.castMs(x, y)
    if (land >= end) return { error: 'BAD_PHASE' }
    const sea = seaOfRound(secret, round)
    return db.tx(async (q) => {
      // Los lanzamientos de una ronda, de uno en uno: dos que caen sobre el mismo pez no se lo pueden llevar los dos.
      await q(`select pg_advisory_xact_lock(hashtext($1))`, [`pesca:${round}`])
      const rows = await rowsOf(q, round)
      const mine = rows.find((r) => r.usuario_id === user.id)
      if (!mine) return { error: 'PESCA_OUT' }
      let e = mine.estado
      // Una pelea que el navegador abandonó (se cerró la pestaña): pasado su tiempo máximo, el pez se ha soltado.
      if (e.hook && t > e.hook.at + pesca.MAX_FIGHT_TICKS * pesca.TICK_MS + LAND_GRACE_MS) e = { ...e, hook: null, lost: [...(e.lost ?? []), e.hook.fish] }
      if (e.hook) return { error: 'PESCA_HOOKED' }
      if (at < Number(e.ready ?? 0)) return { error: 'PESCA_WAIT' }
      const taken = new Set(takenOf(rows).keys())
      const fish = pesca.biteAt(sea, x, y, land - start, taken)
      const next = fish
        ? { ...e, lure: { x, y, at, land }, hook: { fish: fish.id, at: land }, ready: 0 }
        : { ...e, lure: { x, y, at, land }, ready: land + pesca.RECAST_MS }
      await save(q, user.id, next)
      return { error: null, bite: fish ? fish.id : null }
    })
  }

  async function land(user, toggles, ticks, fishId) {
    if (!pesca.validToggles(toggles) || !Number.isSafeInteger(ticks) || ticks < 1 || ticks > pesca.MAX_FIGHT_TICKS) return { error: 'BAD_MESSAGE' }
    const t = now()
    const round = pesca.roundOf(t - LAND_GRACE_MS)
    const sea = seaOfRound(secret, round)
    return db.tx(async (q) => {
      await q(`select pg_advisory_xact_lock(hashtext($1))`, [`pesca:${round}`])
      const saved = await savedOf(q, user.id, true)
      // La misma pelea otra vez (el navegador reintentó la petición): la misma respuesta.
      if (saved?.landed && saved.landed.round === round && saved.landed.fish.id === fishId && !saved.hook) return { error: null, ...saved.landed, again: true }
      if (!saved || saved.round !== round || saved.paid !== false || !saved.hook) return { error: 'BAD_PHASE' }
      const { fish: id, at } = saved.hook
      const f = sea[sea.findIndex((x) => x.id === id)]
      // No se pueden contar más pasos de los que han pasado desde que picó, ni pelear después de que acabe la pesca.
      const allowed = Math.floor((t - at + LAND_GRACE_MS) / pesca.TICK_MS)
      const cap = Math.floor((pesca.fishEnd(round) - at) / pesca.TICK_MS)
      const st = pesca.simulateFight(f, toggles, Math.min(ticks, allowed, cap))
      let end = st.end
      if (!end) {
        // Sin acabar: si es porque se acabó el campeonato, el sedal se corta; si no, la pelea no cuadra (o va adelantada).
        if (Math.min(ticks, allowed) < cap) return { error: 'PESCA_FIGHT' }
        end = 'cut'
      }
      const landed = end === 'landed'
      const doneAt = at + st.tick * pesca.TICK_MS
      const next = {
        ...saved,
        hook: null,
        lure: null,
        ready: t + 300,
        catches: landed ? [...saved.catches, { f: id, sp: f.sp, g: f.g, at: doneAt }] : saved.catches,
        lost: landed ? saved.lost : [...saved.lost, id],
        landed: { round, end, fish: { id, sp: f.sp, g: f.g } },
      }
      await save(q, user.id, next)
      return { error: null, end, fish: { id, sp: f.sp, g: f.g } }
    })
  }

  // Lo que ve la pantalla.
  async function view(userId, balance) {
    const t = now()
    const { round, phase, start, end } = pesca.phaseAt(t)
    const sea = seaOfRound(secret, round)
    const [rows, week] = await Promise.all([rowsOf((sql, params) => db.query(sql, params), round), weekly()])
    const ms = t - start
    const taken = takenOf(rows)
    const names = new Map(rows.map((r) => [r.usuario_id, r.nombre]))
    // Los peces que ya están en el agua o entran enseguida (sin semilla: la pelea solo la conoce quien lo engancha).
    const fish = phase === 'fish' || ms > -pesca.LOOKAHEAD_MS
      ? sea
          .filter((f) => f.t0 <= ms + pesca.LOOKAHEAD_MS && f.t1 >= ms - 1000)
          .map(({ seed: _seed, ...f }) => {
            const tk = taken.get(f.id)
            // Un pez enganchado se ve como enganchado cuando cae el anzuelo, no antes.
            if (!tk || (tk.state === 'hook' && tk.at > t)) return f
            return { ...f, taken: tk.state, by: names.get(tk.owner) ?? '', mine: tk.owner === userId }
          })
      : []
    const standings = standingsOf(rows)
    const players = standings.map((s) => {
      const e = s.r.estado
      const hook = e.hook && e.hook.at <= t ? { fish: e.hook.fish, at: e.hook.at } : null
      // El último lanzamiento, mientras el anzuelo está en el agua (y el que va de camino a un pez, como un lanzamiento).
      const lure = e.lure && t < Number(e.ready ?? 0) + 200 ? e.lure : null
      return { name: s.r.nombre, avatar: s.r.avatar ?? null, me: s.r.usuario_id === userId, g: s.g, n: (e.catches ?? []).length, hook, lure }
    })
    const feed = rows
      .flatMap((r) => (r.estado.catches ?? []).map((c) => ({ name: r.nombre, avatar: r.avatar ?? null, sp: c.sp, g: c.g, at: c.at, me: r.usuario_id === userId })))
      .sort((a, b) => b.at - a.at)
      .slice(0, FEED)
    const meRow = rows.find((r) => r.usuario_id === userId)
    const mine = meRow?.estado ?? null
    let myHook = null
    if (mine?.hook) {
      const f = sea.find((x) => x.id === mine.hook.fish)
      myHook = { ...mine.hook, fish: f }
    }
    const saved = meRow ? mine : await savedOf((sql, params) => db.query(sql, params), userId)
    const { league, record, bote, last } = week
    const myLeague = league.findIndex((r) => r.id === userId)
    const strip = ({ id, ...r }) => ({ ...r, me: id === userId })
    return {
      now: t,
      round,
      phase,
      start,
      end,
      entry: pesca.ENTRY,
      joined: Boolean(meRow),
      n: rows.length,
      pot: pesca.potOf(rows.length),
      cofradia: pesca.cofradiaOf(rows.length),
      bote: bote + Math.floor(rows.length * pesca.ENTRY * pesca.BOTE_CUT),
      players,
      fish,
      feed,
      mine: mine ? { ready: Number(mine.ready ?? 0), lure: mine.lure, hook: myHook, catches: mine.catches ?? [], lost: mine.lost ?? [] } : null,
      // El último campeonato ya repartido (sin los ids de nadie) y lo tuyo en él.
      last: last ? { ...last, players: last.players.map(strip) } : null,
      myLast: saved?.last ?? null,
      league: league.slice(0, LEAGUE).map(strip),
      myLeague: myLeague >= LEAGUE ? { place: myLeague + 1, ...strip(league[myLeague]) } : null,
      record,
      balance,
    }
  }

  async function handle(user, msg, reply) {
    await settleDue()
    let changed = false
    if (msg.a === 'join') {
      const error = await join(user)
      if (error) reply.error = { code: error }
      else changed = true
    } else if (msg.a === 'cast') {
      const out = await cast(user, msg.x, msg.y, msg.at)
      if (out.error) reply.error = { code: out.error }
      else {
        reply.cast = { bite: out.bite }
        changed = true
      }
    } else if (msg.a === 'land') {
      const out = await land(user, msg.toggles, msg.ticks, msg.fish)
      if (out.error) reply.error = { code: out.error }
      else {
        reply.landed = { end: out.end, fish: out.fish }
        changed = !out.again
      }
    } else if (msg.a !== 'sync') {
      reply.error = { code: 'BAD_MESSAGE' }
    }
    const balance = Number((await db.query(`select saldo from public.juegos_cuentas where usuario_id = $1`, [user.id])).rows[0]?.saldo ?? 0)
    reply.me.balance = balance
    reply.pesca = await view(user.id, balance)
    return changed
  }

  // Reinicio del domingo: los campeonatos y el Bote del Marlín se borran (las partidas se van con juegos_solo).
  const sweep = (q) => q(`delete from public.juegos_rondas where juego = 'pesca'`)

  return { handle, settleDue, sweep }
}
