// Worker de Cloudflare: sirve la app (archivos estáticos de dist/) y la API.
//
//   GET /api/planilla   filas de la hoja "Movimientos", solo para miembros
//
// Variables (wrangler.jsonc): SUPABASE_URL, SUPABASE_ANON_KEY, ID_PLANILLA
// Secret (Cloudflare):        GOOGLE_SERVICE_ACCOUNT  (el JSON de la clave)

import { leerRango } from './google.js'

const RANGO_MOVIMIENTOS = 'Movimientos!A2:J'

function json(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/**
 * Verifica el token de Supabase del usuario consultando la tabla miembros con
 * ese mismo token: por las políticas RLS, solo un miembro recibe su fila.
 */
async function esMiembro(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return false
  const respuesta = await fetch(`${env.SUPABASE_URL}/rest/v1/miembros?select=nombre`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!respuesta.ok) return false
  const filas = await respuesta.json()
  return filas.length > 0
}

async function leerPlanilla(request, env) {
  if (!(await esMiembro(request, env))) return json({ error: 'No autorizado' }, 401)
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    return json({ error: 'Falta configurar el secret GOOGLE_SERVICE_ACCOUNT en Cloudflare.' }, 500)
  }
  try {
    const cuenta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT)
    const filas = await leerRango(cuenta, env.ID_PLANILLA, RANGO_MOVIMIENTOS)
    return json({ filas })
  } catch (error) {
    return json({ error: error.message }, 502)
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/planilla' && request.method === 'GET') return leerPlanilla(request, env)
    if (pathname.startsWith('/api/')) return json({ error: 'No existe' }, 404)
    return env.ASSETS.fetch(request)
  },
}
