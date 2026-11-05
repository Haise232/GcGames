// Tablas de juegos. Las crea la propia función la primera vez (idempotente); el mismo SQL está en
// supabase/migracion_juegos.sql por si se prefiere ejecutarlo a mano.
// RLS activado y sin políticas: desde el navegador no se puede leer ni escribir nada; solo la función del servidor.
export const SCHEMA_SQL = `
create table if not exists public.juegos_meta (
  id            int primary key default 1 check (id = 1),
  semana        text not null,
  semana_pasada jsonb
);

create table if not exists public.juegos_cuentas (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  nombre     text not null default '',
  avatar     text,
  saldo      bigint not null default 15000,
  dias       bigint[] not null default array[null, null, null, null, null, null, null]::bigint[],
  jugado     boolean not null default false,
  mesa       text,
  visto      timestamptz not null default now(),
  hacienda   jsonb not null default '{}'::jsonb -- Hacienda (hacienda.mjs): tramo pagado, declaración pendiente…
);
create index if not exists juegos_cuentas_ranking_idx on public.juegos_cuentas (saldo desc) where jugado;

create table if not exists public.juegos_mesas (
  codigo      text primary key,
  juego       text not null check (juego in ('blackjack', 'poker', 'chess')),
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
  juego       text not null check (juego in ('roulette', 'blackjack', 'crash', 'frog', 'race', 'dungeon', 'bribe', 'wheel', 'bingo', 'tower', 'heist', 'auction', 'bridge', 'elevator', 'inmo', 'fish', 'dig')),
  estado      jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (usuario_id, juego)
);

-- Gacha (igual que supabase/migracion_juegos_gacha.sql): cartas con dueño, la mesa (cartas gratis que salen solas), el registro de movimientos y el estado de cada jugador.
-- Cada carta tiene como mucho un dueño.
create table if not exists public.juegos_gacha_cartas (
  carta          text primary key,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  reclamada      timestamptz not null default now(),
  poderes_usados jsonb not null default '{}'::jsonb, -- de cuando las cartas tenían poderes (ya no se usa)
  empeno         jsonb, -- { prestamo, devolver, vence (ms) } si está empeñada al banco
  origen         text -- 'mesa' si se cogió gratis de la mesa (vale la mitad); null si se sacó pagando o por fusión
);
alter table public.juegos_gacha_cartas add column if not exists empeno jsonb;
alter table public.juegos_gacha_cartas add column if not exists origen text;
create index if not exists juegos_gacha_cartas_usuario_idx on public.juegos_gacha_cartas (usuario_id);

-- La mesa: hasta 5 cartas a la vista de todos; sale una cada hora y cualquiera puede cogerla.
create table if not exists public.juegos_gacha_mesa (
  id      bigserial primary key,
  carta   text not null unique,
  periodo bigint not null,
  creada  timestamptz not null default now()
);

-- Último periodo de 1 h en el que se repuso la mesa.
create table if not exists public.juegos_gacha_estado (
  id      int primary key default 1 check (id = 1),
  periodo bigint not null
);

-- Registro de movimientos (el canal): «mesa» (salió en la mesa), «cogida» o «guardada» (la sacó pagando y se la quedó).
-- Se borra lo de hace más de 7 días.
create table if not exists public.juegos_gacha_tiradas (
  id            bigserial primary key,
  usuario_id    uuid references public.usuarios(id) on delete cascade,
  carta         text not null,
  premium       boolean not null default false,
  creada        timestamptz not null default now(),
  reclamada_por uuid references public.usuarios(id) on delete set null,
  tipo          text not null default 'tirada'
);
create index if not exists juegos_gacha_tiradas_creada_idx on public.juegos_gacha_tiradas (creada desc);

-- Cuándo puede volver a coger una carta de la mesa y la carta que sacó pagando y aún no ha decidido si guardar.
create table if not exists public.juegos_gacha_jugadores (
  usuario_id        uuid primary key references public.usuarios(id) on delete cascade,
  hora              bigint not null default 0,
  tiradas           int not null default 0,
  reclamo_listo     timestamptz not null default 'epoch',
  pendiente         text,
  pendiente_premium boolean not null default false,
  forzada           text -- carta preparada por el master para su próxima tirada de pago (una vez)
);

-- Poder del gacha activo en un juego en solitario: un seguro o un premio para las próximas «usos» jugadas.
create table if not exists public.juegos_gacha_efectos (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  juego      text not null,
  tipo       text not null check (tipo in ('seguro', 'premio')),
  pct        int not null,
  usos       int not null,
  nombre     text not null,
  carta      text not null,
  creado     timestamptz not null default now(),
  primary key (usuario_id, juego)
);

-- Banca (igual que supabase/migracion_juegos_banca.sql): Admin Abuse activo y avisos de dinero o mensajes del master.
alter table public.juegos_meta add column if not exists abuso jsonb;
-- Juegos que la banca ha quitado del selector (ids), igual que supabase/migracion_juegos_ocultos.sql.
alter table public.juegos_meta add column if not exists ocultos jsonb not null default '[]'::jsonb;
create table if not exists public.juegos_avisos (
  id         bigserial primary key,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  tipo       text not null check (tipo in ('dinero', 'mensaje', 'hacienda', 'hacienda_todos')),
  importe    bigint,
  texto      text check (texto is null or char_length(texto) <= 300),
  datos      jsonb,                                              -- Hacienda: qué cobró y por qué
  sujeto     uuid references public.usuarios(id) on delete cascade, -- Hacienda para todos: a quién cobró (él no lo ve)
  creado     timestamptz not null default now()
);
create index if not exists juegos_avisos_usuario_idx on public.juegos_avisos (usuario_id, id);
create table if not exists public.juegos_avisos_vistos (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  ultimo     bigint not null default 0
);

-- Duelos 1 contra 1 (igual que supabase/migracion_juegos_duelos_rueda.sql).
create table if not exists public.juegos_duelos (
  id      bigserial primary key,
  reta    uuid not null references public.usuarios(id) on delete cascade,
  para    uuid references public.usuarios(id) on delete cascade,
  acepta  uuid references public.usuarios(id) on delete set null,
  apuesta bigint not null check (apuesta > 0),
  tipo    text not null check (tipo in ('moneda', 'dados', 'carta')),
  estado  text not null default 'abierto' check (estado in ('abierto', 'jugado', 'cancelado', 'caducado')),
  ganador text check (ganador in ('reta', 'acepta')),
  detalle jsonb,
  extra   bigint not null default 0,
  creado  timestamptz not null default now(),
  jugado  timestamptz
);
create index if not exists juegos_duelos_estado_idx on public.juegos_duelos (estado, id desc);
create index if not exists juegos_duelos_reta_idx on public.juegos_duelos (reta);

-- Bingo (igual que supabase/migracion_juegos_bingo.sql): la jaula (el bote) y las últimas partidas.
create table if not exists public.juegos_bingo (
  id        int primary key default 1 check (id = 1),
  bote      bigint not null default 0 check (bote >= 0),
  historial jsonb not null default '[]'::jsonb,
  control   jsonb not null default '[]'::jsonb
);
insert into public.juegos_bingo (id) values (1) on conflict (id) do nothing;
-- Últimas rondas de la Subasta, el Puente y el Ascensor (supabase/migracion_juegos_season3.sql y _ascensor.sql): quién ganó y qué pasó.
create table if not exists public.juegos_rondas (
  juego  text not null check (juego in ('auction', 'bridge', 'elevator')),
  ronda  bigint not null,
  datos  jsonb not null,
  creado timestamptz not null default now(),
  primary key (juego, ronda)
);

-- Cuándo deja la banca llevarse el bote (supabase/migracion_juegos_bote.sql).
alter table public.juegos_bingo add column if not exists control jsonb not null default '[]'::jsonb;

-- Inmobiliaria (supabase/migracion_juegos_inmobiliaria.sql): las propiedades del tablero (una fila por casilla con
-- dueño) y lo que ha pasado en él.
create table if not exists public.juegos_inmuebles (
  casilla          int primary key,
  usuario_id       uuid not null references public.usuarios(id) on delete cascade,
  nivel            int not null default 0, -- 0 solar, 1 a 4 casas, 5 hotel
  invertido        bigint not null, -- compra y mejoras
  invertido_semana bigint not null, -- lo invertido en la semana «semana» (se vende al 85 %; lo de antes, al 25 %)
  semana           text not null,
  cobrado          bigint not null, -- ms: hasta cuándo está cobrado el alquiler
  comprada         timestamptz not null default now()
);
create index if not exists juegos_inmuebles_usuario_idx on public.juegos_inmuebles (usuario_id);
create table if not exists public.juegos_inmuebles_log (
  id         bigserial primary key,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  casilla    int not null,
  tipo       text not null, -- compra, casa, hotel, venta
  importe    bigint not null,
  creado     timestamptz not null default now()
);

-- Cuenta en Suiza (supabase/migracion_juegos_suiza.sql): el efectivo que cada uno esconde de Hacienda.
create table if not exists public.juegos_suiza (
  usuario_id   uuid primary key references public.usuarios(id) on delete cascade,
  saldo        bigint not null default 0,
  saldo_semana bigint not null default 0, -- lo ingresado en la semana «semana» (sale con un 10 % de comisión; lo de antes, al 25 %)
  semana       text not null,
  movs         jsonb not null default '[]'::jsonb, -- los últimos movimientos, para su dueño
  actualizado  timestamptz not null default now()
);

-- El bote del Parking gratuito de la Inmobiliaria (una sola fila).
create table if not exists public.juegos_inmo_bote (
  id   int primary key default 1 check (id = 1),
  bote bigint not null default 0
);

alter table public.juegos_meta    enable row level security;
alter table public.juegos_cuentas enable row level security;
alter table public.juegos_mesas   enable row level security;
alter table public.juegos_chat    enable row level security;
alter table public.juegos_solo    enable row level security;
alter table public.juegos_gacha_cartas    enable row level security;
alter table public.juegos_gacha_mesa      enable row level security;
alter table public.juegos_gacha_estado    enable row level security;
alter table public.juegos_gacha_tiradas   enable row level security;
alter table public.juegos_gacha_jugadores enable row level security;
alter table public.juegos_gacha_efectos   enable row level security;
alter table public.juegos_avisos          enable row level security;
alter table public.juegos_avisos_vistos   enable row level security;
alter table public.juegos_duelos          enable row level security;
alter table public.juegos_bingo           enable row level security;
alter table public.juegos_rondas          enable row level security;
alter table public.juegos_inmuebles       enable row level security;
alter table public.juegos_inmuebles_log   enable row level security;
alter table public.juegos_suiza           enable row level security;
alter table public.juegos_inmo_bote       enable row level security;
`

// Mesas de ajedrez en una base de datos creada antes de que existieran (igual que supabase/migracion_juegos_ajedrez.sql).
export const CHESS_CHECK_SQL = `
alter table public.juegos_mesas drop constraint if exists juegos_mesas_juego_check;
alter table public.juegos_mesas add constraint juegos_mesas_juego_check check (juego in ('blackjack', 'poker', 'chess'));
`
