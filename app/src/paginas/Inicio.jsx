import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { hoy, inicioDeMes, nombreMes, pesos } from '../lib/formato.js'
import SelectorMes from '../componentes/SelectorMes.jsx'
import { URL_PLANILLA } from '../lib/planilla.js'

export default function Inicio() {
  const [mes, setMes] = useState(inicioDeMes(hoy()))
  const [resumen, setResumen] = useState(null)
  const [porGrupo, setPorGrupo] = useState([])
  const [compromisos, setCompromisos] = useState([])

  useEffect(() => {
    supabase.from('v_resumen_mensual').select('*').eq('periodo', mes).maybeSingle()
      .then(({ data }) => setResumen(data ?? { ingresos: 0, gastos: 0, inversiones: 0, saldo: 0 }))

    supabase.from('v_totales_por_subgrupo').select('grupo, total').eq('periodo', mes).eq('tipo', 'gasto')
      .then(({ data }) => {
        const totales = {}
        for (const fila of data ?? []) totales[fila.grupo] = (totales[fila.grupo] ?? 0) + Number(fila.total)
        setPorGrupo(Object.entries(totales).sort((a, b) => b[1] - a[1]))
      })
  }, [mes])

  useEffect(() => {
    supabase.from('v_compromisos_tarjeta').select('*').order('periodo')
      .then(({ data }) => setCompromisos(data ?? []))
  }, [])

  const maximo = Math.max(...porGrupo.map(([, total]) => total), 1)
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
        {porGrupo.length === 0 && <p className="vacio">Sin gastos en {nombreMes(mes)}.</p>}
        <ul className="barras">
          {porGrupo.map(([grupo, total]) => (
            <li key={grupo}>
              <span className="etiqueta">{grupo}</span>
              <span className="barra"><span style={{ width: `${(total / maximo) * 100}%` }} /></span>
              <span className="valor">{pesos(total)}</span>
            </li>
          ))}
        </ul>
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
