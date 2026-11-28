-- =============================================================================
-- Plazos fijos
--
-- Cada plazo fijo genera dos movimientos en el grupo de Inversiones:
--   * el día de constitución, sale el capital (monto negativo);
--   * el día del vencimiento, vuelve capital + interés (monto positivo).
-- Así el resumen mensual ya refleja la plata que vuelve, sin cargarla a mano.
--
-- Interés = capital × TNA × días / 365 (como lo calculan los bancos en Argentina).
-- Renovar es crear un plazo nuevo que arranca el día del vencimiento del anterior;
-- el anterior queda marcado con `renovado_por`.
-- =============================================================================

create table public.plazos_fijos (
    id                bigint generated always as identity primary key,
    entidad           text,
    capital           numeric(14, 2) not null check (capital > 0),
    tna               numeric(7, 3)  not null check (tna >= 0 and tna < 1000),
    fecha_inicio      date not null,
    fecha_vencimiento date not null,
    interes           numeric(14, 2) generated always as
                          (round(capital * tna / 100 * (fecha_vencimiento - fecha_inicio) / 365, 2)) stored,
    renovado_por      bigint references public.plazos_fijos (id) on delete set null,
    creado_en         timestamptz not null default now(),
    check (fecha_vencimiento > fecha_inicio)
);

-- Los movimientos que genera cada plazo: se borran con él.
alter table public.movimientos
    add column plazo_fijo_id bigint references public.plazos_fijos (id) on delete cascade;

create index movimientos_plazo_fijo_idx on public.movimientos (plazo_fijo_id);

alter table public.plazos_fijos enable row level security;

create policy plazos_fijos_miembros on public.plazos_fijos
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());

-- Plazos con su estado: vigente, vencido (sin renovar) o renovado.
create view public.v_plazos_fijos
with (security_invoker = true) as
select pf.*,
       pf.fecha_vencimiento - pf.fecha_inicio as dias,
       pf.capital + pf.interes                as total,
       anterior.id                            as renovado_de,
       case
           when pf.renovado_por is not null           then 'renovado'
           when pf.fecha_vencimiento <= current_date  then 'vencido'
           else 'vigente'
       end as estado,
       inversion.subgrupo_id,
       inversion.medio_pago_id,
       inversion.quien,
       inversion.notas
from public.plazos_fijos pf
left join public.plazos_fijos anterior on anterior.renovado_por = pf.id
left join lateral (
    select m.subgrupo_id, m.medio_pago_id, m.quien, m.notas
    from public.movimientos m
    where m.plazo_fijo_id = pf.id and m.monto < 0
    limit 1
) inversion on true;

-- -----------------------------------------------------------------------------
-- Crear o editar un plazo fijo junto con sus dos movimientos, en una sola
-- operación. Con p_id null lo crea; con p_id lo actualiza y regenera los
-- movimientos. p_renovado_de marca al plazo anterior como renovado por este.
-- Corre con los permisos de quien llama: aplican las políticas RLS.
-- -----------------------------------------------------------------------------
create function public.guardar_plazo_fijo(
    p_id                bigint,
    p_subgrupo_id       bigint,
    p_entidad           text,
    p_capital           numeric,
    p_tna               numeric,
    p_fecha_inicio      date,
    p_fecha_vencimiento date,
    p_medio_pago_id     bigint,
    p_quien             text,
    p_notas             text,
    p_renovado_de       bigint default null
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id      bigint;
    v_interes numeric;
    v_nombre  text := 'Plazo fijo' || coalesce(' ' || nullif(trim(p_entidad), ''), '');
begin
    if p_id is null then
        insert into plazos_fijos (entidad, capital, tna, fecha_inicio, fecha_vencimiento)
        values (nullif(trim(p_entidad), ''), p_capital, p_tna, p_fecha_inicio, p_fecha_vencimiento)
        returning id, interes into v_id, v_interes;
    else
        update plazos_fijos
        set entidad = nullif(trim(p_entidad), ''), capital = p_capital, tna = p_tna,
            fecha_inicio = p_fecha_inicio, fecha_vencimiento = p_fecha_vencimiento
        where id = p_id
        returning id, interes into v_id, v_interes;
        if v_id is null then
            raise exception 'No existe el plazo fijo %', p_id;
        end if;
        delete from movimientos where plazo_fijo_id = v_id;
    end if;

    insert into movimientos (fecha, subgrupo_id, concepto, monto, primer_periodo,
                             medio_pago_id, quien, notas, origen, plazo_fijo_id)
    values
        (p_fecha_inicio, p_subgrupo_id, v_nombre, -p_capital,
         date_trunc('month', p_fecha_inicio)::date, p_medio_pago_id, p_quien, p_notas, 'formulario', v_id),
        (p_fecha_vencimiento, p_subgrupo_id, 'Vencimiento ' || lower(left(v_nombre, 1)) || substr(v_nombre, 2),
         p_capital + v_interes, date_trunc('month', p_fecha_vencimiento)::date,
         p_medio_pago_id, p_quien, p_notas, 'formulario', v_id);

    if p_renovado_de is not null then
        update plazos_fijos set renovado_por = v_id where id = p_renovado_de;
    end if;

    return v_id;
end;
$$;
