-- =============================================================================
-- Finanzas familiares · esquema inicial
--
-- Modelo:
--   grupos → subgrupos        clasificación (el tipo ingreso/gasto lo define el grupo)
--   medios_pago               efectivo, transferencia, tarjetas...
--   movimientos               lo que se carga (formulario, planilla o migración)
--   imputaciones              una fila por mes/cuota; los tableros leen de acá
--   sincronizaciones          registro de cada importación desde la planilla
--   miembros                  quiénes pueden usar la app (Meli y Carli)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Acceso: solo los usuarios cargados en `miembros` ven y modifican datos.
-- -----------------------------------------------------------------------------
create table public.miembros (
    user_id  uuid primary key references auth.users (id) on delete cascade,
    nombre   text not null check (nombre in ('Meli', 'Carli')),
    creado_en timestamptz not null default now()
);

create function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.miembros where user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Clasificación
-- -----------------------------------------------------------------------------
create table public.grupos (
    id      bigint generated always as identity primary key,
    nombre  text not null unique,
    tipo    text not null check (tipo in ('ingreso', 'gasto')),
    orden   smallint not null default 0,
    activo  boolean not null default true
);

create table public.subgrupos (
    id        bigint generated always as identity primary key,
    grupo_id  bigint not null references public.grupos (id) on delete restrict,
    nombre    text not null,
    activo    boolean not null default true,
    unique (grupo_id, nombre)
);

create table public.medios_pago (
    id      bigint generated always as identity primary key,
    nombre  text not null unique,
    tipo    text not null check (tipo in ('efectivo', 'transferencia', 'debito', 'tarjeta', 'otro')),
    titular text check (titular in ('Meli', 'Carli', 'Ambos')),
    activo  boolean not null default true
);

-- -----------------------------------------------------------------------------
-- Importaciones desde Google Sheets
-- -----------------------------------------------------------------------------
create table public.sincronizaciones (
    id                bigint generated always as identity primary key,
    creado_en         timestamptz not null default now(),
    creado_por        uuid default auth.uid() references auth.users (id) on delete set null,
    origen            text not null default 'planilla' check (origen in ('planilla', 'migracion')),
    filas_leidas      integer not null default 0,
    filas_importadas  integer not null default 0,
    filas_duplicadas  integer not null default 0,
    filas_con_error   integer not null default 0
);

-- -----------------------------------------------------------------------------
-- Movimientos
--
-- `monto` es el total de la operación, salvo que `monto_es_cuota` sea true:
-- en ese caso es el valor de cada cuota (útil cuando hay recargo y el total
-- no se divide exacto). `primer_periodo` es el mes de la primera cuota.
-- Un ingreso o gasto común es simplemente cuotas = 1.
-- -----------------------------------------------------------------------------
create table public.movimientos (
    id                bigint generated always as identity primary key,
    fecha             date not null,
    subgrupo_id       bigint not null references public.subgrupos (id) on delete restrict,
    concepto          text not null check (length(trim(concepto)) > 0),
    monto             numeric(14, 2) not null check (monto <> 0),
    cuotas            smallint not null default 1 check (cuotas between 1 and 60),
    monto_es_cuota    boolean not null default false,
    primer_periodo    date not null check (extract(day from primer_periodo) = 1),
    medio_pago_id     bigint references public.medios_pago (id) on delete restrict,
    quien             text not null default 'Ambos' check (quien in ('Meli', 'Carli', 'Ambos')),
    notas             text,
    origen            text not null default 'formulario' check (origen in ('formulario', 'planilla', 'migracion')),
    huella            text unique,
    sincronizacion_id bigint references public.sincronizaciones (id) on delete set null,
    creado_por        uuid default auth.uid() references auth.users (id) on delete set null,
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);

comment on column public.movimientos.huella is
    'Identificador de la fila de origen en la planilla; evita importar dos veces lo mismo.';

create index movimientos_fecha_idx on public.movimientos (fecha);
create index movimientos_subgrupo_idx on public.movimientos (subgrupo_id);

create table public.imputaciones (
    id            bigint generated always as identity primary key,
    movimiento_id bigint not null references public.movimientos (id) on delete cascade,
    nro_cuota     smallint not null,
    periodo       date not null check (extract(day from periodo) = 1),
    monto         numeric(14, 2) not null,
    unique (movimiento_id, nro_cuota)
);

create index imputaciones_periodo_idx on public.imputaciones (periodo);

