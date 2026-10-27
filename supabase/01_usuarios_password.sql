-- Banca → Usuarios: el master ve las cuentas con su email y puede poner una contraseña temporal a quien la olvide; quien
-- entra con ella tiene que elegir otra antes de jugar. (Aplicada el 2026-10-27.)
alter table public.usuarios add column if not exists debe_cambiar_password boolean not null default false;

drop function if exists public.get_mi_perfil();
create function public.get_mi_perfil()
returns table (id uuid, nombre text, email text, avatar_url text, es_superadmin boolean, estado_acceso text, debe_cambiar_password boolean)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.nombre, u.email, u.avatar_url, u.es_superadmin, u.estado_acceso, u.debe_cambiar_password
  from public.usuarios u where u.id = auth.uid()
$$;
revoke all on function public.get_mi_perfil() from public, anon;
grant execute on function public.get_mi_perfil() to authenticated;

-- Cuentas con su email y su último acceso (auth.users no la puede leer juegos_api). Solo para el servidor.
create or replace function public.juegos_usuarios_admin()
returns table (id uuid, nombre text, email text, avatar_url text, estado_acceso text, es_superadmin boolean,
               debe_cambiar_password boolean, creado timestamptz, ultimo_acceso timestamptz)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.nombre, coalesce(a.email, u.email), u.avatar_url, u.estado_acceso, u.es_superadmin,
         u.debe_cambiar_password, u.created_at, a.last_sign_in_at
  from public.usuarios u left join auth.users a on a.id = u.id
  order by lower(u.nombre)
$$;
revoke all on function public.juegos_usuarios_admin() from public, anon, authenticated;
grant execute on function public.juegos_usuarios_admin() to juegos_api;

-- Contraseña temporal: la cambia, cierra las sesiones abiertas de esa cuenta y la marca para que elija otra al entrar.
-- La genera el servidor (api/_juegos/banca.mjs) y solo la ve el master. Nunca sobre la cuenta del master.
create or replace function public.juegos_password_temporal(uid uuid, temporal text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if length(temporal) < 8 then
    raise exception 'contraseña temporal demasiado corta';
  end if;
  if exists (select 1 from public.usuarios where id = uid and es_superadmin) then
    return false;
  end if;
  update auth.users set encrypted_password = extensions.crypt(temporal, extensions.gen_salt('bf')), updated_at = now()
  where id = uid;
  if not found then
    return false;
  end if;
  delete from auth.sessions where user_id = uid;
  delete from auth.refresh_tokens where user_id = uid::text;
  update public.usuarios set debe_cambiar_password = true where id = uid;
  return true;
end;
$$;
revoke all on function public.juegos_password_temporal(uuid, text) from public, anon, authenticated;
grant execute on function public.juegos_password_temporal(uuid, text) to juegos_api;

-- Quien entró con la temporal ya eligió la suya (lo llama la app justo después de cambiarla).
create or replace function public.juegos_password_cambiada()
returns void
language sql security definer set search_path = ''
as $$
  update public.usuarios set debe_cambiar_password = false where id = auth.uid()
$$;
revoke all on function public.juegos_password_cambiada() from public, anon;
grant execute on function public.juegos_password_cambiada() to authenticated;
