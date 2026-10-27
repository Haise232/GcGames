-- Juegos: mesas de ajedrez en vivo (dos jugadores con apuesta). Van en juegos_mesas como el blackjack y el póker, así que
-- se amplía su check. El servidor lo hace solo la primera vez que arranca; esto es por si se quiere hacer a mano.
-- La tabla sigue siendo de juegos_api (si se ejecuta como postgres, el owner no cambia: solo se toca el check).
-- Se puede ejecutar más de una vez.
alter table public.juegos_mesas drop constraint if exists juegos_mesas_juego_check;
alter table public.juegos_mesas add constraint juegos_mesas_juego_check
  check (juego in ('blackjack', 'poker', 'chess'));
