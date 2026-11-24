-- =============================================================================
-- "Quién" pasa de una lista fija (Meli, Carli, Ambos) a la tabla personas,
-- editable desde la pantalla Configuración.
--
-- movimientos.quien, miembros.nombre y medios_pago.titular siguen guardando
-- el nombre, ahora como referencia a personas: si se renombra una persona,
-- el cambio se propaga solo (on update cascade).
-- =============================================================================

create table public.personas (
    id      bigint generated always as identity primary key,
    nombre  text not null unique check (length(trim(nombre)) > 0),
    activo  boolean not null default true
);

insert into public.personas (nombre) values ('Meli'), ('Carli'), ('Ambos');

alter table public.movimientos drop constraint movimientos_quien_check;
alter table public.movimientos
    add constraint movimientos_quien_fkey foreign key (quien)
    references public.personas (nombre) on update cascade on delete restrict;

alter table public.miembros drop constraint miembros_nombre_check;
alter table public.miembros
    add constraint miembros_nombre_fkey foreign key (nombre)
    references public.personas (nombre) on update cascade on delete restrict;

alter table public.medios_pago drop constraint medios_pago_titular_check;
alter table public.medios_pago
    add constraint medios_pago_titular_fkey foreign key (titular)
    references public.personas (nombre) on update cascade on delete set null;

alter table public.personas enable row level security;

create policy personas_miembros on public.personas
    for all to authenticated using (public.es_miembro()) with check (public.es_miembro());
