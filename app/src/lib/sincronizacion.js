import { inicioDeMes } from './formato.js'
import { primerPeriodoSugerido } from './cuotas.js'

/**
 * Interpreta las filas de la hoja "Movimientos" de Google Sheets y las
 * convierte en registros para la tabla movimientos.
 *
 * Las filas llegan como las devuelve la API de Sheets con
 * valueRenderOption=UNFORMATTED_VALUE: las fechas como número de serie,
 * los montos como número y el resto como texto.
 *
 * Columnas: Fecha | Tipo | Grupo | Subgrupo | Concepto | Monto | Cuotas |
 *           Mes 1ra cuota | Medio de pago | Quién
 */

const TIPOS = { ingreso: 'ingreso', gasto: 'gasto', inversion: 'inversion' }
const QUIEN_POR_DEFECTO = 'Ambos'

/** Para comparar nombres sin que importen mayúsculas, tildes ni espacios. */
export function clave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Número de serie de Sheets (días desde 30/12/1899) -> 'AAAA-MM-DD'. */
export function serialAFecha(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Acepta un número de serie o un texto: '24/11/2026', '2026-11-24'
 * (y para meses, '11/2026' o '2026-11'). Devuelve 'AAAA-MM-DD' o null.
 */
export function leerFecha(valor) {
  if (typeof valor === 'number') return serialAFecha(valor)
  const texto = String(valor ?? '').trim()
  let m
  if ((m = texto.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return armarFecha(m[1], m[2], m[3] ?? 1)
  if ((m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return armarFecha(m[3], m[2], m[1])
  if ((m = texto.match(/^(\d{1,2})\/(\d{4})$/))) return armarFecha(m[2], m[1], 1)
  return null
}

function armarFecha(anio, mes, dia) {
  const a = Number(anio), m = Number(mes), d = Number(dia)
  const fecha = new Date(Date.UTC(a, m - 1, d))
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return null
  return fecha.toISOString().slice(0, 10)
}

/** Monto como número; acepta texto con formato argentino ('1.234,50'). */
export function leerMonto(valor) {
  if (typeof valor === 'number') return valor
  const texto = String(valor ?? '').replace(/[$\s]/g, '')
  if (!texto) return null
  const normal = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

async function sha256(texto) {
  const datos = new TextEncoder().encode(texto)
  const hash = await crypto.subtle.digest('SHA-256', datos)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Prepara los índices de búsqueda a partir del catálogo de la base
 * (grupos con su tipo, subgrupos, medios de pago y personas).
 */
export function indexarCatalogo({ grupos, subgrupos, medios, personas }) {
  const grupoPorNombre = new Map(grupos.map((g) => [clave(g.nombre), g]))
  const subgrupoPorGrupo = new Map(subgrupos.map((s) => [`${s.grupo_id}|${clave(s.nombre)}`, s]))
  const medioPorNombre = new Map(medios.map((m) => [clave(m.nombre), m]))
  const personaPorNombre = new Map(personas.map((p) => [clave(p.nombre), p]))
  return { grupoPorNombre, subgrupoPorGrupo, medioPorNombre, personaPorNombre }
}

/**
 * Interpreta una fila. Devuelve { registro, errores, clave }; `clave` es el
 * texto que identifica la fila para detectar duplicados.
 */
export function interpretarFila(fila, indices) {
  const [fecha, tipo, grupo, subgrupo, concepto, monto, cuotas, mesCuota, medio, quien] = fila
  const errores = []

  const fechaIso = leerFecha(fecha)
  if (!fechaIso) errores.push('Fecha inválida')

  const tipoNormal = TIPOS[clave(tipo)]
  if (!tipoNormal) errores.push(`Tipo "${tipo ?? ''}" no válido (Ingreso, Gasto o Inversión)`)

  const g = indices.grupoPorNombre.get(clave(grupo))
  if (!g) errores.push(`Grupo "${grupo ?? ''}" no existe`)
  else if (tipoNormal && g.tipo !== tipoNormal) errores.push(`El grupo ${g.nombre} no es de tipo ${tipo}`)

  const s = g && indices.subgrupoPorGrupo.get(`${g.id}|${clave(subgrupo)}`)
  if (g && !s) errores.push(`Subgrupo "${subgrupo ?? ''}" no existe en ${g.nombre}`)

  const textoConcepto = String(concepto ?? '').trim()
  if (!textoConcepto) errores.push('Falta el concepto')

  const valor = leerMonto(monto)
  if (valor === null || valor === 0) errores.push('Monto inválido')

  const cantCuotas = cuotas === '' || cuotas == null ? 1 : Number(cuotas)
  if (!Number.isInteger(cantCuotas) || cantCuotas < 1 || cantCuotas > 60) errores.push('Cuotas debe ser un número entre 1 y 60')

  const m = clave(medio) ? indices.medioPorNombre.get(clave(medio)) : indices.medioPorNombre.get('sin especificar')
  if (!m) errores.push(`Medio de pago "${medio}" no existe`)

  const persona = indices.personaPorNombre.get(clave(quien) || clave(QUIEN_POR_DEFECTO))
  if (!persona) errores.push(clave(quien) ? `Quién "${quien}" no existe` : 'Falta quién')

  let primerPeriodo = null
  if (mesCuota !== '' && mesCuota != null) {
    const f = leerFecha(mesCuota)
    if (f) primerPeriodo = inicioDeMes(f)
    else errores.push('Mes 1ra cuota inválido')
  } else if (fechaIso) {
    primerPeriodo = primerPeriodoSugerido(fechaIso, m?.tipo === 'tarjeta')
  }

  if (errores.length) return { registro: null, errores, clave: null }

  const registro = {
    fecha: fechaIso,
    subgrupo_id: s.id,
    concepto: textoConcepto,
    monto: valor,
    cuotas: cantCuotas,
    monto_es_cuota: false,
    primer_periodo: primerPeriodo,
    medio_pago_id: m.id,
    quien: persona.nombre,
    origen: 'planilla',
  }
  // Con los códigos (id) y no los nombres de grupo, subgrupo, medio y persona: así
  // renombrarlos en Ajustes no cambia la huella. La misma cuenta está replicada en
  // supabase/migrations/20261126000001_huellas_por_persona.sql.
  const claveFila = [fechaIso, tipoNormal, g.id, s.id, clave(textoConcepto), valor.toFixed(2),
    cantCuotas, primerPeriodo, m.id, persona.id].join('|')
  return { registro, errores, clave: claveFila }
}

/**
 * Interpreta todas las filas y calcula la huella de cada una. Dos filas
 * idénticas (por ejemplo, dos cargas de nafta iguales el mismo día) son
 * movimientos distintos: la huella lleva el número de repetición para que
 * las dos se importen y ninguna se tome como duplicada de la otra.
 */
export async function interpretarPlanilla(filas, catalogo) {
  const indices = indexarCatalogo(catalogo)
  const repeticiones = new Map()
  const resultado = []

  for (const [i, fila] of filas.entries()) {
    if (!fila.some((celda) => String(celda ?? '').trim() !== '')) continue // fila vacía
    const { registro, errores, clave: claveFila } = interpretarFila(fila, indices)
    let huella = null
    if (registro) {
      const n = (repeticiones.get(claveFila) ?? 0) + 1
      repeticiones.set(claveFila, n)
      huella = await sha256(`${claveFila}#${n}`)
    }
    resultado.push({ nroFila: i + 2, fila, registro, errores, huella })
  }
  return resultado
}

/**
 * Busca, para cada fila nueva de la planilla, movimientos ya cargados que se le
 * parezcan: misma fecha y mismo monto, o misma fecha y mismo concepto. Detecta
 * una fila ya importada que después se corrigió en la planilla (cambia su
 * huella) y un gasto cargado dos veces, por el formulario y por la planilla.
 *
 * nuevas:     filas de interpretarPlanilla que no están importadas
 * existentes: [{ id, fecha, concepto, monto, origen }] de la tabla movimientos
 * Devuelve un Map nroFila -> movimientos parecidos (solo las filas con alguno).
 */
export function buscarParecidos(nuevas, existentes) {
  const porFecha = new Map()
  for (const m of existentes) {
    if (!porFecha.has(m.fecha)) porFecha.set(m.fecha, [])
    porFecha.get(m.fecha).push(m)
  }
  const parecidos = new Map()
  for (const f of nuevas) {
    const { fecha, monto, concepto } = f.registro
    const candidatos = (porFecha.get(fecha) ?? []).filter((m) =>
      Math.abs(Number(m.monto) - monto) < 0.005 || clave(m.concepto) === clave(concepto))
    if (candidatos.length) parecidos.set(f.nroFila, candidatos)
  }
  return parecidos
}
