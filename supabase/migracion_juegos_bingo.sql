-- Juegos: Bingo en vivo. La jaula (el bote) y las últimas partidas; los cartones de cada uno van en juegos_solo (juego
-- «bingo»), como las apuestas de la ruleta. RLS activado y sin políticas: solo la función de Juegos lee y escribe, así
-- que la tabla es de juegos_api. Se puede ejecutar más de una vez.
create table if not exists public.juegos_bingo (
  id        int primary key default 1 check (id = 1),
  bote      bigint not null default 0 check (bote >= 0),
  historial jsonb not null default '[]'::jsonb
);
insert into public.juegos_bingo (id) values (1) on conflict (id) do nothing;

-- Los cartones van en juegos_solo: se amplía el check de la columna juego (sin «bingo», cada compra fallaba).
alter table public.juegos_solo drop constraint if exists juegos_solo_juego_check;
alter table public.juegos_solo add constraint juegos_solo_juego_check
  check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo'));

alter table public.juegos_bingo enable row level security;
alter table public.juegos_bingo owner to juegos_api;
revoke all on public.juegos_bingo from anon, authenticated, service_role;
