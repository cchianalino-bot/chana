# App web · Finanzas familiares

React + Vite. Se conecta a Supabase con la URL y la anon key del proyecto.

```bash
cp .env.example .env.local   # completar con los datos de Supabase
npm install
npm run dev                  # http://localhost:5173
npm test                     # pruebas del cálculo de cuotas
npm run build                # genera dist/ para Cloudflare Pages
```

Ver el README de la raíz del repo para el modelo de datos.
