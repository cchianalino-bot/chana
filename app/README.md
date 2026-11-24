# App web · Finanzas familiares

React + Vite. Se conecta a Supabase con la URL y la anon key del proyecto.

```bash
cp .env.example .env.local   # completar con los datos de Supabase
npm install
npm run dev                  # http://localhost:5173
npm test                     # pruebas del cálculo de cuotas
npm run build                # genera dist/
```

## Deploy en Cloudflare

Se despliega como Worker con archivos estáticos (`wrangler.jsonc`). En Cloudflare:
*Create an app → Continue with GitHub → repo chana*, con:

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Advanced settings → Path | `/app` |

Las variables de Supabase vienen de `.env.production` (son públicas), así que no
hace falta cargar variables en Cloudflare.

Ver el README de la raíz del repo para el modelo de datos.
