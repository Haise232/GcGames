-- Hacienda en Juegos (api/_juegos/hacienda.mjs): al llegar a 100.000 €, 200.000 €… llega la declaración, hay
-- inspecciones sorpresa y redadas del master. Lo que cobra va a la jaula del bingo.

-- Estado de cada cuenta: { tramo, pend, fraude, insp }. Se vacía en el reinicio del domingo.
alter table public.juegos_cuentas add column if not exists hacienda jsonb not null default '{}'::jsonb;

-- Avisos de Hacienda: «hacienda» para quien paga (la animación grande) y «hacienda_todos» para el resto (sujeto: a quién
-- se cobró, que no lo ve dos veces). datos: qué cobró y por qué.
alter table public.juegos_avisos add column if not exists datos jsonb;
alter table public.juegos_avisos add column if not exists sujeto uuid references public.usuarios(id) on delete cascade;
alter table public.juegos_avisos drop constraint if exists juegos_avisos_tipo_check;
alter table public.juegos_avisos add constraint juegos_avisos_tipo_check
  check (tipo in ('dinero', 'mensaje', 'hacienda', 'hacienda_todos'));
