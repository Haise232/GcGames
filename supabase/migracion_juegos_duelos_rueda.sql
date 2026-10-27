-- Duelos 1 contra 1 y Rueda de la Fortuna en vivo (sustituye a Sobornos). RLS activado y sin políticas: solo la función
-- de Juegos lee y escribe.

-- La rueda guarda su apuesta de la ronda en juegos_solo, como la ruleta.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel'));

-- Retos: abierto (la apuesta de quien reta está retenida), jugado, cancelado o caducado. para null = reto abierto a todos.
create table if not exists public.juegos_duelos (
  id      bigserial primary key,
  reta    uuid not null references public.usuarios(id) on delete cascade,
  para    uuid references public.usuarios(id) on delete cascade,
  acepta  uuid references public.usuarios(id) on delete set null,
  apuesta bigint not null check (apuesta > 0),
  tipo    text not null check (tipo in ('moneda', 'dados', 'carta')),
  estado  text not null default 'abierto' check (estado in ('abierto', 'jugado', 'cancelado', 'caducado')),
  ganador text check (ganador in ('reta', 'acepta')),
  detalle jsonb,
  extra   bigint not null default 0,
  creado  timestamptz not null default now(),
  jugado  timestamptz
);
create index if not exists juegos_duelos_estado_idx on public.juegos_duelos (estado, id desc);
create index if not exists juegos_duelos_reta_idx on public.juegos_duelos (reta);

alter table public.juegos_duelos enable row level security;
alter table public.juegos_duelos owner to juegos_api;
alter sequence public.juegos_duelos_id_seq owner to juegos_api;
revoke all on public.juegos_duelos from anon, authenticated, service_role;
revoke all on sequence public.juegos_duelos_id_seq from anon, authenticated, service_role;
