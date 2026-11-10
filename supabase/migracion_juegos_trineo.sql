-- Juegos, Season 5: el Trineo de Papá Noel guarda su partida en juegos_solo (juego «trineo»), así que se amplía el
-- check de la columna juego. El servidor lo hace solo si falta (api/_juegos/game.mjs). Se puede ejecutar más de una
-- vez. La Lotería de Navidad no guarda nada (se liquida en cada décimo). Tesoro en la Arena («dig») y Apnea («dive»)
-- se retiran: el servidor devuelve lo de las partidas a medias y borra sus filas, pero siguen en el check por si acaso.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo', 'fish', 'dig', 'dive', 'regatta', 'hilo', 'pesca', 'trineo'));
