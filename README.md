# Chana · Finanzas familiares

App web para registrar ingresos y gastos de la familia, con carga por formulario
o desde una planilla de Google Sheets, y tableros de control por grupo y subgrupo.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite, publicado en Cloudflare (Worker con archivos estáticos) |
| Sincronización con Google Sheets | Cloudflare Pages Function (la credencial de Google nunca llega al navegador) |
| Base de datos y login | Supabase (PostgreSQL + Auth + RLS), proyecto exclusivo para esta app |
| Gráficos | Recharts |
| Migración del historial | Python |

## Modelo de datos

```
grupos ──< subgrupos ──< movimientos ──< imputaciones
                              │
medios_pago ──────────────────┘
```

- **movimientos**: lo que se carga, tal cual. Una compra en cuotas es **un** movimiento.
- **imputaciones**: una fila por mes. Las genera automáticamente la base de datos
  (trigger `generar_imputaciones`) a partir de `monto`, `cuotas` y `primer_periodo`.
  **Los tableros leen de acá**, así cada cuota cae en su mes.
- El tipo lo define el **grupo**, no el movimiento: `ingreso`, `gasto` o `inversion`.
- **Inversiones** (FCI, plazos fijos) van aparte de ingresos y gastos. El signo indica
  hacia dónde va la plata: negativo = se invierte, positivo = vuelve (rescate o renta).
  El saldo del mes es `ingresos - gastos + inversiones`.
- Las tarjetas son un **medio de pago**, no un grupo: un gasto con TC va a su grupo
  real (Comida, Auto…) y se registra con qué tarjeta se pagó.
- Seguridad: solo los usuarios cargados en `miembros` (Meli y Carli) leen o escriben.

Vistas para los tableros: `v_imputaciones`, `v_resumen_mensual`,
`v_totales_por_subgrupo`, `v_compromisos_tarjeta`.

## Hoja "Movimientos" (Google Sheets)

Es la que lee el botón **Sincronizar**. Una fila por movimiento:

| Fecha | Tipo | Grupo | Subgrupo | Concepto | Monto | Cuotas | Mes 1ra cuota | Medio de pago | Quién |
|---|---|---|---|---|---|---|---|---|---|
| 10/01/2027 | Gasto | Comida | Super | La Anónima | 45000 | | | TC Meli | Meli |
| 12/01/2027 | Gasto | Hogar | Construcción | Corralón | 300000 | 6 | 02/2027 | TC Carli | Carli |

- **Tipo**: `Ingreso`, `Gasto` o `Inversión`.
- **Cuotas** vacío = un solo pago.
- **Mes 1ra cuota** vacío = el mes siguiente a la fecha si se pagó con tarjeta
  (cae en el próximo resumen); si no, el mes de la fecha.
- Al sincronizar, la app muestra una vista previa (nuevo / ya existe / con error)
  y recién guarda cuando se confirma.

## Estructura del repo

```
app/            app web (React + Vite) para Cloudflare Pages
supabase/
  migrations/   esquema de la base (tablas, cuotas, vistas, seguridad)
  seed.sql      grupos, subgrupos y medios de pago iniciales
scripts/
  migracion/    migrar_planilla.py: planilla histórica → hoja Movimientos
  pruebas/      prueba el esquema en un PostgreSQL local con los datos migrados
```

## Migrar la planilla histórica

```bash
pip install openpyxl
python3 scripts/migracion/migrar_planilla.py planilla.xlsx --desde 2025-10 --hasta 2026-11 --salida salida/
```

Genera `salida/movimientos_migrados.csv` y `salida/reporte_migracion.md`, con el
control de totales mes a mes y las diferencias encontradas en la planilla.
La carpeta `salida/` y las planillas están en `.gitignore`: **los datos no se suben al repo**.

## Probar el esquema

Requiere PostgreSQL instalado localmente (no hace falta Supabase):

```bash
scripts/pruebas/probar_esquema.sh salida/movimientos_migrados.csv
```

Levanta una base temporal, aplica la migración y el seed, carga el CSV y verifica
cuotas, totales y permisos.

## Puesta en marcha en Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ejecutar `supabase/migrations/*.sql` y después `supabase/seed.sql` en el SQL Editor.
3. Crear los usuarios de Meli y Carli en *Authentication → Users → Add user*
   (con contraseña y "Auto Confirm User" tildado).
4. Darles acceso, con los mails con los que se crearon:
   ```sql
   insert into public.miembros (user_id, nombre)
   select id, 'Carli' from auth.users where email = '<mail de Carli>'
   union all
   select id, 'Meli'  from auth.users where email = '<mail de Meli>';
   ```

## Próximos pasos

- [x] Esquema de base de datos, cuotas y seguridad
- [x] Migración de la planilla histórica
- [x] Crear la hoja "Movimientos" en Google Sheets con el historial migrado (Drive: carpeta "Chana · Finanzas familiares")
- [x] Esquema y datos iniciales cargados en Supabase
- [x] Frontend: login, resumen del mes, movimientos, formulario con cuotas
- [ ] Sincronizar desde Google Sheets (vista previa + confirmar)
- [ ] Tableros de control
- [ ] Publicar en Cloudflare Pages
