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

Se despliega como Worker con archivos estáticos. La configuración está en
`wrangler.jsonc`, **en la raíz del repo**, y compila la app sola antes de
publicar. En Cloudflare (*Settings → Builds*) alcanza con:

| Campo | Valor |
|---|---|
| Root directory | `/` (la raíz; **no** `/app`) |
| Build command | vacío (o `true`) |
| Deploy command | `npx wrangler deploy` |

Las variables de Supabase vienen de `.env.production` y de `vars` en
`wrangler.jsonc` (son públicas). La clave de Google va como secret
`GOOGLE_SERVICE_ACCOUNT` en *Settings → Variables and Secrets*.
