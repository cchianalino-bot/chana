import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularInteres, diasEntre, leerTasa, sumarDias } from './plazos.js'

test('días entre fechas y sumar días, cruzando de mes y de año', () => {
  assert.equal(diasEntre('2026-12-01', '2026-12-31'), 30)
  assert.equal(diasEntre('2026-12-15', '2027-01-14'), 30)
  assert.equal(sumarDias('2026-12-15', 30), '2027-01-14')
  assert.equal(sumarDias('2028-02-15', 30), '2028-03-16', 'año bisiesto')
})

test('interés = capital × TNA × días / 365, igual que en la base', () => {
  assert.equal(calcularInteres(1000000, 36.5, 30), 30000)
  assert.equal(calcularInteres(1030000, 40, 30), 33863.01) // round(1030000*0.40*30/365, 2)
  assert.equal(calcularInteres(500000, 0, 30), 0)
  assert.equal(calcularInteres(0, 30, 30), 0)
})

test('la tasa acepta coma o punto', () => {
  assert.equal(leerTasa('36,5'), 36.5)
  assert.equal(leerTasa('29.75'), 29.75)
  assert.equal(leerTasa(''), null)
  assert.equal(leerTasa('abc'), null)
})
