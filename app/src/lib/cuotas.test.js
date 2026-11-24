import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCuotas, primerPeriodoSugerido } from './cuotas.js'
import { sumarMeses } from './formato.js'

test('100.000 en 3 cuotas: los centavos sobrantes van a la última', () => {
  const cuotas = calcularCuotas({ monto: 100000, cuotas: 3, primerPeriodo: '2027-02-01' })
  assert.deepEqual(cuotas.map((c) => c.monto), [33333.33, 33333.33, 33333.34])
  assert.deepEqual(cuotas.map((c) => c.periodo), ['2027-02-01', '2027-03-01', '2027-04-01'])
})

test('monto por cuota: cada cuota vale el monto', () => {
  const cuotas = calcularCuotas({ monto: 5000, cuotas: 6, montoEsCuota: true, primerPeriodo: '2026-11-01' })
  assert.equal(cuotas.length, 6)
  assert.ok(cuotas.every((c) => c.monto === 5000))
  assert.equal(cuotas.at(-1).periodo, '2027-04-01')
})

test('sin cuotas es un solo pago', () => {
  assert.deepEqual(calcularCuotas({ monto: 1234.5, primerPeriodo: '2026-11-01' }),
    [{ nro: 1, periodo: '2026-11-01', monto: 1234.5 }])
})

test('sin monto no hay cuotas', () => {
  assert.deepEqual(calcularCuotas({ monto: '', cuotas: 3, primerPeriodo: '2026-11-01' }), [])
})

test('con tarjeta la primera cuota cae el mes siguiente', () => {
  assert.equal(primerPeriodoSugerido('2026-12-15', true), '2027-01-01')
  assert.equal(primerPeriodoSugerido('2026-12-15', false), '2026-12-01')
})

test('sumarMeses cruza de año en los dos sentidos', () => {
  assert.equal(sumarMeses('2026-11-01', 14), '2028-01-01')
  assert.equal(sumarMeses('2026-01-01', -1), '2025-12-01')
})
