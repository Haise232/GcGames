-- Juegos, Season 3: la Torre, el Atraco, la Subasta a ciegas y el Puente de Cristal guardan su partida en juegos_solo
-- (como la ruleta o el bingo), así que se amplía el check de la columna juego. Se puede ejecutar más de una vez.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge'));

-- Últimas rondas de la Subasta a ciegas y del Puente de Cristal (quién ganó y qué pasó). Se vacía con el reinicio del
-- domingo. RLS sin políticas y de juegos_api, como el resto de Juegos.
create table if not exists public.juegos_rondas (
  juego  text not null check (juego in ('auction', 'bridge')),
  ronda  bigint not null,
  datos  jsonb not null,
  creado timestamptz not null default now(),
  primary key (juego, ronda)
);
alter table public.juegos_rondas enable row level security;
alter table public.juegos_rondas owner to juegos_api;
revoke all on public.juegos_rondas from anon, authenticated, service_role;
