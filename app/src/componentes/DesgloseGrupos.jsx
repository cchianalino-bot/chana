import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fechaCorta, pesos } from '../lib/formato.js'

/**
 * Totales del mes por grupo, con desglose en tres niveles:
 * grupo → subgrupos → movimientos (se cargan al abrir el subgrupo).
 *
 * filas: [{ grupo_id, grupo, subgrupo_id, subgrupo, total }] de v_totales_por_subgrupo
 */
export default function DesgloseGrupos({ filas, mes }) {
  const [grupoAbierto, setGrupoAbierto] = useState(null)
  const [subgrupoAbierto, setSubgrupoAbierto] = useState(null)
  const [movimientos, setMovimientos] = useState(null)

  // Al cambiar de mes se cierra todo.
  useEffect(() => {
    setGrupoAbierto(null)
    setSubgrupoAbierto(null)
  }, [mes])

  useEffect(() => {
    if (!subgrupoAbierto) return
    setMovimientos(null)
    supabase
      .from('v_imputaciones')
      .select('movimiento_id, fecha, concepto, monto, nro_cuota, cuotas, medio_pago')
      .eq('periodo', mes)
      .eq('subgrupo_id', subgrupoAbierto)
      .order('monto', { ascending: false })
      .then(({ data }) => setMovimientos(data ?? []))
  }, [mes, subgrupoAbierto])

  const grupos = Object.values(filas.reduce((acc, f) => {
    acc[f.grupo_id] ??= { id: f.grupo_id, nombre: f.grupo, total: 0, subgrupos: [] }
    acc[f.grupo_id].total += Number(f.total)
    acc[f.grupo_id].subgrupos.push({ id: f.subgrupo_id, nombre: f.subgrupo, total: Number(f.total) })
    return acc
  }, {})).sort((a, b) => b.total - a.total)

  const maximo = Math.max(...grupos.map((g) => g.total), 1)

  function alternarGrupo(id) {
    setGrupoAbierto((actual) => (actual === id ? null : id))
    setSubgrupoAbierto(null)
  }

  return (
    <ul className="barras desglose">
      {grupos.map((g) => {
        const abierto = grupoAbierto === g.id
        const subgrupos = [...g.subgrupos].sort((a, b) => b.total - a.total)
        const maxSub = Math.max(...subgrupos.map((s) => s.total), 1)
        return (
          <li key={g.id} className={abierto ? 'abierto' : ''}>
            <button type="button" className="fila-barra" aria-expanded={abierto} onClick={() => alternarGrupo(g.id)}>
              <span className="etiqueta"><span className="flecha" aria-hidden="true">›</span>{g.nombre}</span>
              <span className="barra"><span style={{ width: `${(g.total / maximo) * 100}%` }} /></span>
              <span className="valor">{pesos(g.total)}</span>
            </button>

            {abierto && (
              <ul className="barras subniveles">
                {subgrupos.map((s) => {
                  const subAbierto = subgrupoAbierto === s.id
                  return (
                    <li key={s.id}>
                      <button type="button" className="fila-barra" aria-expanded={subAbierto}
                        onClick={() => setSubgrupoAbierto(subAbierto ? null : s.id)}>
                        <span className="etiqueta"><span className="flecha" aria-hidden="true">›</span>{s.nombre}</span>
                        <span className="barra"><span style={{ width: `${(s.total / maxSub) * 100}%` }} /></span>
                        <span className="valor">
                          {pesos(s.total)}
                          <small>{Math.round((s.total / g.total) * 100)}%</small>
                        </span>
                      </button>

                      {subAbierto && (
                        <ul className="detalle-movimientos">
                          {movimientos === null && <li className="vacio">Cargando…</li>}
                          {movimientos?.map((m, i) => (
                            <li key={`${m.movimiento_id}-${m.nro_cuota}-${i}`}>
                              <Link to={`/movimientos/${m.movimiento_id}`}>
                                <span>
                                  {m.concepto}
                                  <small>
                                    {fechaCorta(m.fecha)}
                                    {m.cuotas > 1 && ` · cuota ${m.nro_cuota}/${m.cuotas}`}
                                    {m.medio_pago && ` · ${m.medio_pago}`}
                                  </small>
                                </span>
                                <span className="valor">{pesos(m.monto)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
