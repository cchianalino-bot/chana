// Acceso de solo lectura a Google Sheets con una cuenta de servicio.
// La clave privada vive solo acá, en el Worker (secret de Cloudflare); nunca
// llega al navegador.

const ALCANCE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const URL_TOKEN = 'https://oauth2.googleapis.com/token'

let tokenEnCache = null // { valor, vence } — se reusa mientras dure el isolate

function base64url(datos) {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : new Uint8Array(datos)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importarClave(pem) {
  const cuerpo = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(cuerpo), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** JWT firmado que Google cambia por un token de acceso (flujo de cuenta de servicio). */
export async function crearJwt(cuenta, ahora = Math.floor(Date.now() / 1000)) {
  const encabezado = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const reclamos = base64url(JSON.stringify({
    iss: cuenta.client_email, scope: ALCANCE, aud: URL_TOKEN, iat: ahora, exp: ahora + 3600,
  }))
  const clave = await importarClave(cuenta.private_key)
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(`${encabezado}.${reclamos}`))
  return `${encabezado}.${reclamos}.${base64url(firma)}`
}

async function obtenerToken(cuenta) {
  const ahora = Math.floor(Date.now() / 1000)
  if (tokenEnCache && tokenEnCache.vence > ahora + 60) return tokenEnCache.valor

  const respuesta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await crearJwt(cuenta, ahora),
    }),
  })
  if (!respuesta.ok) throw new Error(`Google rechazó la cuenta de servicio (${respuesta.status})`)
  const { access_token, expires_in } = await respuesta.json()
  tokenEnCache = { valor: access_token, vence: ahora + expires_in }
  return access_token
}

/**
 * Lee un rango de la planilla sin formato: fechas como número de serie y
 * montos como número, para no depender de la configuración regional.
 */
export async function leerRango(cuenta, idPlanilla, rango) {
  const token = await obtenerToken(cuenta)
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${idPlanilla}/values/${encodeURIComponent(rango)}`)
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  url.searchParams.set('dateTimeRenderOption', 'SERIAL_NUMBER')

  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (respuesta.status === 403 || respuesta.status === 404) {
    throw new Error('La cuenta de servicio no tiene acceso a la planilla: compartila con su mail como Lector.')
  }
  if (!respuesta.ok) throw new Error(`No se pudo leer la planilla (${respuesta.status})`)
  const { values } = await respuesta.json()
  return values ?? []
}

/** Solo para las pruebas. */
export function _limpiarCache() {
  tokenEnCache = null
}
