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
        where c.tipo <> case g.tipo when 'ingreso' then 'Ingreso'
                                    when 'inversion' then 'Inversión'
                                    else 'Gasto' end),
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
      = (select sum(case when tipo = 'Gasto' then -monto else monto end) from csv_movimientos),
    'el saldo de v_resumen_mensual coincide con el CSV');

-- -----------------------------------------------------------------------------
-- 3. Personas ("Quién")
-- -----------------------------------------------------------------------------
update public.personas set nombre = 'Melisa' where nombre = 'Meli';
select pg_temp.verificar(
    (select count(*) from public.movimientos where quien = 'Melisa') > 0
      and not exists (select 1 from public.movimientos where quien = 'Meli'),
    'renombrar una persona actualiza sus movimientos');
update public.personas set nombre = 'Meli' where nombre = 'Melisa';

do $$
begin
    insert into public.movimientos (fecha, subgrupo_id, concepto, monto, primer_periodo, quien)
    select '2027-01-05', id, 'Quién inválido', 100, '2027-01-01', 'Juan' from public.subgrupos limit 1;
    raise exception 'FALLÓ: se aceptó un quién que no existe';
exception when foreign_key_violation then
    raise notice 'ok · no se acepta un quién que no está en personas';
end
$$;

do $$
begin
    delete from public.personas where nombre = 'Carli';
    raise exception 'FALLÓ: se borró una persona con movimientos';
exception when foreign_key_violation then
    raise notice 'ok · no se puede borrar una persona con movimientos';
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Plazos fijos
-- -----------------------------------------------------------------------------
create temp table ids_pf (nombre text primary key, id bigint);

insert into ids_pf
select 'primero', public.guardar_plazo_fijo(
    null,
    (select s.id from public.subgrupos s join public.grupos g on g.id = s.grupo_id
     where g.nombre = 'Inversiones' and s.nombre = 'Plazos fijos'),
    'Galicia', 1000000, 36.5, '2027-03-01', '2027-03-31',
    (select id from public.medios_pago where nombre = 'Transferencia'), 'Carli', null);

select pg_temp.verificar(
    (select interes = 30000 from public.plazos_fijos where id = (select id from ids_pf where nombre = 'primero')),
    'interés de $1.000.000 al 36,5% TNA por 30 días = $30.000');

select pg_temp.verificar(
    (select array_agg(monto order by monto) = array[-1000000, 1030000]::numeric[]
            and array_agg(concepto order by monto) = array['Plazo fijo Galicia', 'Vencimiento plazo fijo Galicia']
     from public.movimientos where plazo_fijo_id = (select id from ids_pf where nombre = 'primero')),
    'genera la salida del capital y la vuelta con intereses');

select pg_temp.verificar(
    (select inversiones = 30000 from public.v_resumen_mensual where periodo = '2027-03-01'),
    'en el mes, el neto de inversiones es el interés ganado');

insert into ids_pf
select 'renovado', public.guardar_plazo_fijo(
    null, (select subgrupo_id from public.v_plazos_fijos where id = (select id from ids_pf where nombre = 'primero')),
    'Galicia', 1030000, 30, '2027-03-31', '2027-04-30',
    (select id from public.medios_pago where nombre = 'Transferencia'), 'Carli', null,
    (select id from ids_pf where nombre = 'primero'));

select pg_temp.verificar(
    (select estado = 'renovado' from public.v_plazos_fijos where id = (select id from ids_pf where nombre = 'primero'))
      and (select renovado_de = (select id from ids_pf where nombre = 'primero')
           from public.v_plazos_fijos where id = (select id from ids_pf where nombre = 'renovado')),
    'al renovar, el plazo anterior queda como renovado y el nuevo sabe de cuál viene');

select public.guardar_plazo_fijo(
    (select id from ids_pf where nombre = 'renovado'),
    (select subgrupo_id from public.v_plazos_fijos where id = (select id from ids_pf where nombre = 'renovado')),
    'Galicia', 1030000, 40, '2027-03-31', '2027-04-30', null, 'Carli', null);

select pg_temp.verificar(
    (select count(*) = 2 and max(monto) = 1030000 + round(1030000 * 0.40 * 30 / 365, 2)
     from public.movimientos where plazo_fijo_id = (select id from ids_pf where nombre = 'renovado')),
    'al editar la tasa se regeneran los dos movimientos con el interés nuevo');

delete from public.plazos_fijos where id = (select id from ids_pf where nombre = 'primero');
select pg_temp.verificar(
    not exists (select 1 from public.movimientos where plazo_fijo_id = (select id from ids_pf where nombre = 'primero'))
      and (select renovado_de is null from public.v_plazos_fijos where id = (select id from ids_pf where nombre = 'renovado')),
    'al borrar un plazo se borran sus movimientos y el renovado queda suelto');

do $$
begin
    perform public.guardar_plazo_fijo(null, 1, 'X', 1000, 30, '2027-05-01', '2027-04-01', null, 'Carli', null);
    raise exception 'FALLÓ: se aceptó un vencimiento anterior al inicio';
exception when check_violation then
    raise notice 'ok · no acepta un vencimiento anterior a la fecha de inicio';
end
$$;

delete from public.plazos_fijos;

-- -----------------------------------------------------------------------------
-- 5. Seguridad: solo los miembros ven datos
-- -----------------------------------------------------------------------------
set role authenticated;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); end $$;
select pg_temp.verificar((select count(*) = 0 from public.movimientos), 'un usuario que no es miembro no ve movimientos');
select pg_temp.verificar((select count(*) = 0 from public.v_resumen_mensual), 'ni los tableros');
select pg_temp.verificar((select count(*) = 0 from public.personas), 'ni las personas');
select pg_temp.verificar((select count(*) = 0 from public.v_plazos_fijos), 'ni los plazos fijos');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); end $$;
select pg_temp.verificar((select count(*) > 0 from public.movimientos), 'un miembro ve los movimientos');

insert into public.movimientos (fecha, subgrupo_id, concepto, monto, cuotas, primer_periodo)
select '2027-01-05', id, 'Prueba desde la app', 12000, 2, '2027-01-01' from public.subgrupos where nombre = 'Nafta';
select pg_temp.verificar(
    (select count(*) = 2 from public.v_imputaciones where concepto = 'Prueba desde la app'),
    'un miembro carga un gasto en cuotas y se generan las imputaciones');

-- (en dos consultas: lo que inserta la función se ve recién en la siguiente)
select public.guardar_plazo_fijo(null, (select id from public.subgrupos where nombre = 'Plazos fijos'),
    'Nación', 500000, 30, '2027-06-01', '2027-07-01', null, 'Carli', null);
select pg_temp.verificar(
    (select count(*) = 2 from public.v_imputaciones
     where concepto in ('Plazo fijo Nación', 'Vencimiento plazo fijo Nación')),
    'un miembro carga un plazo fijo');

reset role;

\pset tuples_only off
\echo
\echo Resumen mensual migrado:
select to_char(periodo, 'MM/YYYY') as mes, ingresos, gastos, inversiones, saldo
from public.v_resumen_mensual where periodo < '2027-01-01' order by periodo;
