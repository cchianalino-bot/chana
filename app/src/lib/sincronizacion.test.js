import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarParecidos, interpretarPlanilla, leerFecha, leerMonto, serialAFecha } from './sincronizacion.js'

const catalogo = {
  grupos: [
    { id: 1, nombre: 'Ingresos', tipo: 'ingreso' },
    { id: 2, nombre: 'Inversiones', tipo: 'inversion' },
    { id: 3, nombre: 'Auto', tipo: 'gasto' },
    { id: 4, nombre: 'Comida', tipo: 'gasto' },
  ],
  subgrupos: [
    { id: 10, nombre: 'Sueldo Meli', grupo_id: 1 },
    { id: 20, nombre: 'Plazos fijos', grupo_id: 2 },
    { id: 30, nombre: 'Nafta', grupo_id: 3 },
    { id: 40, nombre: 'Verdulería', grupo_id: 4 },
  ],
  medios: [
    { id: 1, nombre: 'Efectivo', tipo: 'efectivo' },
    { id: 4, nombre: 'TC Meli', tipo: 'tarjeta' },
    { id: 6, nombre: 'Sin especificar', tipo: 'otro' },
  ],
  personas: [{ id: 1, nombre: 'Meli' }, { id: 2, nombre: 'Carli' }, { id: 3, nombre: 'Ambos' }],
}

// 46350 = 24/11/2026 en número de serie de Sheets
const NOV_24 = 46350

test('serialAFecha y leerFecha', () => {
  assert.equal(serialAFecha(NOV_24), '2026-11-24')
  assert.equal(leerFecha('24/11/2026'), '2026-11-24')
  assert.equal(leerFecha('2026-11-24'), '2026-11-24')
  assert.equal(leerFecha('02/2027'), '2027-02-01')
  assert.equal(leerFecha('31/02/2026'), null)
  assert.equal(leerFecha('cualquier cosa'), null)
})

test('leerMonto acepta número o texto con formato argentino', () => {
  assert.equal(leerMonto(1234.5), 1234.5)
  assert.equal(leerMonto('$ 1.234,50'), 1234.5)
  assert.equal(leerMonto('-2144000'), -2144000)
  assert.equal(leerMonto('abc'), null)
})

test('un gasto simple: sin medio ni quién toma los valores por defecto', async () => {
  const [r] = await interpretarPlanilla(
    [[NOV_24, 'Gasto', 'Comida', 'verduleria', 'La Huerta', 8500, '', '', '', '']], catalogo)
  assert.deepEqual(r.errores, [])
  assert.equal(r.nroFila, 2)
  assert.deepEqual(r.registro, {
    fecha: '2026-11-24', subgrupo_id: 40, concepto: 'La Huerta', monto: 8500, cuotas: 1,
    monto_es_cuota: false, primer_periodo: '2026-11-01', medio_pago_id: 6, quien: 'Ambos', origen: 'planilla',
  })
})

test('con tarjeta y sin mes de 1ra cuota, arranca el mes siguiente', async () => {
  const [r] = await interpretarPlanilla(
    [[NOV_24, 'gasto', 'Auto', 'Nafta', 'YPF', 60000, 3, '', 'tc meli', 'Meli']], catalogo)
  assert.equal(r.registro.primer_periodo, '2026-12-01')
  assert.equal(r.registro.cuotas, 3)
  assert.equal(r.registro.medio_pago_id, 4)
})

test('el mes de 1ra cuota escrito en la planilla manda', async () => {
  const [r] = await interpretarPlanilla(
    [[NOV_24, 'Gasto', 'Auto', 'Nafta', 'YPF', 60000, '', NOV_24, 'TC Meli', 'Meli']], catalogo)
  assert.equal(r.registro.primer_periodo, '2026-11-01')
})

