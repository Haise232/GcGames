-- Juegos: el Ascensor (sustituye a los Duelos). Guarda la partida de cada uno en juegos_solo y sus últimos viajes en
-- juegos_rondas, como el Puente de Cristal, así que se amplían los dos checks. Se puede ejecutar más de una vez.
-- Las tablas siguen siendo de juegos_api (si se ejecuta como postgres, el owner no cambia: solo se tocan los checks).
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator'));

alter table public.juegos_rondas drop constraint if exists juegos_rondas_juego_check;
alter table public.juegos_rondas add constraint juegos_rondas_juego_check
  check (juego in ('auction', 'bridge', 'elevator'));
