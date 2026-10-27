# Juegos

Casino de Juegos: blackjack, póker, bingo, ruleta, crash, gacha, inmobiliaria, la Cuenta en Suiza y más. Antes estaba
dentro de TopCode, en `/juegos`; ahora es un proyecto aparte, con su propio Supabase y su propio Vercel.

## Cómo está hecho

- `src/`: la web (React + Vite). `src/entrada/` es la pantalla de entrar o crear cuenta; `src/juegos/` es el casino.
- `api/juegos.mjs`: la única función de Vercel. Cada acción es un `POST /api/juegos` con la sesión de Supabase.
  `api/_juegos/` tiene la lógica de cada juego y usa las mismas reglas que la web (`src/juegos/*.js`).
- Supabase: Auth para las cuentas, Postgres para todo lo demás y Realtime para avisar de los cambios en las mesas.
  - `supabase/00_base.sql`: tabla `usuarios`, alta automática al registrarse (como *pendiente*) y el rol `juegos_api`.
  - Las tablas `juegos_*` las crea la propia función la primera vez (`api/_juegos/schema.mjs`); son de `juegos_api`.
- Cuentas nuevas: quien se registra no juega hasta que el master la acepta en **la banca → Cuentas**.

## Variables de entorno

Ver `.env.example`. En Vercel hacen falta `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `JUEGOS_DATABASE_URL`
(«Transaction pooler» del proyecto, puerto 6543, con el usuario `juegos_api.<ref>`).

## En local

```sh
npm install
npm run dev        # la web en http://localhost:5174 (la API necesita `vercel dev`)
```

## Copia desde TopCode

`scripts/copiar-datos.mjs` copia las cuentas (con su contraseña) y todas las tablas `juegos_*` desde el Supabase de
TopCode. Se puede repetir; la última vez, justo antes de mandar a la gente aquí.
