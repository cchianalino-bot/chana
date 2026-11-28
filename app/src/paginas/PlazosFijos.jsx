import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fechaCorta, hoy, pesos } from '../lib/formato.js'
import { diasEntre } from '../lib/plazos.js'

function Plazo({ p, accion }) {
  const faltan = diasEntre(hoy(), p.fecha_vencimiento)
  return (
    <li className={`plazo plazo-${p.estado}`}>
      <Link to={`/plazos-fijos/${p.id}`} className="plazo-datos">
        <strong>{p.entidad || 'Plazo fijo'} · {pesos(p.capital)}</strong>
        <small>
          {fechaCorta(p.fecha_inicio)} → {fechaCorta(p.fecha_vencimiento)} · {p.dias} días · TNA {String(p.tna).replace('.', ',')}%
        </small>
        <small>
          Interés {pesos(p.interes)} · cobra {pesos(p.total)}
          {p.estado === 'vigente' && ` · vence en ${faltan} ${faltan === 1 ? 'día' : 'días'}`}
          {p.renovado_de && ' · renovación'}
        </small>
      </Link>
      {accion}
    </li>
  )
}

export default function PlazosFijos() {
  const [plazos, setPlazos] = useState(null)
  const [verHistorial, setVerHistorial] = useState(false)

  useEffect(() => {
    supabase.from('v_plazos_fijos').select('*').order('fecha_vencimiento')
      .then(({ data }) => setPlazos(data ?? []))
  }, [])

  if (plazos === null) return <p>Cargando…</p>

  const vencidos = plazos.filter((p) => p.estado === 'vencido')
  const vigentes = plazos.filter((p) => p.estado === 'vigente')
  const historial = plazos.filter((p) => p.estado === 'renovado').reverse()
  const invertido = vigentes.reduce((suma, p) => suma + Number(p.capital), 0)
  const aCobrar = vigentes.reduce((suma, p) => suma + Number(p.total), 0)

  return (
    <section>
      <div className="encabezado">
        <h2>Plazos fijos</h2>
        <Link className="boton" to="/plazos-fijos/nuevo">+ Nuevo plazo fijo</Link>
      </div>

      <div className="indicadores">
        <div className="indicador"><span>Invertido hoy</span><strong>{pesos(invertido)}</strong></div>
        <div className="indicador"><span>A cobrar</span><strong className="ingreso">{pesos(aCobrar)}</strong></div>
      </div>

      {vencidos.length > 0 && (
        <div className="tarjeta tarjeta-aviso">
          <h3>Vencidos</h3>
          <p className="vacio">La plata ya volvió a la cuenta. Si lo volviste a invertir, renovalo.</p>
          <ul className="lista-plazos">
            {vencidos.map((p) => (
              <Plazo key={p.id} p={p} accion={<Link className="boton" to={`/plazos-fijos/${p.id}/renovar`}>Renovar</Link>} />
            ))}
          </ul>
        </div>
      )}

      <div className="tarjeta">
        <h3>Vigentes</h3>
        {vigentes.length === 0
          ? <p className="vacio">No hay plazos fijos vigentes.</p>
          : <ul className="lista-plazos">{vigentes.map((p) => <Plazo key={p.id} p={p} />)}</ul>}
      </div>

      {historial.length > 0 && (
        <div className="tarjeta">
          <button type="button" className="secundario" onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? 'Ocultar' : 'Ver'} renovados ({historial.length})
          </button>
          {verHistorial && <ul className="lista-plazos">{historial.map((p) => <Plazo key={p.id} p={p} />)}</ul>}
        </div>
      )}
    </section>
  )
}
