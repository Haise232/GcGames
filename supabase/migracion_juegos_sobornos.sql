-- Juegos: Sobornos sustituye a la máquina de gancho. Guarda su trama en curso en juegos_solo (apuesta, maletín y
-- despacho), así que se amplía el check de la columna juego. Los poderes del gacha del gancho pasan a Sobornos: el
-- efecto activo y la última vez que se usó cada carta. Se puede ejecutar más de una vez. No crea tablas nuevas, así que
-- el dueño (juegos_api) no cambia.
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo
  add constraint juegos_solo_juego_check check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe'));

update public.juegos_gacha_efectos e
   set juego = 'bribe'
 where e.juego = 'claw'
   and not exists (select 1 from public.juegos_gacha_efectos d where d.usuario_id = e.usuario_id and d.juego = 'bribe');
delete from public.juegos_gacha_efectos where juego = 'claw';

update public.juegos_gacha_cartas
   set poderes_usados = (poderes_usados - 'claw')
                        || case when poderes_usados ? 'bribe' then '{}'::jsonb
                                else jsonb_build_object('bribe', poderes_usados -> 'claw') end
 where poderes_usados ? 'claw';
