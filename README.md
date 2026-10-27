# GcGames

El casino de GcGames: blackjack, póker, bingo, ruleta, crash, gacha, inmobiliaria, la Cuenta en Suiza y más.

## Cómo está hecho

- `src/`: la web (React + Vite). `src/entrada/` es la pantalla de entrar o crear cuenta; `src/juegos/` es el casino.
- `worker.mjs`: Worker de Cloudflare que sirve la web compilada (`dist/`) y la API en `POST /api/juegos`, con la
  sesión de Supabase en `Authorization`. `api/_juegos/` tiene la lógica de cada juego y usa las mismas reglas que la
  web (`src/juegos/*.js`).
- La base de datos se alcanza por **Hyperdrive** (Cloudflare), que guarda las conexiones con Supabase entre peticiones.
- Supabase: Auth para las cuentas, Postgres para todo lo demás y Realtime para avisar de los cambios en las mesas.
  - `supabase/00_base.sql`: tabla `usuarios`, alta automática al registrarse (como *pendiente*) y el rol `juegos_api`.
  - Las tablas `juegos_*` las crea el propio servidor la primera vez (`api/_juegos/schema.mjs`); son de `juegos_api`.
- Cuentas nuevas: quien se registra no juega hasta que el master la acepta en **la banca → Cuentas**.

## Publicar

Cada push a `main` publica en Cloudflare (`.github/workflows/deploy.yml`). A mano:

```sh
npm install
npm run deploy     # vite build + wrangler deploy
```

Configuración en `wrangler.jsonc`. Secreto del Worker: `JUEGOS_DATABASE_URL` (`wrangler secret put`). En GitHub:
`CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

## En local

```sh
npm run dev        # solo la web, en http://localhost:5174
```

## Copia de datos

`scripts/copiar-datos.mjs` copió las cuentas (con su contraseña) y las tablas `juegos_*` desde la base de datos
anterior. Se puede repetir mientras siga existiendo el rol temporal de origen.
