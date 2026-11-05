-- Juegos ocultos: el master quita juegos del selector desde Banca → Juegos (una temporada, por ejemplo) sin borrar nada,
-- y los vuelve a poner cuando quiera. Lista de ids ('roulette', 'poker', 'bingo'…). El servidor la añade solo si falta
-- (api/_juegos/banca.mjs). Se puede ejecutar más de una vez.
alter table public.juegos_meta add column if not exists ocultos jsonb not null default '[]'::jsonb;
