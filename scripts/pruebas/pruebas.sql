-- Pruebas del esquema. Se ejecuta con psql -v ON_ERROR_STOP=1 después de
-- cargar auth_stub.sql, la migración y seed.sql. El CSV migrado entra por la
-- entrada estándar: psql -f pruebas.sql < movimientos_migrados.csv

\pset tuples_only on

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id) values
    ('00000000-0000-0000-0000-00000000000a'),  -- Carli
    ('00000000-0000-0000-0000-00000000000b');  -- alguien que no es miembro
insert into public.miembros (user_id, nombre) values
    ('00000000-0000-0000-0000-00000000000a', 'Carli');

create function pg_temp.verificar(condicion boolean, mensaje text) returns void
language plpgsql as $$
begin
    if not condicion then
        raise exception 'FALLÓ: %', mensaje;
    end if;
    raise notice 'ok · %', mensaje;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Cuotas
-- -----------------------------------------------------------------------------
insert into public.movimientos (fecha, subgrupo_id, concepto, monto, cuotas, primer_periodo, medio_pago_id)
select '2027-01-12', s.id, 'Prueba 3 cuotas', 100000, 3, '2027-02-01', mp.id
from public.subgrupos s, public.medios_pago mp
where s.nombre = 'Construcción' and mp.nombre = 'TC Carli';

select pg_temp.verificar(
    (select count(*) = 3 and sum(i.monto) = 100000 and max(i.periodo) = '2027-04-01'
     from public.imputaciones i join public.movimientos m on m.id = i.movimiento_id
     where m.concepto = 'Prueba 3 cuotas'),
    '100.000 en 3 cuotas: 3 imputaciones de feb a abr que suman el total');

select pg_temp.verificar(
    (select i.monto = 33333.34 from public.imputaciones i join public.movimientos m on m.id = i.movimiento_id
     where m.concepto = 'Prueba 3 cuotas' and nro_cuota = 3),
    'los centavos sobrantes van a la última cuota');

update public.movimientos set cuotas = 6, monto = 5000, monto_es_cuota = true
where concepto = 'Prueba 3 cuotas';

select pg_temp.verificar(
    (select count(*) = 6 and sum(i.monto) = 30000
     from public.imputaciones i join public.movimientos m on m.id = i.movimiento_id
     where m.concepto = 'Prueba 3 cuotas'),
    'al editar se regeneran las cuotas (6 cuotas de 5.000)');

delete from public.movimientos where concepto = 'Prueba 3 cuotas';
select pg_temp.verificar((select count(*) = 0 from public.imputaciones), 'al borrar el movimiento se borran sus cuotas');

-- -----------------------------------------------------------------------------
-- 2. Carga de la migración (lo mismo que hará Sincronizar)
-- -----------------------------------------------------------------------------
create temp table csv_movimientos (
    fecha date, tipo text, grupo text, subgrupo text, concepto text, monto numeric,
    cuotas text, mes_primera_cuota text, medio text, quien text
);
\copy csv_movimientos from pstdin with (format csv, header true)

select pg_temp.verificar(
    not exists (
        select 1 from csv_movimientos c
        left join public.grupos g on g.nombre = c.grupo
        left join public.subgrupos s on s.grupo_id = g.id and s.nombre = c.subgrupo
        where s.id is null),
    'todos los grupos/subgrupos de la migración existen en el catálogo');

select pg_temp.verificar(
    not exists (select 1 from csv_movimientos c left join public.medios_pago mp on mp.nombre = c.medio where mp.id is null),
    'todos los medios de pago de la migración existen');

select pg_temp.verificar(
    not exists (
        select 1 from csv_movimientos c join public.grupos g on g.nombre = c.grupo
        where (g.tipo = 'ingreso') <> (c.tipo = 'Ingreso')),
    'el tipo de cada fila coincide con el tipo de su grupo');

insert into public.movimientos (fecha, subgrupo_id, concepto, monto, primer_periodo, medio_pago_id, quien, origen)
select c.fecha, s.id, c.concepto, c.monto, date_trunc('month', c.fecha)::date, mp.id, c.quien, 'migracion'
from csv_movimientos c
join public.grupos g      on g.nombre = c.grupo
join public.subgrupos s   on s.grupo_id = g.id and s.nombre = c.subgrupo
join public.medios_pago mp on mp.nombre = c.medio;

select pg_temp.verificar(
    (select count(*) from public.movimientos) = (select count(*) from csv_movimientos),
    'se cargaron todas las filas de la migración');

select pg_temp.verificar(
    (select sum(saldo) from public.v_resumen_mensual)
      = (select sum(case when tipo = 'Ingreso' then monto else -monto end) from csv_movimientos),
    'el saldo de v_resumen_mensual coincide con el CSV');

-- -----------------------------------------------------------------------------
-- 3. Seguridad: solo los miembros ven datos
-- -----------------------------------------------------------------------------
set role authenticated;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); end $$;
select pg_temp.verificar((select count(*) = 0 from public.movimientos), 'un usuario que no es miembro no ve movimientos');
select pg_temp.verificar((select count(*) = 0 from public.v_resumen_mensual), 'ni los tableros');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); end $$;
select pg_temp.verificar((select count(*) > 0 from public.movimientos), 'un miembro ve los movimientos');

insert into public.movimientos (fecha, subgrupo_id, concepto, monto, cuotas, primer_periodo)
select '2027-01-05', id, 'Prueba desde la app', 12000, 2, '2027-01-01' from public.subgrupos where nombre = 'Nafta';
select pg_temp.verificar(
    (select count(*) = 2 from public.v_imputaciones where concepto = 'Prueba desde la app'),
    'un miembro carga un gasto en cuotas y se generan las imputaciones');

reset role;

\pset tuples_only off
\echo
\echo Resumen mensual migrado:
select to_char(periodo, 'MM/YYYY') as mes, ingresos, gastos, saldo
from public.v_resumen_mensual where periodo < '2027-01-01' order by periodo;
