# Pendientes para guardar en Engram

Notas tomadas en sesiones remotas, sin acceso a Engram. Cuando la PC esté
conectada: guardarlas en Engram en el proyecto indicado y borrarlas de acá.

---

## [global] Deploy de una app Vite en Cloudflare (interfaz nueva, Workers)

- La pantalla "Create an app" de Cloudflare ya no crea un proyecto de Pages:
  crea un **Worker con archivos estáticos** y despliega con `npx wrangler deploy`.
  Para Pages hay que entrar por "Continue to Pages" (flujo legacy).
- El repo necesita un `wrangler.jsonc` junto al `package.json`:
  ```jsonc
  {
    "name": "<nombre>",
    "compatibility_date": "2025-09-01",
    "assets": { "directory": "./dist", "not_found_handling": "single-page-application" }
  }
  ```
  `single-page-application` reemplaza al `_redirects` de Pages para que el router
  de React funcione al recargar cualquier ruta.
- Si la app está en una subcarpeta del repo, se indica en *Advanced settings → Path*
  (ej. `/app`).
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
