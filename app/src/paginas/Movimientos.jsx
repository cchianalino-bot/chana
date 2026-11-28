import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useCatalogo } from '../lib/useCatalogo.js'
import { fechaCorta, hoy, inicioDeMes, pesos, sumarMeses } from '../lib/formato.js'
import SelectorMes from '../componentes/SelectorMes.jsx'

export default function Movimientos() {
  const { grupos } = useCatalogo()
  const [mes, setMes] = useState(inicioDeMes(hoy()))
  const [grupoId, setGrupoId] = useState('')
  const [movimientos, setMovimientos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setMovimientos(null)
    let consulta = supabase
      .from('movimientos')
      .select('id, fecha, concepto, monto, cuotas, quien, subgrupos!inner(nombre, grupo_id, grupos(nombre, tipo)), medios_pago(nombre)')
      .gte('fecha', mes)
      .lt('fecha', sumarMeses(mes, 1))
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
    if (grupoId) consulta = consulta.eq('subgrupos.grupo_id', grupoId)

    consulta.then(({ data, error }) => {
      if (error) setError(error.message)
      setMovimientos(data ?? [])
    })
  }, [mes, grupoId])

  return (
    <section>
      <div className="encabezado">
        <h2>Movimientos</h2>
        <div className="encabezado-acciones">
          <Link className="boton secundario" to="/plazos-fijos">Plazos fijos</Link>
          <Link className="boton" to="/movimientos/nuevo">+ Nuevo</Link>
        </div>
      </div>

      <div className="filtros">
        <SelectorMes mes={mes} onChange={setMes} />
        <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} aria-label="Grupo">
          <option value="">Todos los grupos</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {movimientos === null && <p>Cargando…</p>}
      {movimientos?.length === 0 && <p className="vacio">No hay movimientos cargados con fecha en este mes.</p>}

      <ul className="lista-movimientos">
        {movimientos?.map((m) => {
          const tipo = m.subgrupos.grupos.tipo
          return (
            <li key={m.id}>
              <Link to={`/movimientos/${m.id}`}>
                <div>
                  <strong>{m.concepto}</strong>
                  <small>
                    {fechaCorta(m.fecha)} · {m.subgrupos.grupos.nombre} / {m.subgrupos.nombre}
                    {m.medios_pago && ` · ${m.medios_pago.nombre}`}
                    {m.cuotas > 1 && ` · ${m.cuotas} cuotas`}
                  </small>
                </div>
                <span className={`monto ${tipo}`}>{pesos(tipo === 'gasto' ? -m.monto : m.monto)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
