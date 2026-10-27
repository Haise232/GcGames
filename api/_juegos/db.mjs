// Conexión a la base de datos del Supabase de Juegos desde el Worker de Cloudflare (worker.mjs).
// En un Worker una conexión no puede pasar de una petición a otra: cada petición abre las suyas dentro de
// requestScope.run() y worker.mjs las cierra al acabar. En el Worker se entra por Hyperdrive (scope.connectionString):
// guarda las conexiones con Supabase entre peticiones y valida su certificado, que el TLS del Worker no reconoce.
// Fuera de un Worker (scripts, pruebas) se usa un pool normal con JUEGOS_DATABASE_URL.
// JUEGOS_DATABASE_URL: cadena del «Transaction pooler» del proyecto de Juegos (Supabase → Connect), con el rol juegos_api.
import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'

// bigint (saldo) y bigint[] (días) como números normales.
pg.types.setTypeParser(20, (value) => Number(value))
pg.types.setTypeParser(1016, (value) => pg.types.arrayParser.create(value, (v) => (v === null ? null : Number(v))).parse())

let pool = null
export const requestScope = new AsyncLocalStorage()

function connectionString() {
  const url = process.env.JUEGOS_DATABASE_URL
  if (!url) throw new Error('Falta JUEGOS_DATABASE_URL')
  // El pooler de Supabase usa un certificado propio: TLS sí, pero sin validar la cadena (se quita sslmode de la URL).
  const parsed = new URL(url)
  parsed.searchParams.delete('sslmode')
  parsed.searchParams.delete('supa')
  return parsed.toString()
}

// La conexión se abre con la primera consulta (así la comprobación de salud puede informar si falta configuración).
export function createDb(config = null) {
  const settings = () => config ?? { connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 60000 }
  const getPool = () => {
    const scope = requestScope.getStore()
    if (scope) return (scope.pool ??= new pg.Pool(scope.connectionString ? { connectionString: scope.connectionString, max: 2 } : settings()))
    return (pool ??= new pg.Pool(settings()))
  }
  return {
    query: (sql, params) => getPool().query(sql, params),
    // Transacción: fn recibe q(sql, params) sobre la misma conexión.
    async tx(fn) {
      const client = await getPool().connect()
      try {
        await client.query('begin')
        const result = await fn((sql, params) => client.query(sql, params))
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}
