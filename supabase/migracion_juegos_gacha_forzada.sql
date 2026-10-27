-- Gacha: carta que el master deja preparada para la próxima tirada de pago de alguien (se usa una vez, si sigue libre).
alter table public.juegos_gacha_jugadores add column if not exists forzada text;
