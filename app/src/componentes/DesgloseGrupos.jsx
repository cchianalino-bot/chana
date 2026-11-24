import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fechaCorta, nombreMes, pesos } from '../lib/formato.js'

/**
 * Totales del mes por grupo. Al tocar un grupo se abre un modal con sus
 * subgrupos (monto, porcentaje y total) y, al tocar un subgrupo, sus
 * movimientos del mes.
 *
 * filas: [{ grupo_id, grupo, subgrupo_id, subgrupo, total }] de v_totales_por_subgrupo
 * tipo:  'gasto' o 'ingreso' (define el color)
 */
export default function DesgloseGrupos({ filas, mes, tipo = 'gasto' }) {
  const [grupoId, setGrupoId] = useState(null)

  const grupos = Object.values(filas.reduce((acc, f) => {
    acc[f.grupo_id] ??= { id: f.grupo_id, nombre: f.grupo, total: 0, subgrupos: [] }
    acc[f.grupo_id].total += Number(f.total)
    acc[f.grupo_id].subgrupos.push({ id: f.subgrupo_id, nombre: f.subgrupo, total: Number(f.total) })
    return acc
  }, {})).sort((a, b) => b.total - a.total)

  const maximo = Math.max(...grupos.map((g) => g.total), 1)
  const grupo = grupos.find((g) => g.id === grupoId)

  return (
    <>
      <ul className={`barras desglose desglose-${tipo}`}>
        {grupos.map((g) => (
          <li key={g.id}>
            <button type="button" className="fila-barra" onClick={() => setGrupoId(g.id)}>
              <span className="etiqueta">{g.nombre}</span>
              <span className="barra"><span style={{ width: `${(g.total / maximo) * 100}%` }} /></span>
              <span className="valor">{pesos(g.total)}<span className="flecha" aria-hidden="true">›</span></span>
            </button>
          </li>
        ))}
      </ul>
      {grupo && <ModalGrupo grupo={grupo} mes={mes} tipo={tipo} onCerrar={() => setGrupoId(null)} />}
    </>
  )
}

function ModalGrupo({ grupo, mes, tipo, onCerrar }) {
  const dialogo = useRef(null)
  const [subgrupo, setSubgrupo] = useState(null)
  const [movimientos, setMovimientos] = useState(null)

  // <dialog> nativo: bloquea el fondo y se cierra con Escape.
  useEffect(() => {
    const d = dialogo.current
    d.showModal()
    return () => d.close()
  }, [])

  useEffect(() => {
    if (!subgrupo) return
    setMovimientos(null)
    supabase
      .from('v_imputaciones')
      .select('movimiento_id, fecha, concepto, monto, nro_cuota, cuotas, medio_pago')
      .eq('periodo', mes)
      .eq('subgrupo_id', subgrupo.id)
      .order('monto', { ascending: false })
      .then(({ data }) => setMovimientos(data ?? []))
  }, [mes, subgrupo])

  const subgrupos = [...grupo.subgrupos].sort((a, b) => b.total - a.total)
  const total = subgrupos.reduce((suma, s) => suma + s.total, 0)

  return (
    <dialog
      ref={dialogo}
      className={`modal modal-${tipo}`}
      onCancel={onCerrar}
      // Un clic en el fondo oscuro (fuera del contenido) cierra el modal.
      onClick={(e) => e.target === dialogo.current && onCerrar()}
    >
      <div className="modal-contenido">
        <header className="modal-encabezado">
          <div>
            {subgrupo && (
              <button type="button" className="enlace" onClick={() => setSubgrupo(null)}>← {grupo.nombre}</button>
            )}
            <h3>{subgrupo ? subgrupo.nombre : grupo.nombre}</h3>
            <small>{nombreMes(mes)}</small>
          </div>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        </header>

        {!subgrupo ? (
          <table className="tabla-modal">
            <thead>
              <tr><th>Subgrupo</th><th>Monto</th><th>%</th></tr>
            </thead>
            <tbody>
              {subgrupos.map((s) => (
                <tr key={s.id} className="clic" onClick={() => setSubgrupo(s)}>
                  <td>{s.nombre} <span className="flecha" aria-hidden="true">›</span></td>
                  <td>{pesos(s.total)}</td>
                  <td>{Math.round((s.total / total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td>{pesos(total)}</td><td>100%</td></tr>
            </tfoot>
          </table>
        ) : (
          <table className="tabla-modal">
            <thead>
              <tr><th>Movimiento</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {movimientos === null && <tr><td colSpan={2}>Cargando…</td></tr>}
              {movimientos?.map((m, i) => (
                <tr key={`${m.movimiento_id}-${m.nro_cuota}-${i}`}>
                  <td>
                    <Link to={`/movimientos/${m.movimiento_id}`}>{m.concepto}</Link>
                    <small>
                      {fechaCorta(m.fecha)}
                      {m.cuotas > 1 && ` · cuota ${m.nro_cuota}/${m.cuotas}`}
                      {m.medio_pago && ` · ${m.medio_pago}`}
                    </small>
                  </td>
                  <td>{pesos(m.monto)}</td>
                </tr>
              ))}
            </tbody>
            {movimientos?.length > 0 && (
              <tfoot>
                <tr><td>Total</td><td>{pesos(movimientos.reduce((suma, m) => suma + Number(m.monto), 0))}</td></tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </dialog>
  )
}
