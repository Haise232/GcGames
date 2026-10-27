-- Juegos: el Cohete (crash en vivo) guarda su apuesta en juegos_solo como la ruleta y el blackjack solo.
-- Amplía el check de la columna juego. Se puede ejecutar más de una vez.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo
  add constraint juegos_solo_juego_check check (juego in ('roulette', 'blackjack', 'crash'));
