// Copia las cuentas y todos los datos de Juegos del Supabase de TopCode al de Juegos. Se puede repetir: las cuentas que
// ya existan se dejan (con su contraseña) y las tablas juegos_* se vacían y se vuelven a llenar.
//   ORIGEN_DATABASE_URL  TopCode, con el rol temporal juegos_migra (ejecuta public.juegos_migra_export())
//   JUEGOS_DATABASE_URL  Juegos, con el rol juegos_api (dueño de juegos_*; ejecuta public.juegos_migra_import_auth())
//   node --env-file=.env.local scripts/copiar-datos.mjs
import pg from 'pg'

const ssl = { rejectUnauthorized: false }
const clean = (url) => {
  const u = new URL(url)
  u.searchParams.delete('sslmode')
  return u.toString()
}
for (const name of ['ORIGEN_DATABASE_URL', 'JUEGOS_DATABASE_URL']) if (!process.env[name]) throw new Error(`Falta ${name}`)

const origen = new pg.Client({ connectionString: clean(process.env.ORIGEN_DATABASE_URL), ssl })
const destino = new pg.Client({ connectionString: clean(process.env.JUEGOS_DATABASE_URL), ssl })
await origen.connect()
await destino.connect()

const { rows } = await origen.query('select public.juegos_migra_export() as datos')
const datos = rows[0].datos
await origen.end()
console.log(`Origen: ${datos.users.length} cuentas, ${Object.keys(datos.tablas).length} tablas`)

// Orden de inserción: primero las tablas a las que apuntan otras (claves foráneas entre juegos_*).
const tablas = Object.keys(datos.tablas)
const deps = (
  await destino.query(
    `select c.conrelid::regclass::text as de, c.confrelid::regclass::text as a from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
  )
).rows.map((r) => ({ de: r.de.replace(/^public\./, ''), a: r.a.replace(/^public\./, '') }))
const orden = []
const visit = (t, path = new Set()) => {
  if (orden.includes(t) || path.has(t)) return
  path.add(t)
  for (const d of deps) if (d.de === t && d.a !== t && tablas.includes(d.a)) visit(d.a, path)
  orden.push(t)
}
tablas.forEach((t) => visit(t))

try {
  await destino.query('begin')
  const nuevas = (
    await destino.query('select public.juegos_migra_import_auth($1, $2) as n', [JSON.stringify(datos.users), JSON.stringify(datos.identities)])
  ).rows[0].n
  // El alta en auth.users crea la fila de usuarios como pendiente: se le pone lo de TopCode.
  const perfiles = await destino.query(
    `update public.usuarios u set nombre = p.nombre, avatar_url = p.avatar_url, es_superadmin = p.es_superadmin,
       estado_acceso = p.estado_acceso, created_at = coalesce(p.created_at, u.created_at)
     from jsonb_to_recordset($1) as p(id uuid, nombre text, avatar_url text, es_superadmin boolean, estado_acceso text, created_at timestamptz)
     where u.id = p.id`,
    [JSON.stringify(datos.usuarios)],
  )
  console.log(`Cuentas: ${nuevas} nuevas, ${perfiles.rowCount} perfiles al día`)

  await destino.query(`truncate ${orden.map((t) => `public.${t}`).join(', ')}`)
  for (const t of orden) {
    const filas = datos.tablas[t]
    if (!filas.length) continue
    const cols = (
      await destino.query(
        `select string_agg(format('%I', column_name), ', ' order by ordinal_position) as c from information_schema.columns
         where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'`,
        [t],
      )
    ).rows[0].c
    const r = await destino.query(
      `insert into public.${t} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::public.${t}, $1)`,
      [JSON.stringify(filas)],
    )
    console.log(`  ${t}: ${r.rowCount}`)
  }

  // Los contadores (ids de chat, avisos…) siguen desde el último copiado.
  const seqs = (
    await destino.query(
      `select table_name as t, column_name as c, pg_get_serial_sequence('public.' || table_name, column_name) as s
       from information_schema.columns where table_schema = 'public' and table_name like 'juegos\\_%'
       and pg_get_serial_sequence('public.' || table_name, column_name) is not null`,
    )
  ).rows
  for (const { t, c, s } of seqs) {
    await destino.query(`select setval($1, coalesce((select max(${c}) from public.${t}), 0) + 1, false)`, [s])
  }
  await destino.query('commit')
  console.log('Copia terminada.')
} catch (error) {
  await destino.query('rollback').catch(() => {})
  throw error
} finally {
  await destino.end()
}
