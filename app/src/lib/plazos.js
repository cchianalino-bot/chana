// Cálculos de plazos fijos. Las fechas son texto 'AAAA-MM-DD', como en el resto de la app.

const DIA = 86400000

function aUTC(fecha) {
  const [a, m, d] = fecha.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

/** Días entre dos fechas: diasEntre('2026-12-01', '2026-12-31') -> 30 */
export function diasEntre(desde, hasta) {
  return Math.round((aUTC(hasta) - aUTC(desde)) / DIA)
}

/** sumarDias('2026-12-01', 30) -> '2026-12-31' */
export function sumarDias(fecha, dias) {
  return new Date(aUTC(fecha) + dias * DIA).toISOString().slice(0, 10)
}

/**
 * Interés de un plazo fijo: capital × TNA × días / 365, redondeado a centavos.
 * Es la misma cuenta que hace la base de datos (columna plazos_fijos.interes).
 */
export function calcularInteres(capital, tna, dias) {
  if (!(capital > 0) || !(tna >= 0) || !(dias > 0)) return 0
  return Math.round(capital * tna * dias / 365) / 100
}

/** '36,5' o '36.5' -> 36.5 ; texto vacío o inválido -> null */
export function leerTasa(texto) {
  const n = Number(String(texto).replace(',', '.').trim())
  return String(texto).trim() && Number.isFinite(n) ? n : null
}
