// Fechas: se trabaja siempre con texto 'AAAA-MM-DD' para no tener corrimientos
// por zona horaria al convertir a Date.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const formatoPesos = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export function pesos(valor) {
  return formatoPesos.format(Number(valor) || 0)
}

export function hoy() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** '2026-11-24' -> '2026-11-01' */
export function inicioDeMes(fecha) {
  return `${fecha.slice(0, 7)}-01`
}

/** Suma meses a un '2026-11-01' (o '2026-11'). Devuelve 'AAAA-MM-01'. */
export function sumarMeses(fecha, n) {
  const anio = Number(fecha.slice(0, 4))
  const mes = Number(fecha.slice(5, 7)) - 1 + n
  const a = anio + Math.floor(mes / 12)
  const m = ((mes % 12) + 12) % 12 + 1
  return `${a}-${String(m).padStart(2, '0')}-01`
}

/** '2026-11-24' -> '24/11/2026' */
export function fechaCorta(fecha) {
  const [a, m, d] = fecha.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** '2026-11-01' -> 'noviembre 2026' */
export function nombreMes(fecha) {
  return `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`
}

/**
 * Formatea el monto mientras se escribe, con puntos de miles y coma decimal:
 * '1234567,5' -> '1.234.567,5'. Los puntos que escribe la persona se ignoran
 * (son separadores de miles); la coma es la única marca decimal.
 */
export function formatearMontoEscrito(texto) {
  const limpio = String(texto).replace(/[^\d,]/g, '')
  const [entero, ...resto] = limpio.split(',')
  const conPuntos = entero.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (!limpio.includes(',')) return conPuntos
  return `${conPuntos || '0'},${resto.join('').slice(0, 2)}`
}

/** '1.234.567,50' -> 1234567.5 ; '' -> null */
export function montoEscritoANumero(texto) {
  const normal = String(texto).replace(/\./g, '').replace(',', '.')
  if (!normal) return null
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** 45230.5 -> '45.230,50' (para cargar un monto guardado en el formulario) */
export function numeroAMontoEscrito(numero) {
  return formatearMontoEscrito(Number(numero).toFixed(2).replace('.', ','))
}
