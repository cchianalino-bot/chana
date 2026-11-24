import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import worker from './index.js'
import { _limpiarCache } from './google.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const env = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  ID_PLANILLA: 'id-planilla',
  GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'robot@proyecto.iam.gserviceaccount.com', private_key: privateKey }),
  ASSETS: { fetch: async () => new Response('<html>app</html>') },
}

const fetchOriginal = globalThis.fetch
let llamadas

/** Simula Supabase y Google. `opciones` cambia lo que responden. */
function simular({ miembro = true, accesoPlanilla = true } = {}) {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    llamadas.push(u)
    if (u.startsWith(env.SUPABASE_URL)) {
      const token = init.headers.Authorization
      if (token !== 'Bearer token-valido') return Response.json({ message: 'JWT inválido' }, { status: 401 })
      return Response.json(miembro ? [{ nombre: 'Carli' }] : [])
    }
    if (u === 'https://oauth2.googleapis.com/token') {
      const jwt = new URLSearchParams(init.body).get('assertion')
      const [encabezado, reclamos, firma] = jwt.split('.')
      const verificador = createVerify('RSA-SHA256')
      verificador.update(`${encabezado}.${reclamos}`)
      assert.ok(verificador.verify(publicKey, Buffer.from(firma, 'base64url')), 'firma del JWT válida')
      const datos = JSON.parse(Buffer.from(reclamos, 'base64url'))
      assert.equal(datos.iss, 'robot@proyecto.iam.gserviceaccount.com')
      assert.equal(datos.scope, 'https://www.googleapis.com/auth/spreadsheets.readonly')
      return Response.json({ access_token: 'token-google', expires_in: 3600 })
    }
    if (u.startsWith('https://sheets.googleapis.com/')) {
      assert.equal(init.headers.Authorization, 'Bearer token-google')
      assert.match(u, /\/spreadsheets\/id-planilla\/values\/Movimientos!A2%3AJ\?/)
      assert.match(u, /valueRenderOption=UNFORMATTED_VALUE/)
      if (!accesoPlanilla) return Response.json({}, { status: 403 })
      return Response.json({ values: [[46350, 'Gasto', 'Auto', 'Nafta', 'YPF', 30000]] })
    }
    throw new Error(`fetch inesperado: ${u}`)
  }
}

const pedir = (ruta, token) =>
  worker.fetch(new Request(`https://chana.workers.dev${ruta}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}), env)

beforeEach(() => { llamadas = []; _limpiarCache() })
afterEach(() => { globalThis.fetch = fetchOriginal })

test('sin token: 401 y no se consulta a Google', async () => {
  simular()
  const r = await pedir('/api/planilla')
  assert.equal(r.status, 401)
  assert.ok(!llamadas.some((u) => u.includes('google')))
})

test('token inválido: 401', async () => {
  simular()
  assert.equal((await pedir('/api/planilla', 'otro')).status, 401)
})

test('usuario que no es miembro: 401', async () => {
  simular({ miembro: false })
  assert.equal((await pedir('/api/planilla', 'token-valido')).status, 401)
})

test('miembro: devuelve las filas y reusa el token de Google', async () => {
  simular()
  const r = await pedir('/api/planilla', 'token-valido')
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { filas: [[46350, 'Gasto', 'Auto', 'Nafta', 'YPF', 30000]] })

  await pedir('/api/planilla', 'token-valido')
  assert.equal(llamadas.filter((u) => u.includes('oauth2')).length, 1, 'un solo pedido de token')
})

test('planilla no compartida con la cuenta de servicio: mensaje claro', async () => {
  simular({ accesoPlanilla: false })
  const r = await pedir('/api/planilla', 'token-valido')
  assert.equal(r.status, 502)
  assert.match((await r.json()).error, /compartila con su mail/)
})

test('falta el secret: avisa qué configurar', async () => {
  simular()
  const r = await worker.fetch(
    new Request('https://chana.workers.dev/api/planilla', { headers: { Authorization: 'Bearer token-valido' } }),
    { ...env, GOOGLE_SERVICE_ACCOUNT: undefined })
  assert.equal(r.status, 500)
  assert.match((await r.json()).error, /GOOGLE_SERVICE_ACCOUNT/)
})

test('otras rutas sirven la app', async () => {
  simular()
  assert.equal(await (await pedir('/movimientos')).text(), '<html>app</html>')
  assert.equal((await pedir('/api/otra')).status, 404)
})
