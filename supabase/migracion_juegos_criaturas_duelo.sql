-- Juegos, Season 5: mesas en vivo de duelos de Criaturas de las Islas (juego «criaturas» en juegos_mesas). Se amplía el
-- check de la columna juego; el servidor lo hace solo si falta (api/_juegos/game.mjs, al crear la «Mesa 1»). Se puede
-- ejecutar más de una vez.
alter table public.juegos_mesas drop constraint if exists juegos_mesas_juego_check;
alter table public.juegos_mesas add constraint juegos_mesas_juego_check check (juego in ('blackjack', 'poker', 'chess', 'criaturas'));
