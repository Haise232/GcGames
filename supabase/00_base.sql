-- Base del proyecto Juegos en Supabase: las cuentas (usuarios) y el rol de la función de Vercel (juegos_api).
-- Las tablas juegos_* las crea la propia función con api/_juegos/schema.mjs (son de juegos_api).
-- La contraseña de juegos_api se pone aparte: alter role juegos_api password '…' (va en JUEGOS_DATABASE_URL).

create table if not exists public.usuarios (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text not null,
  email         text not null,
  avatar_url    text,
  es_superadmin boolean not null default false,
  estado_acceso text not null default 'pendiente' check (estado_acceso in ('pendiente', 'aprobado', 'rechazado')),
  created_at    timestamptz not null default now()
);

-- Desde el navegador no se lee ni se escribe la tabla: el perfil propio sale de get_mi_perfil() y lo demás lo hace la
-- función de Vercel.
alter table public.usuarios enable row level security;
revoke all on public.usuarios from anon, authenticated;

-- Al registrarse en Supabase Auth se crea su fila, pendiente hasta que el master la acepte en la banca.
create or replace function public.juegos_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nombre, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Jugador'), 40),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists juegos_nuevo_usuario on auth.users;
create trigger juegos_nuevo_usuario after insert on auth.users
  for each row execute function public.juegos_nuevo_usuario();

-- Tu perfil (lo pide la app al entrar).
create or replace function public.get_mi_perfil()
returns table (id uuid, nombre text, email text, avatar_url text, es_superadmin boolean, estado_acceso text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nombre, u.email, u.avatar_url, u.es_superadmin, u.estado_acceso
  from public.usuarios u where u.id = auth.uid()
$$;
revoke all on function public.get_mi_perfil() from public, anon;
grant execute on function public.get_mi_perfil() to authenticated;
revoke all on function public.juegos_nuevo_usuario() from public, anon, authenticated;

-- Rol de la función de Vercel: dueño de las tablas juegos_* (las crea él) y con acceso a usuarios.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'juegos_api') then
    create role juegos_api login noinherit;
  end if;
end
$$;
grant usage, create on schema public to juegos_api;
grant select, update, references on public.usuarios to juegos_api;

-- usuarios tiene RLS: sin esta política juegos_api (que no es su dueño) no vería ni podría cambiar ninguna fila.
create policy juegos_api_usuarios on public.usuarios for all to juegos_api using (true) with check (true);