test('inversión: acepta el tipo sin tilde y conserva el signo', async () => {
  const [r] = await interpretarPlanilla(
    [[NOV_24, 'Inversion', 'Inversiones', 'Plazos fijos', 'PF Galicia', -500000, '', '', '', '']], catalogo)
  assert.deepEqual(r.errores, [])
  assert.equal(r.registro.monto, -500000)
})

test('informa todos los errores de la fila', async () => {
  const [r] = await interpretarPlanilla(
    [['32/13/2026', 'Gasto', 'Ingresos', 'Sueldo Meli', '', 0, 99, '', 'Cheque', 'Juan']], catalogo)
  assert.equal(r.registro, null)
  assert.deepEqual(r.errores, [
    'Fecha inválida',
    'El grupo Ingresos no es de tipo Gasto',
    'Falta el concepto',
    'Monto inválido',
    'Cuotas debe ser un número entre 1 y 60',
    'Medio de pago "Cheque" no existe',
    'Quién "Juan" no existe',
  ])
})

test('quién se compara sin mayúsculas y se guarda como está en personas', async () => {
  const [r] = await interpretarPlanilla(
    [[NOV_24, 'Gasto', 'Auto', 'Nafta', 'YPF', 30000, '', '', '', 'MELI']], catalogo)
  assert.equal(r.registro.quien, 'Meli')
})

test('renombrar una persona no cambia la huella', async () => {
  const fila = (quien) => [NOV_24, 'Gasto', 'Auto', 'Nafta', 'YPF', 30000, '', '', '', quien]
  const [antes] = await interpretarPlanilla([fila('Meli')], catalogo)
  const renombrado = { ...catalogo, personas: [{ id: 1, nombre: 'Melisa' }, ...catalogo.personas.slice(1)] }
  const [despues] = await interpretarPlanilla([fila('Melisa')], renombrado)
  assert.equal(despues.registro.quien, 'Melisa')
  assert.equal(despues.huella, antes.huella)
})

test('dos filas idénticas son dos movimientos con huellas distintas y estables', async () => {
  const fila = [NOV_24, 'Gasto', 'Auto', 'Nafta', 'YPF', 30000, '', '', 'Efectivo', 'Carli']
  const primera = await interpretarPlanilla([fila, [], fila], catalogo)
  assert.equal(primera.length, 2, 'la fila vacía se ignora')
  assert.notEqual(primera[0].huella, primera[1].huella)
  assert.deepEqual(primera.map((r) => r.nroFila), [2, 4])

  // Leer de nuevo la misma planilla da las mismas huellas: no se duplica.
  const segunda = await interpretarPlanilla([fila, [], fila], catalogo)
  assert.deepEqual(segunda.map((r) => r.huella), primera.map((r) => r.huella))
})

test('buscarParecidos: misma fecha y monto, o misma fecha y concepto', async () => {
  const filas = await interpretarPlanilla([
    [NOV_24, 'Gasto', 'Auto', 'Nafta', 'YPF Ruta 9', 30000, '', '', '', ''],     // mismo monto que uno cargado
    [NOV_24, 'Gasto', 'Comida', 'Verdulería', 'la huerta', 9100, '', '', '', ''], // mismo concepto, monto corregido
    [NOV_24, 'Gasto', 'Comida', 'Verdulería', 'Otra cosa', 777, '', '', '', ''],  // nada parecido
    [46351, 'Gasto', 'Auto', 'Nafta', 'YPF', 30000, '', '', '', ''],              // otro día
  ], catalogo)
  const existentes = [
    { id: 1, fecha: '2026-11-24', concepto: 'YPF', monto: '30000.00', origen: 'formulario' },
    { id: 2, fecha: '2026-11-24', concepto: 'La Huerta', monto: '8500.00', origen: 'planilla' },
  ]
  const parecidos = buscarParecidos(filas, existentes)
  assert.deepEqual([...parecidos.keys()], [2, 3])
  assert.deepEqual(parecidos.get(2).map((m) => m.id), [1])
  assert.deepEqual(parecidos.get(3).map((m) => m.id), [2])
})
