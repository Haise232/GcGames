-- Juegos, Season 5: la Feria de las Islas («feria») guarda su sala (ronda 0) y cada partida acabada en juegos_rondas, y el
-- Tira y Afloja («soga») lo de cada jugador en juegos_solo y cada ronda en juegos_rondas, así que se amplían los dos
-- checks. El servidor lo hace solo si falta (api/_juegos/game.mjs). Se puede ejecutar más de una vez.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo', 'fish', 'dig', 'dive', 'regatta', 'hilo', 'pesca', 'trineo', 'taller', 'criaturas', 'soga'));

alter table public.juegos_rondas drop constraint if exists juegos_rondas_juego_check;
alter table public.juegos_rondas add constraint juegos_rondas_juego_check
  check (juego in ('auction', 'bridge', 'elevator', 'pesca', 'feria', 'soga'));
