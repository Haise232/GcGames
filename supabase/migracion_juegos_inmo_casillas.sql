-- Juegos, Inmobiliaria: las casillas especiales (Salida, Suerte, Caja, Parking, Vete a la cárcel) se usan una vez al día
-- y lo de cada jugador va en juegos_solo (juego «inmo»), así que se amplía el check. El bote del Parking va en su tabla.
-- De juegos_api y sin acceso para anon, authenticated ni service_role. Se puede ejecutar más de una vez.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo'));
create table if not exists public.juegos_inmo_bote (
  id   int primary key default 1 check (id = 1),
  bote bigint not null default 0
);
alter table public.juegos_inmo_bote enable row level security;
alter table public.juegos_inmo_bote owner to juegos_api;
revoke all on public.juegos_inmo_bote from anon, authenticated, service_role;
