import { inicioDeMes, sumarMeses } from './formato.js'

/**
 * Mes de la primera cuota que se sugiere en el formulario: con tarjeta, el
 * consumo cae en el resumen del mes siguiente; si no, en el mes de la fecha.
 */
export function primerPeriodoSugerido(fecha, esTarjeta) {
  const mes = inicioDeMes(fecha)
  return esTarjeta ? sumarMeses(mes, 1) : mes
}

/**
 * Reparte un movimiento en cuotas mensuales. Es el mismo cálculo que hace la
 * base de datos (función generar_imputaciones), para mostrar la vista previa
 * antes de guardar: si el total no se divide exacto, los centavos que sobran
 * van a la última cuota.
 *
 * Se calcula en centavos para no arrastrar errores de punto flotante.
 */
export function calcularCuotas({ monto, cuotas = 1, montoEsCuota = false, primerPeriodo }) {
  const n = Math.max(1, Math.trunc(Number(cuotas) || 1))
  const centavos = Math.round(Number(monto) * 100)
  if (!centavos || !primerPeriodo) return []

  let valor, ultima
  if (montoEsCuota) {
    valor = centavos
    ultima = centavos
  } else {
    valor = Math.round(centavos / n)
    ultima = centavos - valor * (n - 1)
  }

  return Array.from({ length: n }, (_, i) => ({
    nro: i + 1,
    periodo: sumarMeses(primerPeriodo, i),
    monto: (i === n - 1 ? ultima : valor) / 100,
  }))
}
