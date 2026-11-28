import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { hoy, inicioDeMes, nombreMes, pesos } from '../lib/formato.js'
import SelectorMes from '../componentes/SelectorMes.jsx'
import { URL_PLANILLA } from '../lib/planilla.js'
import DesgloseGrupos from '../componentes/DesgloseGrupos.jsx'
import { Link } from 'react-router-dom'
import { fechaCorta } from '../lib/formato.js'

export default function Inicio() {
  const [mes, setMes] = useState(inicioDeMes(hoy()))
  const [resumen, setResumen] = useState(null)
  const [porGrupo, setPorGrupo] = useState([])
  const [compromisos, setCompromisos] = useState([])
  const [plazos, setPlazos] = useState([])

  useEffect(() => {
    supabase.from('v_resumen_mensual').select('*').eq('periodo', mes).maybeSingle()
      .then(({ data }) => setResumen(data ?? { ingresos: 0, gastos: 0, inversiones: 0, saldo: 0 }))

    supabase.from('v_totales_por_subgrupo').select('tipo, grupo_id, grupo, subgrupo_id, subgrupo, total')
      .eq('periodo', mes).in('tipo', ['gasto', 'ingreso'])
      .then(({ data }) => setPorGrupo(data ?? []))
  }, [mes])

  useEffect(() => {
    supabase.from('v_compromisos_tarjeta').select('*').order('periodo')
      .then(({ data }) => setCompromisos(data ?? []))
    supabase.from('v_plazos_fijos').select('id, entidad, capital, total, fecha_vencimiento, estado')
      .in('estado', ['vigente', 'vencido']).order('fecha_vencimiento')
      .then(({ data }) => setPlazos(data ?? []))
  }, [])

  const gastos = porGrupo.filter((f) => f.tipo === 'gasto')
  const ingresos = porGrupo.filter((f) => f.tipo === 'ingreso')
  const compromisosPorMes = {}
  for (const c of compromisos) {
    compromisosPorMes[c.periodo] ??= {}
    compromisosPorMes[c.periodo][c.medio_pago] = Number(c.total)
  }
  const tarjetas = [...new Set(compromisos.map((c) => c.medio_pago))]

  return (
    <section>
      <div className="encabezado">
        <h2>Resumen</h2>
        <div className="encabezado-acciones">
          <SelectorMes mes={mes} onChange={setMes} />
          <a className="boton secundario" href={URL_PLANILLA} target="_blank" rel="noopener noreferrer">Abrir planilla ↗</a>
        </div>
      </div>

      {resumen && (
        <div className="indicadores">
          <div className="indicador"><span>Ingresos</span><strong className="ingreso">{pesos(resumen.ingresos)}</strong></div>
          <div className="indicador"><span>Gastos</span><strong className="gasto">{pesos(resumen.gastos)}</strong></div>
          <div className="indicador"><span>Inversiones (neto)</span><strong>{pesos(resumen.inversiones)}</strong></div>
          <div className="indicador"><span>Saldo</span><strong className={resumen.saldo < 0 ? 'gasto' : 'ingreso'}>{pesos(resumen.saldo)}</strong></div>
        </div>
      )}

      <div className="tarjeta">
        <h3>Gastos por grupo</h3>
        {gastos.length === 0
          ? <p className="vacio">Sin gastos en {nombreMes(mes)}.</p>
          : <p className="vacio ayuda">Tocá un grupo para ver el detalle por subgrupo.</p>}
        <DesgloseGrupos filas={gastos} mes={mes} tipo="gasto" />
      </div>

      <div className="tarjeta">
        <h3>Ingresos por grupo</h3>
        {ingresos.length === 0
          ? <p className="vacio">Sin ingresos en {nombreMes(mes)}.</p>
          : <p className="vacio ayuda">Tocá un grupo para ver el detalle por subgrupo.</p>}
        <DesgloseGrupos filas={ingresos} mes={mes} tipo="ingreso" />
      </div>

      <div className="tarjeta">
        <div className="encabezado">
          <h3>Plazos fijos</h3>
          <Link to="/plazos-fijos">Ver todos ›</Link>
        </div>
        {plazos.length === 0 ? (
          <p className="vacio">No hay plazos fijos vigentes. <Link to="/plazos-fijos/nuevo">Cargar uno</Link></p>
        ) : (
          <ul className="lista-plazos compacta">
            {plazos.map((p) => (
              <li key={p.id} className={`plazo plazo-${p.estado}`}>
                <Link to={p.estado === 'vencido' ? `/plazos-fijos/${p.id}/renovar` : `/plazos-fijos/${p.id}`} className="plazo-datos">
                  <strong>{p.entidad || 'Plazo fijo'} · {pesos(p.capital)}</strong>
                  <small>
                    {p.estado === 'vencido'
                      ? `Venció el ${fechaCorta(p.fecha_vencimiento)} · tocá para renovar`
                      : `Vence el ${fechaCorta(p.fecha_vencimiento)} · cobra ${pesos(p.total)}`}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tarjeta">
        <h3>Cuotas de tarjeta que vienen</h3>
        {compromisos.length === 0 ? (
          <p className="vacio">No hay cuotas pendientes.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Mes</th>{tarjetas.map((t) => <th key={t}>{t}</th>)}<th>Total</th></tr>
            </thead>
            <tbody>
              {Object.entries(compromisosPorMes).map(([periodo, porTarjeta]) => (
                <tr key={periodo}>
                  <td>{nombreMes(periodo)}</td>
                  {tarjetas.map((t) => <td key={t}>{pesos(porTarjeta[t] ?? 0)}</td>)}
                  <td><strong>{pesos(Object.values(porTarjeta).reduce((a, b) => a + b, 0))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
