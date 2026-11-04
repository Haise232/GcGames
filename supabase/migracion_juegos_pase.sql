-- Juegos, Season 4: el Pase de las Islas (XP, misiones diarias, racha y premios por nivel). Una fila por jugador; dura
-- toda la temporada y no se borra con el reinicio del domingo. El servidor la crea solo si falta (api/_juegos/pase.mjs).
-- Como todas las tablas de Juegos, de juegos_api y sin acceso para anon, authenticated ni service_role.
create table if not exists public.juegos_pase (
  usuario_id  uuid primary key references public.usuarios(id) on delete cascade,
  temporada   text not null,
  xp          integer not null default 0,
  dia         text,
  jugadas     integer not null default 0,
  juegos      jsonb not null default '[]'::jsonb,
  progreso    jsonb not null default '{}'::jsonb,
  hechas      jsonb not null default '[]'::jsonb,
  bonus       boolean not null default false,
  racha       integer not null default 0,
  racha_dia   text,
  reclamados  jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now()
);
alter table public.juegos_pase enable row level security;
alter table public.juegos_pase owner to juegos_api;
revoke all on public.juegos_pase from anon, authenticated, service_role;
