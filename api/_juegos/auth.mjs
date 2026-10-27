// Quién llama: el access token de Supabase de la sesión de Juegos (cabecera Authorization).
// Supabase Auth valida el token y la tabla usuarios dice si la cuenta está aprobada.
import { safeAvatar, shortName } from './engine/names.mjs'
import { JuegosError } from './game.mjs'

const TTL_MS = 60000
const STALE_MS = 10 * 60000 // si Supabase Auth no responde, se acepta un token comprobado en estos últimos minutos
const cache = new Map()

export function supabaseEnv() {
  return {
    url: (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  }
}

// Claves públicas de firma del proyecto (JWKS). Con ellas el token se comprueba aquí mismo, sin preguntar a Supabase
// Auth en cada petición: Juegos hace muchas y saturaba Auth, que es el mismo que usa el inicio de sesión.
const JWKS_MS = 10 * 60000
let jwks = { at: 0, keys: new Map(), loading: null }

async function signingKey(kid) {
  const fresh = Date.now() - jwks.at < JWKS_MS
  if (fresh && jwks.keys.has(kid)) return jwks.keys.get(kid)
  // Una clave desconocida puede ser nueva (rotación): se recargan, como mucho una vez por minuto.
  if (fresh && Date.now() - jwks.at < 60000) return null
  jwks.loading ??= (async () => {
    const { url } = supabaseEnv()
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`jwks ${res.status}`)
    const keys = new Map()
    for (const jwk of (await res.json()).keys ?? []) {
      const alg = ALGS[jwk.alg]
      if (!alg) continue // clave de un tipo que no usamos
      try {
        keys.set(jwk.kid, { alg: jwk.alg, key: await crypto.subtle.importKey('jwk', jwk, alg.key, false, ['verify']) })
      } catch {
        // clave de un tipo que no usamos
      }
    }
    jwks = { at: Date.now(), keys, loading: null }
  })().catch((error) => {
    jwks.loading = null
    throw error
  })
  await jwks.loading
  return jwks.keys.get(kid) ?? null
}

// Con WebCrypto, igual en Node y en el Worker de Cloudflare. La firma ES256 de un JWT ya viene como r||s, que es lo que
// espera WebCrypto.
const ALGS = {
  ES256: { key: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
  RS256: { key: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
}
const b64 = (part) => Buffer.from(part, 'base64url')

// Devuelve el id del usuario si el token es válido, null si no se puede comprobar aquí (p. ej. firma HS256 antigua) y
// lanza AUTH_INVALID si es falso o caducó.
async function localUserId(token) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new JuegosError('AUTH_INVALID')
  let header, claims
  try {
    header = JSON.parse(b64(parts[0]))
    claims = JSON.parse(b64(parts[1]))
  } catch {
    throw new JuegosError('AUTH_INVALID')
  }
  const alg = ALGS[header.alg]
  if (!alg || !header.kid) return null
  const found = await signingKey(header.kid).catch(() => null)
  if (!found || found.alg !== header.alg) return null
  const ok = await crypto.subtle.verify(alg.verify, found.key, b64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  if (!ok) throw new JuegosError('AUTH_INVALID')
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) throw new JuegosError('AUTH_INVALID')
  if (claims.role !== 'authenticated' || typeof claims.sub !== 'string') throw new JuegosError('AUTH_INVALID')
  return claims.sub
}

export async function verifyUser(authorization, db) {
  const token = /^Bearer (.{20,4096})$/.exec(authorization ?? '')?.[1]
  if (!token) throw new JuegosError('AUTH_REQUIRED')
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.user

  const id = (await localUserId(token)) ?? (await remoteUserId(token, hit))
  const perfil = (await db.query(`select nombre, avatar_url, estado_acceso from public.usuarios where id = $1`, [id])).rows[0]
  if (!perfil) throw new JuegosError('AUTH_INVALID')
  if (perfil.estado_acceso !== 'aprobado') throw new JuegosError('AUTH_PENDING')
  const user = { id, name: shortName(perfil.nombre) || 'Jugador', avatar: safeAvatar(perfil.avatar_url) }

  if (cache.size > 2000) cache.clear()
  cache.set(token, { user, until: Date.now() + TTL_MS })
  return user
}

// Comprobación por Supabase Auth, solo para tokens que no se pueden verificar con las claves públicas.
async function remoteUserId(token, hit) {
  const { url, anonKey } = supabaseEnv()
  let res
  try {
    res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
  } catch (error) {
    // Supabase Auth tarda o no responde: si este token ya se comprobó hace poco, se sigue con él.
    if (hit && hit.until + STALE_MS > Date.now()) return hit.user.id
    throw error
  }
  if (res.status >= 500 && hit && hit.until + STALE_MS > Date.now()) return hit.user.id
  if (!res.ok) throw new JuegosError(res.status >= 500 ? 'AUTH_DOWN' : 'AUTH_INVALID')
  return (await res.json()).id
}

// Aviso por Supabase Realtime (broadcast): solo dice «algo cambió»; cada cliente pide su propia vista.
// Canal público y sin datos, así que basta la clave pública del proyecto. event: «cambio» (la mesa) o «chat».
export async function ping(topic, event = 'cambio') {
  const { url, anonKey } = supabaseEnv()
  if (!url || !anonKey) return 0
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic, event, payload: { at: Date.now() } }] }),
      signal: AbortSignal.timeout(3000),
    })
    return res.status
  } catch {
    // Si el aviso falla, los clientes se ponen al día con su latido periódico.
    return 0
  }
}

// Comprobación de la configuración, sin datos ni secretos: ¿la base de datos es del mismo proyecto de Supabase que
// usa el inicio de sesión? ¿existen las tablas? ¿sale el aviso de Realtime?
export async function health(db, { sendPing = false } = {}) {
  const { url, anonKey } = supabaseEnv()
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(url)?.[1] ?? null
  const pgUrl = process.env.JUEGOS_DATABASE_URL ?? ''
  const out = {
    supabaseUrl: Boolean(url && anonKey),
    databaseUrl: Boolean(pgUrl),
    sameProjectDb: Boolean(ref && pgUrl.includes(ref)),
  }
  try {
    const { rows } = await db.query(
      `select to_regclass('public.usuarios') is not null as usuarios, to_regclass('public.juegos_mesas') is not null as juegos`,
    )
    out.db = 'ok'
    out.tablaUsuarios = rows[0].usuarios
    out.tablasJuegos = rows[0].juegos
  } catch (error) {
    out.db = `error: ${error.code ?? error.message?.slice(0, 60)}`
  }
  if (sendPing) out.realtime = await ping('juegos-health')
  return out
}
