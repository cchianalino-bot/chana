-- =============================================================================
-- Datos iniciales: grupos, subgrupos y medios de pago.
-- Se pueden editar después desde la pantalla de Configuración.
-- =============================================================================

insert into public.grupos (nombre, tipo, orden) values
    ('Ingresos',                 'ingreso', 1),
    ('Hogar',                    'gasto',   2),
    ('Chicos y actividades',     'gasto',   3),
    ('Comida',                   'gasto',   4),
    ('Auto',                     'gasto',   5),
    ('Salidas',                  'gasto',   6),
    ('Salud y cuidado personal', 'gasto',   7),
    ('Impuestos',                'gasto',   8),
    ('Trabajo',                  'gasto',   9),
    ('Préstamos y ahorros',      'gasto',  10),
    ('Otros',                    'gasto',  11),
    ('Sin clasificar',           'gasto',  12);

insert into public.subgrupos (grupo_id, nombre)
select g.id, s.nombre
from (values
    ('Ingresos', 'Sueldo Meli'),
    ('Ingresos', 'Ingresos Carli'),
    ('Ingresos', 'Otros ingresos'),
    ('Ingresos', 'Inversiones'),

    ('Hogar', 'Sueldo empleada'),
    ('Hogar', 'Gas'),
    ('Hogar', 'Epec'),
    ('Hogar', 'Expensas'),
    ('Hogar', 'Huerto'),
    ('Hogar', 'Construcción'),
    ('Hogar', 'Limpieza'),
    ('Hogar', 'Leña'),
    ('Hogar', 'Mascotas'),

    ('Chicos y actividades', 'Danza'),
    ('Chicos y actividades', 'Gimnasia artística'),
    ('Chicos y actividades', 'Academia'),
    ('Chicos y actividades', 'Tenis'),
    ('Chicos y actividades', 'Inglés'),
    ('Chicos y actividades', 'Fútbol'),
    ('Chicos y actividades', 'Escuela'),
    ('Chicos y actividades', 'Librería'),
    ('Chicos y actividades', 'Juguetes'),
    ('Chicos y actividades', 'Cumpleaños'),
    ('Chicos y actividades', 'Viajes'),

    ('Comida', 'Carnicería'),
    ('Comida', 'Despensa'),
    ('Comida', 'Comida banco'),
    ('Comida', 'Fiambrería'),
    ('Comida', 'Sodero'),
    ('Comida', 'Verdulería'),
    ('Comida', 'Super'),
    ('Comida', 'Merienda'),
    ('Comida', 'Pastas'),
    ('Comida', 'Dietética'),
    ('Comida', 'Escabeche'),
    ('Comida', 'Panadería'),
    ('Comida', 'Congelados'),
    ('Comida', 'Carlini'),
    ('Comida', 'Pollo'),
    ('Comida', 'Empanadas'),
    ('Comida', 'General'),

    ('Auto', 'Nafta'),
    ('Auto', 'Estacionamiento'),
    ('Auto', 'Multas'),
    ('Auto', 'Service y arreglos'),
    ('Auto', 'Auto nuevo'),
    ('Auto', 'General'),

    ('Salidas', 'General'),
    ('Salidas', 'Regalos'),
    ('Salidas', 'Viajes'),

    ('Salud y cuidado personal', 'Farmacia'),
    ('Salud y cuidado personal', 'Médico'),
    ('Salud y cuidado personal', 'Dermatóloga'),
    ('Salud y cuidado personal', 'Depilación'),
    ('Salud y cuidado personal', 'Uñas'),

    ('Impuestos', 'Monotributo'),
    ('Impuestos', 'Rentas'),
    ('Impuestos', 'AFIP / ARCA'),
    ('Impuestos', 'Sudecor'),
    ('Impuestos', 'Impuestos tarjeta'),

    ('Trabajo', 'Gastos Demyn'),
    ('Trabajo', 'Diseñadoras'),

    ('Préstamos y ahorros', 'Préstamos'),
    ('Préstamos y ahorros', 'Préstamos a Gise'),
    ('Préstamos y ahorros', 'Plazos fijos'),

    ('Otros', 'Ropa'),
    ('Otros', 'Sorteos'),
    ('Otros', 'Gastos cheques'),
    ('Otros', 'Sin identificar'),
    ('Otros', 'General'),

    ('Sin clasificar', 'Consumos tarjeta (histórico)')
) as s (grupo, nombre)
join public.grupos g on g.nombre = s.grupo;

insert into public.medios_pago (nombre, tipo, titular) values
    ('Efectivo',       'efectivo',      'Ambos'),
    ('Transferencia',  'transferencia', 'Ambos'),
    ('Débito',         'debito',        'Ambos'),
    ('TC Meli',        'tarjeta',       'Meli'),
    ('TC Carli',       'tarjeta',       'Carli'),
    ('Sin especificar','otro',          null);
