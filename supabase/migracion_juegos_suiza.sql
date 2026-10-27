-- Juegos: la Cuenta en Suiza. El efectivo que cada jugador esconde de Hacienda (una fila por jugador).
-- Como todas las tablas de Juegos, de juegos_api y sin acceso para anon, authenticated ni service_role.
create table if not exists public.juegos_suiza (
  usuario_id   uuid primary key references public.usuarios(id) on delete cascade,
  saldo        bigint not null default 0,
  saldo_semana bigint not null default 0,
  semana       text not null,
  movs         jsonb not null default '[]'::jsonb,
  actualizado  timestamptz not null default now()
);
alter table public.juegos_suiza enable row level security;
alter table public.juegos_suiza owner to juegos_api;
revoke all on public.juegos_suiza from anon, authenticated, service_role;
