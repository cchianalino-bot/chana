-- =============================================================================
-- La huella de cada fila importada pasa a usar el id de la persona en vez de
-- su nombre, para que renombrar a alguien en Ajustes no haga que todas sus
-- filas de la planilla parezcan nuevas.
--
-- Recalcula las huellas ya guardadas con la misma cuenta que hace la app
-- (interpretarFila en app/src/lib/sincronizacion.js):
--
--   sha256( fecha|tipo|grupo_id|subgrupo_id|concepto normalizado|monto|cuotas|
--           primer_periodo|medio_pago_id|persona_id  #  n° de repetición )
--
-- El concepto se normaliza igual que en la app: sin tildes, sin espacios
-- repetidos ni en los extremos, en minúsculas. Las filas idénticas se
-- numeran 1, 2, 3… igual que en la planilla.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create function pg_temp.clave_texto(t text) returns text
language sql immutable as $$
    select lower(regexp_replace(
        btrim(regexp_replace(normalize(t, NFD), '[̀-ͯ]', '', 'g')),
        '\s+', ' ', 'g'))
$$;

with base as (
    select m.id,
           concat_ws('|',
               m.fecha::text,
               g.tipo,
               g.id::text,
               s.id::text,
               pg_temp.clave_texto(m.concepto),
               m.monto::numeric(14, 2)::text,
               m.cuotas::text,
               m.primer_periodo::text,
               m.medio_pago_id::text,
               p.id::text) as clave
    from public.movimientos m
    join public.subgrupos s on s.id = m.subgrupo_id
    join public.grupos g    on g.id = s.grupo_id
    join public.personas p  on p.nombre = m.quien
    where m.huella is not null
),
numeradas as (
    select id, clave || '#' || row_number() over (partition by clave order by id) as texto
    from base
)
update public.movimientos m
set huella = encode(extensions.digest(n.texto, 'sha256'), 'hex')
from numeradas n
where n.id = m.id;
