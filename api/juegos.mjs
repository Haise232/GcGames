// Función de Vercel de juegos: POST /api/juegos con { t: 'hello' | 'lobby' | 'join_public' | 'bet' | … }.
import { createJuegos, JuegosError } from './_juegos/game.mjs'
import { createDb } from './_juegos/db.mjs'
import { createHash } from 'node:crypto'
import { health, ping, verifyUser } from './_juegos/auth.mjs'

// Semilla de la ruleta en vivo: JUEGOS_RULETA_SECRET si existe; si no, una derivada de la cadena de conexión (también
// secreta y la misma en todas las instancias de la función), para que funcione sin configurar nada más.
const secret = createHash('sha256')
  .update(`ruleta:${process.env.JUEGOS_RULETA_SECRET || process.env.JUEGOS_DATABASE_URL || ''}`)
  .digest()

const db = createDb()
const juegos = createJuegos({ db, ping, secret })

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'GET') return res.status(200).json(await health(db, { sendPing: req.query?.ping === '1' }))
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'BAD_MESSAGE', message: 'Usa POST.' } })
  try {
    // En frío, el arranque de la base de datos y la comprobación del usuario van a la vez (después quedan en caché).
    const [user] = await Promise.all([verifyUser(req.headers.authorization, db), juegos.warm()])
    const msg = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    return res.status(200).json(await juegos.handle(user, msg))
  } catch (error) {
    if (error instanceof JuegosError) {
      // AUTH_DOWN: Supabase Auth no respondió; con 503 el navegador reintenta en vez de pedir que recargues.
      const status = error.code === 'AUTH_DOWN' ? 503 : error.code.startsWith('AUTH_') ? (error.code === 'AUTH_PENDING' ? 403 : 401) : 400
      return res.status(status).json({ error: { code: error.code, message: error.message } })
    }
    // Choque entre dos peticiones a la vez sobre la misma mesa (bloqueo): el cliente reintenta.
    if (error?.code === '40P01' || error?.code === '55P03') {
      return res.status(409).json({ error: { code: 'BUSY', message: 'La mesa está muy concurrida, inténtalo de nuevo.' } })
    }
    console.error('juegos:', error)
    return res.status(500).json({ error: { code: 'SERVER', message: 'Error de juegos. Inténtalo de nuevo.' } })
  }
}
