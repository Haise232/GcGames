-- Juegos: la Carrera de coches (en vivo) guarda sus apuestas y tu asiento de piloto en juegos_solo como la ruleta y el cohete.
-- Amplía el check de la columna juego. Se puede ejecutar más de una vez. No crea tablas nuevas, así que el dueño
-- (juegos_api) no cambia.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo
  add constraint juegos_solo_juego_check check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race'));