-- -----------------------------------------------------------------------------
-- Generación de cuotas
--
-- Cada vez que se crea o edita un movimiento se regeneran sus imputaciones.
-- Si el total no se divide exacto, la diferencia de centavos va a la última cuota.
-- Corre como security definer porque desde la app las imputaciones son de solo
-- lectura (ver políticas al final).
-- -----------------------------------------------------------------------------
create function public.generar_imputaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    valor_cuota numeric(14, 2);
    ultima      numeric(14, 2);
begin
    delete from public.imputaciones where movimiento_id = new.id;

    if new.monto_es_cuota then
        valor_cuota := new.monto;
        ultima      := new.monto;
    else
        valor_cuota := round(new.monto / new.cuotas, 2);
        ultima      := new.monto - valor_cuota * (new.cuotas - 1);
    end if;

    insert into public.imputaciones (movimiento_id, nro_cuota, periodo, monto)
    select new.id,
           n,
           (new.primer_periodo + make_interval(months => n - 1))::date,
           case when n = new.cuotas then ultima else valor_cuota end
    from generate_series(1, new.cuotas) as n;

    return new;
end;
$$;

create trigger movimientos_generar_imputaciones
    after insert or update of monto, cuotas, monto_es_cuota, primer_periodo
    on public.movimientos
    for each row execute function public.generar_imputaciones();

create function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
    new.actualizado_en := now();
    return new;
end;
$$;

create trigger movimientos_actualizado_en
    before update on public.movimientos
    for each row execute function public.tocar_actualizado_en();

-- -----------------------------------------------------------------------------
-- Vistas para los tableros (security_invoker: respetan las políticas RLS)
-- -----------------------------------------------------------------------------
create view public.v_imputaciones
with (security_invoker = true) as
select i.id,
       i.periodo,
       i.nro_cuota,
       m.cuotas,
       i.monto,
       g.tipo,
       g.id      as grupo_id,
       g.nombre  as grupo,
       s.id      as subgrupo_id,
       s.nombre  as subgrupo,
       m.id      as movimiento_id,
       m.fecha,
       m.concepto,
       m.quien,
       mp.nombre as medio_pago,
       mp.tipo   as medio_pago_tipo
from public.imputaciones i
join public.movimientos m       on m.id = i.movimiento_id
join public.subgrupos s         on s.id = m.subgrupo_id
join public.grupos g            on g.id = s.grupo_id
left join public.medios_pago mp on mp.id = m.medio_pago_id;

create view public.v_resumen_mensual
with (security_invoker = true) as
select periodo,
       coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as ingresos,
       coalesce(sum(monto) filter (where tipo = 'gasto'), 0)   as gastos,
       coalesce(sum(monto) filter (where tipo = 'ingreso'), 0)
     - coalesce(sum(monto) filter (where tipo = 'gasto'), 0)   as saldo
from public.v_imputaciones
group by periodo;

create view public.v_totales_por_subgrupo
with (security_invoker = true) as
select periodo, tipo, grupo_id, grupo, subgrupo_id, subgrupo, sum(monto) as total
from public.v_imputaciones
group by periodo, tipo, grupo_id, grupo, subgrupo_id, subgrupo;

-- Cuotas de tarjeta que caen del mes actual en adelante.
create view public.v_compromisos_tarjeta
with (security_invoker = true) as
select periodo, medio_pago, sum(monto) as total, count(*) as cuotas
from public.v_imputaciones
where medio_pago_tipo = 'tarjeta'
  and periodo >= date_trunc('month', current_date)::date
group by periodo, medio_pago;

-- -----------------------------------------------------------------------------
-- Seguridad a nivel de fila
-- -----------------------------------------------------------------------------
alter table public.miembros          enable row level security;
alter table public.grupos            enable row level security;
alter table public.subgrupos         enable row level security;
alter table public.medios_pago       enable row level security;
alter table public.sincronizaciones  enable row level security;
alter table public.movimientos       enable row level security;
alter table public.imputaciones      enable row level security;

-- Los miembros se cargan a mano desde el panel de Supabase; desde la app solo se leen.
create policy miembros_lectura on public.miembros
    for select to authenticated using (public.es_miembro());

create policy grupos_miembros on public.grupos
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy subgrupos_miembros on public.subgrupos
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy medios_pago_miembros on public.medios_pago
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy sincronizaciones_miembros on public.sincronizaciones
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy movimientos_miembros on public.movimientos
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());

-- Las imputaciones las escribe solo el trigger; desde la app son de lectura.
create policy imputaciones_lectura on public.imputaciones
    for select to authenticated using (public.es_miembro());
