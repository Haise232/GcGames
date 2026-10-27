// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Identidad de TopCode: el cliente manda su access token de Supabase y el servidor lo valida con el propio Supabase.
// Una sola llamada a la RPC get_mi_perfil comprueba la firma del token (PostgREST la rechaza con 401 si no vale)
// y devuelve el perfil, incluido si la cuenta está aprobada.
const TTL_MS = 60000
const MAX_CACHE = 2000

// Foto de perfil de TopCode: solo URLs https razonables (se pintan en un <img> de los demás jugadores).
export function safeAvatar(url) {
  if (typeof url !== 'string' || url.length > 600) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

// Nombre corto para la mesa: «Joaquín José Pérez» -> «Joaquín J.».
export function shortName(full) {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0].slice(0, 16)
  const initial = words[1]?.[0]
  return initial && first.length <= 13 ? `${first} ${initial}.` : first
}

export function supabaseAuth({ url, anonKey, fetch = globalThis.fetch, now = Date.now }) {
  const base = url.replace(/\/+$/, '')
  const cache = new Map()

  return async function verify(accessToken) {
    if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) return { error: 'AUTH_REQUIRED' }
    const hit = cache.get(accessToken)
    if (hit && hit.until > now()) return hit.result

    let result
    try {
      const res = await fetch(`${base}/rest/v1/rpc/get_mi_perfil`, {
        method: 'POST',
        headers: { apikey: anonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      })
      // Un fallo de Supabase no es culpa del jugador: no se guarda y el cliente reintenta.
      if (res.status >= 500) return { error: 'AUTH_UNAVAILABLE' }
      if (!res.ok) result = { error: 'AUTH_INVALID' }
      else {
        const rows = await res.json()
        const perfil = Array.isArray(rows) ? rows[0] : rows
        if (!perfil?.id) result = { error: 'AUTH_INVALID' }
        else if (perfil.estado_acceso !== 'aprobado') result = { error: 'AUTH_PENDING' }
        else result = { user: { id: String(perfil.id), name: shortName(perfil.nombre), avatar: safeAvatar(perfil.avatar_url) } }
      }
    } catch {
      return { error: 'AUTH_UNAVAILABLE' }
    }

    if (cache.size >= MAX_CACHE) {
      for (const [key, value] of cache) if (value.until <= now()) cache.delete(key)
      if (cache.size >= MAX_CACHE) cache.clear()
    }
    cache.set(accessToken, { result, until: now() + TTL_MS })
    return result
  }
}
