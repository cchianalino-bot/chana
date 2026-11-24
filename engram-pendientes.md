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
