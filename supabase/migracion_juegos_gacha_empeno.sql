-- Gacha: las cartas dejan de tener poderes y pasan a servir de garantía (empeño). Ya aplicada en producción.
-- empeno: { prestamo, devolver, vence (ms) } mientras la carta está empeñada al banco; null si no.
-- La tabla sigue siendo de juegos_api (añadir una columna no cambia el dueño).
alter table public.juegos_gacha_cartas add column if not exists empeno jsonb;

-- origen: 'mesa' si la carta se cogió gratis de la mesa (se vende y se empeña a mitad de precio). Ya aplicada.
-- Las que ya tenía la gente se marcaron con el registro de movimientos (solo guarda 7 días; las anteriores, precio entero).
alter table public.juegos_gacha_cartas add column if not exists origen text;
update public.juegos_gacha_cartas c set origen = 'mesa'
where c.origen is null
  and (select t.tipo from public.juegos_gacha_tiradas t
       where t.carta = c.carta and t.usuario_id = c.usuario_id and t.tipo in ('cogida', 'guardada', 'fusion')
       order by t.id desc limit 1) = 'cogida';
