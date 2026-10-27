-- ════════════════════════════════════════════════════════════
-- Juegos de TopCode: saldos semanales, mesas públicas, score y chat.
--
-- NO hace falta ejecutarlo a mano: la función /api/juegos crea estas tablas la
-- primera vez que alguien entra a juegos (es idempotente). Queda aquí como
-- referencia, igual que el resto de migraciones.
--
-- RLS activado sin políticas: desde el navegador no se puede leer ni escribir
-- nada; solo la función de Vercel (conexión directa a Postgres).
-- ════════════════════════════════════════════════════════════

create table if not exists public.juegos_meta (
  id            int primary key default 1 check (id = 1),
  semana        text not null,
  semana_pasada jsonb
);

create table if not exists public.juegos_cuentas (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  nombre     text not null default '',
  avatar     text,
  saldo      bigint not null default 10000,
  dias       bigint[] not null default array[null, null, null, null, null, null, null]::bigint[],
  jugado     boolean not null default false,
  mesa       text,
  visto      timestamptz not null default now()
);
create index if not exists juegos_cuentas_ranking_idx on public.juegos_cuentas (saldo desc) where jugado;

create table if not exists public.juegos_mesas (
  codigo      text primary key,
  juego       text not null check (juego in ('blackjack', 'poker')),
  etiqueta    text not null,
  numero      int not null,
  persistente boolean not null default false,
  estado      jsonb not null,
  version     int not null default 0,
  actualizado timestamptz not null default now()
);
create unique index if not exists juegos_mesas_numero_idx on public.juegos_mesas (juego, numero);

create table if not exists public.juegos_chat (
  id         bigserial primary key,
  mesa       text not null,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nombre     text not null,
  avatar     text,
  texto      text not null check (char_length(texto) between 1 and 200),
  creado     timestamptz not null default now()
);
create index if not exists juegos_chat_mesa_idx on public.juegos_chat (mesa, id desc);
create index if not exists juegos_chat_usuario_idx on public.juegos_chat (usuario_id, creado desc);

-- Partida en curso de los juegos en solitario (racha de la ruleta, mano del blackjack).
create table if not exists public.juegos_solo (
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  juego       text not null check (juego in ('roulette', 'blackjack', 'crash')),
  estado      jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (usuario_id, juego)
);

alter table public.juegos_meta    enable row level security;
alter table public.juegos_cuentas enable row level security;
alter table public.juegos_mesas   enable row level security;
alter table public.juegos_chat    enable row level security;
alter table public.juegos_solo    enable row level security;
