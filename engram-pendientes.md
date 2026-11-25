# Pendientes para guardar en Engram

Notas tomadas en sesiones remotas, sin acceso a Engram. Cuando la PC esté
conectada: guardarlas en Engram en el proyecto indicado y borrarlas de acá.

---

## [global] Deploy de una app Vite en Cloudflare (interfaz nueva, Workers)

- La pantalla "Create an app" de Cloudflare ya no crea un proyecto de Pages:
  crea un **Worker con archivos estáticos** y despliega con `npx wrangler deploy`.
  Para Pages hay que entrar por "Continue to Pages" (flujo legacy).
- El repo necesita un `wrangler.jsonc`. Lo más robusto es ponerlo **en la raíz del
  repo** y que compile solo (ver la nota "Cloudflare deja de construir…"):
  ```jsonc
  {
    "name": "<nombre>",
    "main": "app/worker/index.js",            // si hay API; si no, omitir
    "compatibility_date": "2025-09-01",
    "build": { "command": "npm ci && npm run build", "cwd": "app" },
    "assets": {
      "directory": "./app/dist",
      "binding": "ASSETS",
      "not_found_handling": "single-page-application",
      "run_worker_first": ["/api/*"]
    }
  }
  ```
  `single-page-application` reemplaza al `_redirects` de Pages para que el router
  de React funcione al recargar cualquier ruta. En el panel: Root directory `/`,
  Build command vacío, Deploy command `npx wrangler deploy`.
- **Variables `VITE_*`:** Vite las incrusta en el momento del **build**. Las
  "Variables" que pide Cloudflare al crear el Worker son de **runtime** y Vite no
  las ve. Opciones:
  1. Para valores públicos (URL y anon/publishable key de Supabase): commitear
     `.env.production` en el repo. Es lo que usamos en Chana.
  2. Para el resto: cargarlas en *Settings → Build → Variables and secrets*
     (variables de build), no en las del Worker.
- Nunca poner en `.env.production` claves secretas (`service_role`,
  `sb_secret_...`, credenciales de Google): esas van como **secrets** del Worker
  y solo las usa código del lado del servidor.

Origen: app de finanzas familiares (repo `chana`), noviembre 2026.

---

## [global] Cloudflare deja de construir los commits nuevos

- Síntoma: los push llegan a GitHub pero en *Deployments* no aparece ningún
  build nuevo. En *Settings → Builds* se ve el aviso "This project is
  disconnected from your Git account".
- Pasó después de cargar un secret y tocar "Deploy" desde el panel.
- Solución: *Settings → Builds → Disconnect → Connect* (mismo repo y rama) y
  revisar en GitHub (*Settings → Applications → Cloudflare Workers and Pages →
  Repository access*) que el repo esté incluido. Reconectar no dispara un
  build: hace falta un push nuevo (o un deploy manual).
- **Al reconectar, Cloudflare puede vaciar el Build command y volver el Root
  directory a `/`.** Si no hay `wrangler.jsonc` en ese directorio, Wrangler
  "autoconfigura" un sitio estático y sube el código fuente sin compilar
  (pantalla en blanco). Prevención: `wrangler.jsonc` en la raíz del repo con
  `"build": { "command": "npm ci && npm run build", "cwd": "<carpeta app>" }`,
  así compila solo y no depende de lo que diga el panel.
- Revisar también el **API token** de *Settings → Builds*: cada proyecto con su
  propio token, no reusar el de otro proyecto o cliente.

Origen: app de finanzas familiares (repo `chana`), noviembre 2026.

---

## [global] Leer Google Sheets desde un Worker de Cloudflare (sin hacer pública la planilla)

- Cuenta de servicio de Google Cloud (proyecto propio, API de Google Sheets
  activada, **sin roles**), con clave JSON. Se comparte **solo esa planilla**
  con el mail de la cuenta, como **Lector**.
- Google advierte "no descargues claves, usá Federación de identidades": no
  aplica a Cloudflare Workers (no tiene esa integración). La clave JSON es el
  camino estándar, acotada a solo lectura de una planilla.
- La clave va como **secret** del Worker (*Settings → Variables and Secrets →
  Runtime*, tipo **Secret**). No en "Build → Variables": esas el Worker no las ve.
  Las variables tipo *Text* cargadas a mano se borran en cada `wrangler deploy`
  si no están en `vars` del `wrangler.jsonc`; los *Secret* se mantienen.
- El Worker firma un JWT RS256 con WebCrypto (`crypto.subtle`, clave PKCS#8 del
  JSON), lo cambia por un token en `oauth2.googleapis.com/token` (alcance
  `spreadsheets.readonly`) y lee con `valueRenderOption=UNFORMATTED_VALUE` y
  `dateTimeRenderOption=SERIAL_NUMBER` (fechas como número de serie, montos
  como número: no depende de la configuración regional).
- Antes de leer, el Worker valida al usuario llamando a Supabase con su token
  (consulta a una tabla protegida por RLS).

Origen: app de finanzas familiares (repo `chana`), noviembre 2026.

