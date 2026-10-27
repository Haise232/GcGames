-- Juegos: la Inmobiliaria. Las propiedades del tablero (una fila por casilla con dueño) y lo que ha pasado en él.
-- Como todas las tablas de Juegos, de juegos_api y sin acceso para anon, authenticated ni service_role. Ya aplicada.
create table if not exists public.juegos_inmuebles (
  casilla          int primary key,
  usuario_id       uuid not null references public.usuarios(id) on delete cascade,
  nivel            int not null default 0,
  invertido        bigint not null,
  invertido_semana bigint not null,
  semana           text not null,
  cobrado          bigint not null,
  comprada         timestamptz not null default now()
);
create index if not exists juegos_inmuebles_usuario_idx on public.juegos_inmuebles (usuario_id);
create table if not exists public.juegos_inmuebles_log (
  id         bigserial primary key,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  casilla    int not null,
  tipo       text not null,
  importe    bigint not null,
  creado     timestamptz not null default now()
);
alter table public.juegos_inmuebles     enable row level security;
alter table public.juegos_inmuebles_log enable row level security;
alter table public.juegos_inmuebles     owner to juegos_api;
alter table public.juegos_inmuebles_log owner to juegos_api;
alter sequence public.juegos_inmuebles_log_id_seq owner to juegos_api;
revoke all on public.juegos_inmuebles, public.juegos_inmuebles_log from anon, authenticated, service_role;
revoke all on sequence public.juegos_inmuebles_log_id_seq from anon, authenticated, service_role;
