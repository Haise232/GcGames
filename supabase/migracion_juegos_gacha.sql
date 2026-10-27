-- Gacha de Juegos, al estilo de Mudae, con políticos españoles. Las cartas no están en la base de datos: viven en
-- api/_juegos/gacha-catalogo.json. RLS activado y sin políticas, como el resto de Juegos: solo la función del servidor
-- lee y escribe.

-- Gacha: cartas con dueño, la mesa (cartas gratis que salen solas), el registro de movimientos y el estado de cada jugador.
-- Cada carta tiene como mucho un dueño.
create table if not exists public.juegos_gacha_cartas (
  carta          text primary key,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  reclamada      timestamptz not null default now(),
  poderes_usados jsonb not null default '{}'::jsonb -- { juego: ms }: última vez que se usó su poder en cada juego
);
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
  pendiente_premium boolean not null default false
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

alter table public.juegos_gacha_cartas    enable row level security;
alter table public.juegos_gacha_mesa      enable row level security;
alter table public.juegos_gacha_estado    enable row level security;
alter table public.juegos_gacha_tiradas   enable row level security;
alter table public.juegos_gacha_jugadores enable row level security;
alter table public.juegos_gacha_efectos   enable row level security;

-- La función de Juegos se conecta como juegos_api (dueño de las demás tablas de juegos): si esta migración se ejecuta
-- como postgres, las tablas tienen que pasar a ser suyas o cada petición del gacha falla con «permission denied».
alter table public.juegos_gacha_cartas    owner to juegos_api;
alter table public.juegos_gacha_mesa      owner to juegos_api;
alter table public.juegos_gacha_estado    owner to juegos_api;
alter table public.juegos_gacha_tiradas   owner to juegos_api;
alter table public.juegos_gacha_jugadores owner to juegos_api;
alter table public.juegos_gacha_efectos   owner to juegos_api;
alter sequence public.juegos_gacha_mesa_id_seq    owner to juegos_api;
alter sequence public.juegos_gacha_tiradas_id_seq owner to juegos_api;
revoke all on public.juegos_gacha_cartas, public.juegos_gacha_mesa, public.juegos_gacha_estado, public.juegos_gacha_tiradas,
  public.juegos_gacha_jugadores, public.juegos_gacha_efectos from anon, authenticated, service_role;
revoke all on sequence public.juegos_gacha_mesa_id_seq, public.juegos_gacha_tiradas_id_seq from anon, authenticated, service_role;
