import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearMontoEscrito, montoEscritoANumero, numeroAMontoEscrito } from './formato.js'

test('formatea mientras se escribe', () => {
  assert.equal(formatearMontoEscrito('1234567'), '1.234.567')
  assert.equal(formatearMontoEscrito('1.234.567,5'), '1.234.567,5')
  assert.equal(formatearMontoEscrito('1234,567'), '1.234,56', 'máximo dos decimales')
  assert.equal(formatearMontoEscrito('1234,'), '1.234,', 'deja escribir la coma')
  assert.equal(formatearMontoEscrito(',5'), '0,5')
  assert.equal(formatearMontoEscrito('$ 00120abc'), '120')
  assert.equal(formatearMontoEscrito('12,3,4'), '12,34', 'una sola coma')
  assert.equal(formatearMontoEscrito(''), '')
  assert.equal(formatearMontoEscrito('000', { limpiarCeros: false }), '000', 'al editar respeta los ceros')
  assert.equal(formatearMontoEscrito('5000', { limpiarCeros: false }), '5.000')
})

test('convierte el texto a número y vuelta', () => {
  assert.equal(montoEscritoANumero('1.234.567,50'), 1234567.5)
  assert.equal(montoEscritoANumero('1.234,'), 1234)
  assert.equal(montoEscritoANumero(''), null)
  assert.equal(numeroAMontoEscrito(45230.5), '45.230,50')
  assert.equal(numeroAMontoEscrito(300000), '300.000')
  assert.equal(numeroAMontoEscrito(4000.1), '4.000,10')
})
