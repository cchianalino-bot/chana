import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useCatalogo } from '../lib/useCatalogo.js'
import { interpretarPlanilla } from '../lib/sincronizacion.js'
import { fechaCorta, pesos } from '../lib/formato.js'

const POR_LOTE = 200       // filas por insert
const MOSTRAR = 50         // filas nuevas que se listan antes de "ver todas"

/** Todas las huellas ya importadas (Supabase devuelve como máximo 1000 filas por consulta). */
async function huellasExistentes() {
  const huellas = new Set()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('movimientos').select('huella').not('huella', 'is', null).range(desde, desde + 999)
    if (error) throw error
    data.forEach((f) => huellas.add(f.huella))
    if (data.length < 1000) return huellas
  }
}

export default function Sincronizar() {
  const catalogo = useCatalogo()
  const [estado, setEstado] = useState('inicial') // inicial | leyendo | vista-previa | guardando | listo
  const [filas, setFilas] = useState([])
  const [verTodas, setVerTodas] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState('')

  const nuevas = filas.filter((f) => f.estado === 'nuevo')
  const existentes = filas.filter((f) => f.estado === 'existe')
  const conError = filas.filter((f) => f.estado === 'error')

  async function leer() {
    setEstado('leyendo')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const respuesta = await fetch('/api/planilla', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) throw new Error(cuerpo.error)

      const [interpretadas, huellas] = await Promise.all([
        interpretarPlanilla(cuerpo.filas, catalogo),
        huellasExistentes(),
      ])
      setFilas(interpretadas.map((f) => ({
        ...f,
        estado: f.errores.length ? 'error' : huellas.has(f.huella) ? 'existe' : 'nuevo',
      })))
      setVerTodas(false)
      setEstado('vista-previa')
    } catch (e) {
      setError(`No se pudo leer la planilla: ${e.message}`)
      setEstado('inicial')
    }
  }

  async function guardar() {
    setEstado('guardando')
    setProgreso(0)
    setError('')
    const { data: lote, error } = await supabase.from('sincronizaciones').insert({
      filas_leidas: filas.length,
      filas_importadas: nuevas.length,
      filas_duplicadas: existentes.length,
      filas_con_error: conError.length,
    }).select('id').single()
    if (error) {
      setError(`No se pudo guardar: ${error.message}`)
      return setEstado('vista-previa')
    }

    for (let i = 0; i < nuevas.length; i += POR_LOTE) {
      const registros = nuevas.slice(i, i + POR_LOTE).map((f) => ({ ...f.registro, huella: f.huella, sincronizacion_id: lote.id }))
      const { error } = await supabase.from('movimientos').insert(registros)
      if (error) {
        // Lo ya guardado queda; al volver a leer, esas filas aparecen como "ya existe".
        setError(`Se guardaron ${i} de ${nuevas.length}. Error: ${error.message}. Volvé a leer la planilla para continuar.`)
        return setEstado('inicial')
      }
      setProgreso(Math.min(i + POR_LOTE, nuevas.length))
    }
    setEstado('listo')
  }

  if (catalogo.cargando) return <p>Cargando…</p>

  return (
    <section>
      <div className="encabezado">
        <h2>Sincronizar con la planilla</h2>
      </div>

      {(estado === 'inicial' || estado === 'leyendo') && (
        <div className="tarjeta">
          <p>
            Lee la hoja <strong>Movimientos</strong> de Google Sheets y te muestra qué se va a
            importar. No se guarda nada hasta que confirmes.
          </p>
          <button type="button" onClick={leer} disabled={estado === 'leyendo'}>
            {estado === 'leyendo' ? 'Leyendo…' : 'Leer planilla'}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {estado === 'vista-previa' && (
        <>
          <div className="indicadores">
            <div className="indicador"><span>Nuevas</span><strong className="ingreso">{nuevas.length}</strong></div>
            <div className="indicador"><span>Ya importadas</span><strong>{existentes.length}</strong></div>
            <div className="indicador"><span>Con error</span><strong className={conError.length ? 'gasto' : ''}>{conError.length}</strong></div>
            <div className="indicador"><span>Filas leídas</span><strong>{filas.length}</strong></div>
          </div>

          {conError.length > 0 && (
            <div className="tarjeta">
              <h3>Filas con error (no se importan)</h3>
              <p className="vacio">Corregilas en la planilla y volvé a leer.</p>
              <ul className="errores">
                {conError.map((f) => (
                  <li key={f.nroFila}><strong>Fila {f.nroFila}:</strong> {f.errores.join(' · ')}</li>
                ))}
              </ul>
            </div>
          )}

          {nuevas.length > 0 && (
            <div className="tarjeta">
              <h3>Se van a importar</h3>
              <table>
                <thead>
                  <tr><th>Fecha</th><th className="texto">Concepto</th><th>Cuotas</th><th>Monto</th></tr>
                </thead>
                <tbody>
                  {(verTodas ? nuevas : nuevas.slice(0, MOSTRAR)).map((f) => (
                    <tr key={f.nroFila}>
                      <td>{fechaCorta(f.registro.fecha)}</td>
                      <td className="texto">{f.registro.concepto}<small>{f.fila[2]} / {f.fila[3]}</small></td>
                      <td>{f.registro.cuotas > 1 ? f.registro.cuotas : ''}</td>
                      <td>{pesos(f.registro.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!verTodas && nuevas.length > MOSTRAR && (
                <button type="button" className="secundario" onClick={() => setVerTodas(true)}>
                  Ver las {nuevas.length} filas
                </button>
              )}
            </div>
          )}

          <div className="acciones">
            <button type="button" className="secundario" onClick={() => setEstado('inicial')}>Cancelar</button>
            <button type="button" onClick={guardar} disabled={nuevas.length === 0}>
              {nuevas.length ? `Importar ${nuevas.length} movimientos` : 'No hay nada nuevo'}
            </button>
          </div>
        </>
      )}

      {estado === 'guardando' && (
        <div className="tarjeta">
          <p>Guardando… {progreso} de {nuevas.length}</p>
          <progress max={nuevas.length} value={progreso} />
        </div>
      )}

      {estado === 'listo' && (
        <div className="tarjeta">
          <p>Listo: se importaron <strong>{nuevas.length}</strong> movimientos.</p>
          <button type="button" onClick={() => { setFilas([]); setEstado('inicial') }}>Volver</button>
        </div>
      )}
    </section>
  )
}
