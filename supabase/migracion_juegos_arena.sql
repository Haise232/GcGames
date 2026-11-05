-- Juegos, Season 4: Tesoro en la Arena guarda su partida en juegos_solo (juego «dig»), así que se amplía el check de la
-- columna juego. El servidor lo hace solo si falta (api/_juegos/game.mjs). Se puede ejecutar más de una vez.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo', 'fish', 'dig'));
