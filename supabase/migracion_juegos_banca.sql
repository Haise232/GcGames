-- Banca de Juegos: el master de TopCode (usuarios.es_superadmin) da dinero, manda mensajes a nombre de la banca y activa
-- el Admin Abuse. RLS activado y sin políticas, como el resto de Juegos: solo la función del servidor lee y escribe.

-- Admin Abuse activo: { modo: 'x2' | 'x3' | 'gratis', ambito: 'todo' | 'poker', desde: ms, hasta: ms } o null.
alter table public.juegos_meta add column if not exists abuso jsonb;

-- Avisos de la banca: dinero recibido o un mensaje. usuario_id null = para todos. Se borran a los 7 días.
create table if not exists public.juegos_avisos (
  id         bigserial primary key,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  tipo       text not null check (tipo in ('dinero', 'mensaje')),
  importe    bigint,
  texto      text check (texto is null or char_length(texto) <= 300),
  creado     timestamptz not null default now()
);
create index if not exists juegos_avisos_usuario_idx on public.juegos_avisos (usuario_id, id);

-- Último aviso que ya vio cada persona.
create table if not exists public.juegos_avisos_vistos (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  ultimo     bigint not null default 0
);

alter table public.juegos_avisos        enable row level security;
alter table public.juegos_avisos_vistos enable row level security;
alter table public.juegos_avisos        owner to juegos_api;
alter table public.juegos_avisos_vistos owner to juegos_api;
alter sequence public.juegos_avisos_id_seq owner to juegos_api;
revoke all on public.juegos_avisos, public.juegos_avisos_vistos from anon, authenticated, service_role;
revoke all on sequence public.juegos_avisos_id_seq from anon, authenticated, service_role;

-- La función de Juegos comprueba quién es el master.
grant select (es_superadmin) on public.usuarios to juegos_api;
