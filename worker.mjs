// Worker de Cloudflare de Juegos: sirve la web (dist/, ver wrangler.jsonc) y la API en /api/juegos.
// POST /api/juegos con { t: 'hello' | 'lobby' | 'join_public' | 'bet' | … } y la sesión de Supabase en Authorization.
import { createHash } from 'node:crypto'
import { createJuegos, JuegosError } from './api/_juegos/game.mjs'
import { createDb, requestScope } from './api/_juegos/db.mjs'
import { health, ping, verifyUser } from './api/_juegos/auth.mjs'

// Semilla de la ruleta en vivo: JUEGOS_RULETA_SECRET si existe; si no, una derivada de la cadena de conexión (también
// secreta y la misma en todas las instancias), para que funcione sin configurar nada más.
const secret = createHash('sha256')
  .update(`ruleta:${process.env.JUEGOS_RULETA_SECRET || process.env.JUEGOS_DATABASE_URL || ''}`)
  .digest()

const db = createDb()
const juegos = createJuegos({ db, ping, secret })

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function api(request) {
  const url = new URL(request.url)
  if (request.method === 'GET') return json(200, await health(db, { sendPing: url.searchParams.get('ping') === '1' }))
  if (request.method !== 'POST') return json(405, { error: { code: 'BAD_MESSAGE', message: 'Usa POST.' } })
  try {
    // En frío, el arranque de la base de datos y la comprobación del usuario van a la vez (después quedan en caché).
    const [user] = await Promise.all([verifyUser(request.headers.get('authorization'), db), juegos.warm()])
    let msg
    try {
      msg = await request.json()
    } catch {
      throw new JuegosError('BAD_MESSAGE')
    }
    return json(200, await juegos.handle(user, msg))
  } catch (error) {
    if (error instanceof JuegosError) {
      // AUTH_DOWN: Supabase Auth no respondió; con 503 el navegador reintenta en vez de pedir que recargues.
      const status = error.code === 'AUTH_DOWN' ? 503 : error.code.startsWith('AUTH_') ? (error.code === 'AUTH_PENDING' ? 403 : 401) : 400
      return json(status, { error: { code: error.code, message: error.message } })
    }
    // Choque entre dos peticiones a la vez sobre la misma mesa (bloqueo): el cliente reintenta.
    if (error?.code === '40P01' || error?.code === '55P03') {
      return json(409, { error: { code: 'BUSY', message: 'La mesa está muy concurrida, inténtalo de nuevo.' } })
    }
    console.error('juegos:', error)
    return json(500, { error: { code: 'SERVER', message: 'Error de juegos. Inténtalo de nuevo.' } })
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    if (pathname !== '/api/juegos') return env.ASSETS.fetch(request)
    // Las conexiones a Postgres de esta petición (por Hyperdrive) viven en su scope y se cierran al responder.
    const scope = { connectionString: env.HYPERDRIVE?.connectionString }
    try {
      return await requestScope.run(scope, () => api(request))
    } finally {
      if (scope.pool) ctx.waitUntil(scope.pool.end().catch(() => {}))
    }
  },
}
