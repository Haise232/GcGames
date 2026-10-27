-- Juegos: la banca decide cuándo se puede llevar el bote del bingo. control es la lista de aperturas
-- [{ desde, hasta, una }] (ms; hasta null = sin límite; una = se cierra en cuanto alguien se lo lleve), de la más nueva a
-- la más vieja. Vacía = bote cerrado. Se puede ejecutar más de una vez.
alter table public.juegos_bingo add column if not exists control jsonb not null default '[]'::jsonb;

alter table public.juegos_bingo owner to juegos_api;
revoke all on public.juegos_bingo from anon, authenticated, service_role;
