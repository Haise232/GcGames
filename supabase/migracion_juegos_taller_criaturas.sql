-- Juegos, Season 5: el Taller de Papá Noel («taller») y Criaturas de las Islas («criaturas») guardan su estado en
-- juegos_solo, así que se amplía el check de la columna juego. El servidor lo hace solo si falta (api/_juegos/game.mjs).
-- Se puede ejecutar más de una vez. La fila de Criaturas no se borra en el reinicio del domingo (el equipo dura toda
-- la temporada). La Regata («regatta») y la Bola Canaria se retiran: el servidor devuelve lo apostado en una regata que
-- no llegó a pagarse y borra sus filas; «regatta» sigue en el check por si acaso.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo', 'fish', 'dig', 'dive', 'regatta', 'hilo', 'pesca', 'trineo', 'taller', 'criaturas'));