---

## [global] Supabase: datos útiles

- La "anon key" ahora se llama **publishable key** (`sb_publishable_...`); la
  vieja `anon` (`eyJ...`) está en *Project Settings → API Keys → Legacy API keys*.
  Ambas son públicas: lo que protege los datos es **RLS**. Nunca exponer
  `service_role` / `sb_secret_...`.
- La pantalla *Connect → Framework* muestra el `.env` listo con URL y clave.
- Proyectos en organización **PRO**: no se pausan por inactividad.
- Patrón de acceso para una app de pocos usuarios: tabla `miembros(user_id)` +
  función `es_miembro()` *security definer* + políticas `using (es_miembro())`.
  Vistas con `security_invoker = true` para que respeten RLS.
- PostgREST devuelve como máximo 1000 filas por consulta: paginar con `.range()`.

Origen: app de finanzas familiares (repo `chana`), noviembre 2026.

---

## [chana] App de finanzas familiares (Carli y Meli)

**Qué es:** app web para registrar gastos, ingresos e inversiones de la familia,
con carga por formulario o desde una planilla de Google Sheets, y tableros.

**Dónde está**
- App: https://chana.cchianalino.workers.dev (Cloudflare Worker `chana`, cuenta
  de Carli). Instalable en el celular (iPhone: Safari → Compartir → Añadir a
  pantalla de inicio).
- Código: repo `cchianalino-bot/chana`, rama `claude/finanzas-familiares`
  (es la rama de producción en Cloudflare). App en `app/`, Worker en
  `app/worker/`, base en `supabase/`, migración del historial en
  `scripts/migracion/`.
- Base: Supabase, proyecto "cchianalino@gmail.com's Project"
  (`crstqzizytudjlpuzryt`), org PRO. Usuarios: Carli y Meli (tabla `miembros`).
- Planilla: Drive → carpeta "Chana · Finanzas familiares" → "Chana · Movimientos"
  (pestañas Movimientos y Catálogo). La lee la cuenta de servicio
  `lector-planilla` del proyecto de Google Cloud `chana-finanzas` (secret
  `GOOGLE_SERVICE_ACCOUNT` en Cloudflare).
- Entorno de Claude Code en la nube: "chana" (permite el host de Supabase y el
  de la app).

**Decisiones**
- Se descartó alojarla en el hosting del estudio (Demyn) y en un subdominio de
  un cliente (Puja): son finanzas personales, van separadas de lo laboral.
- Stack: React + Vite, Cloudflare Workers (estáticos + API), Supabase. Script
  de migración en Python.
- Grupos (revisados con Meli): Ingresos (Sueldo Meli, Ingresos Carli, Otros
  ingresos), Inversiones (tipo propio, con signo: negativo = se invierte;
  incluye Plazos fijos), Hogar (incluye Sudecor), Chicos y actividades (incluye
  Huerto), Comida, Auto, Salidas, Salud y cuidado personal, Impuestos, Trabajo,
  Préstamos (préstamos vigentes), Otros, Sin clasificar.
- Las tarjetas son **medio de pago**, no grupo. Las cuotas se cargan una vez y
  la base las reparte por mes (tabla `imputaciones`, trigger). Con tarjeta, la
  primera cuota va al mes siguiente salvo que se indique otro.
- Lo de Gise (descuentos del sueldo de la empleada) **no** va en la app.
- "Quién" es una tabla editable (`personas`).
- Saldo del mes = ingresos − gastos + inversiones (neto).

**Sincronizar con la planilla (control de duplicados)**
- Huella por fila: sha256 de fecha|tipo|grupo_id|subgrupo_id|concepto
  normalizado|monto|cuotas|primer_periodo|medio_id|persona_id + n° de
  repetición. Única en la base. Usa ids: renombrar en Ajustes no la cambia.
- Filas nuevas parecidas a algo ya cargado (misma fecha y monto, o mismo
  concepto) → "posible duplicado", no se importan salvo que se marquen.
- Regla: en la planilla solo se agregan filas; lo ya importado se corrige o
  borra en la app.

**Historial migrado** (oct 2025 – nov 2026, 1.272 movimientos). Errores de la
planilla original que no se copiaron: Comida en positivo en abr, may y jul 2026
(la planilla la sumaba como ingreso) y Tarjetas faltante en jun 2026. Los
consumos con tarjeta históricos quedaron en "Sin clasificar" con el comercio
como concepto, para reclasificar desde la app.

**Pendientes / ideas descartadas por ahora**
- Carga por voz y por foto de ticket: **en pausa**. Sin IA detrás (solo reglas)
  es frágil: un error en grupo o subgrupo y la carga sale mal. Si se retoma,
  hacerlo con IA (API de Claude desde el Worker: texto libre y lectura de
  tickets), siempre precargando el formulario para confirmar.
- Tableros más completos (evolución mensual, comparativas): a definir con Meli.
- Pasar la rama a `main` cuando el proyecto se estabilice (y cambiar la rama de
  producción en Cloudflare).

Origen: sesiones de noviembre 2026.
