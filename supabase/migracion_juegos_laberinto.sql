-- Juegos: el Laberinto de las Puertas sustituye a la tragamonedas. Guarda su partida en curso en juegos_solo (apuesta,
-- botín y sala), así que se amplía el check de la columna juego. Los poderes del gacha de la tragamonedas pasan al
-- laberinto: el efecto activo y la última vez que se usó cada carta. Se puede ejecutar más de una vez. No crea tablas
-- nuevas, así que el dueño (juegos_api) no cambia.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo
  add constraint juegos_solo_juego_check check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon'));

update public.juegos_gacha_efectos e
   set juego = 'dungeon'
 where e.juego = 'slots'
   and not exists (select 1 from public.juegos_gacha_efectos d where d.usuario_id = e.usuario_id and d.juego = 'dungeon');
delete from public.juegos_gacha_efectos where juego = 'slots';

update public.juegos_gacha_cartas
   set poderes_usados = (poderes_usados - 'slots')
                        || case when poderes_usados ? 'dungeon' then '{}'::jsonb
                                else jsonb_build_object('dungeon', poderes_usados -> 'slots') end
 where poderes_usados ? 'slots';
