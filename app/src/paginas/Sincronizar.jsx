import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useCatalogo } from '../lib/useCatalogo.js'
import { buscarParecidos, interpretarPlanilla } from '../lib/sincronizacion.js'
import { fechaCorta, pesos } from '../lib/formato.js'
import { URL_PLANILLA } from '../lib/planilla.js'

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

/** Movimientos ya cargados entre dos fechas (por la planilla o por el formulario). */
async function movimientosEntre(desde, hasta) {
  const todos = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from('movimientos').select('id, fecha, concepto, monto, origen')
      .gte('fecha', desde).lte('fecha', hasta).order('id').range(inicio, inicio + 999)
    if (error) throw error
    todos.push(...data)
    if (data.length < 1000) return todos
  }
}

const movimientos = (n) => `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`

const ORIGEN = { formulario: 'cargado en la app', planilla: 'de la planilla', migracion: 'del historial' }

export default function Sincronizar() {
  const catalogo = useCatalogo()
  const [estado, setEstado] = useState('inicial') // inicial | leyendo | vista-previa | guardando | listo
  const [filas, setFilas] = useState([])
  const [verTodas, setVerTodas] = useState(false)
  const [marcadas, setMarcadas] = useState(new Set()) // posibles duplicados que se importan igual
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState('')

  const nuevas = filas.filter((f) => f.estado === 'nuevo')
  const dudosas = filas.filter((f) => f.estado === 'dudosa')
  const existentes = filas.filter((f) => f.estado === 'existe')
  const conError = filas.filter((f) => f.estado === 'error')
  const aImportar = [...nuevas, ...dudosas.filter((f) => marcadas.has(f.nroFila))]

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
      const conEstado = interpretadas.map((f) => ({
        ...f,
        estado: f.errores.length ? 'error' : huellas.has(f.huella) ? 'existe' : 'nuevo',
      }))

      // Las filas nuevas que se parecen a algo ya cargado quedan aparte, para revisarlas.
      const sinImportar = conEstado.filter((f) => f.estado === 'nuevo')
      if (sinImportar.length) {
        const fechas = sinImportar.map((f) => f.registro.fecha).sort()
        const parecidos = buscarParecidos(sinImportar, await movimientosEntre(fechas[0], fechas.at(-1)))
        for (const f of sinImportar) {
          if (parecidos.has(f.nroFila)) Object.assign(f, { estado: 'dudosa', parecidos: parecidos.get(f.nroFila) })
        }
      }

      setFilas(conEstado)
      setMarcadas(new Set())
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
      filas_importadas: aImportar.length,
      filas_duplicadas: existentes.length + dudosas.length - (aImportar.length - nuevas.length),
      filas_con_error: conError.length,
    }).select('id').single()
    if (error) {
      setError(`No se pudo guardar: ${error.message}`)
      return setEstado('vista-previa')
    }

    for (let i = 0; i < aImportar.length; i += POR_LOTE) {
      const registros = aImportar.slice(i, i + POR_LOTE).map((f) => ({ ...f.registro, huella: f.huella, sincronizacion_id: lote.id }))
      const { error } = await supabase.from('movimientos').insert(registros)
      if (error) {
        // Lo ya guardado queda; al volver a leer, esas filas aparecen como "ya existe".
        setError(`Se guardaron ${i} de ${aImportar.length}. Error: ${error.message}. Volvé a leer la planilla para continuar.`)
        return setEstado('inicial')
      }
      setProgreso(Math.min(i + POR_LOTE, aImportar.length))
    }
    setEstado('listo')
  }

  if (catalogo.cargando) return <p>Cargando…</p>

  return (
    <section>
      <div className="encabezado">
        <h2>Sincronizar con la planilla</h2>
        <a className="boton secundario" href={URL_PLANILLA} target="_blank" rel="noopener noreferrer">Abrir planilla ↗</a>
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
            <div className="indicador"><span>Posibles duplicados</span><strong className={dudosas.length ? 'aviso' : ''}>{dudosas.length}</strong></div>
            <div className="indicador"><span>Ya importadas</span><strong>{existentes.length}</strong></div>
            <div className="indicador"><span>Con error</span><strong className={conError.length ? 'gasto' : ''}>{conError.length}</strong></div>
          </div>
          <p className="vacio">Filas leídas: {filas.length}</p>

          {dudosas.length > 0 && (
            <div className="tarjeta tarjeta-aviso">
              <h3>Posibles duplicados</h3>
              <p className="vacio">
                Se parecen a algo que ya está cargado (misma fecha y mismo monto, o mismo concepto).
                No se importan, salvo que las marques. Si corregiste una fila ya importada, la
                corrección se hace en la app.
              </p>
              <ul className="dudosas">
                {dudosas.map((f) => (
                  <li key={f.nroFila}>
                    <label className="opcion">
                      <input
                        type="checkbox"
                        checked={marcadas.has(f.nroFila)}
                        onChange={(e) => setMarcadas((m) => {
                          const nuevo = new Set(m)
                          if (e.target.checked) nuevo.add(f.nroFila)
                          else nuevo.delete(f.nroFila)
                          return nuevo
                        })}
                      />
                      <span>
                        <strong>Fila {f.nroFila}:</strong> {fechaCorta(f.registro.fecha)} · {f.registro.concepto} · {pesos(f.registro.monto)}
                        {f.parecidos.map((p) => (
                          <small key={p.id}>
                            Parecido a: <Link to={`/movimientos/${p.id}`}>{p.concepto}</Link> · {pesos(p.monto)} ({ORIGEN[p.origen] ?? p.origen})
                          </small>
                        ))}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {conError.length > 0 && (
            <div className="tarjeta">
              <h3>Filas con error (no se importan)</h3>
              <p className="vacio">
                Corregilas en la <a href={URL_PLANILLA} target="_blank" rel="noopener noreferrer">planilla</a> y volvé a leer.
              </p>
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
            <button type="button" onClick={guardar} disabled={aImportar.length === 0}>
              {aImportar.length ? `Importar ${movimientos(aImportar.length)}` : 'No hay nada para importar'}
            </button>
          </div>
        </>
      )}

      {estado === 'guardando' && (
        <div className="tarjeta">
          <p>Guardando… {progreso} de {aImportar.length}</p>
          <progress max={aImportar.length} value={progreso} />
        </div>
      )}

      {estado === 'listo' && (
        <div className="tarjeta">
          <p>Listo: se {aImportar.length === 1 ? 'importó' : 'importaron'} <strong>{movimientos(aImportar.length)}</strong>.</p>
          <button type="button" onClick={() => { setFilas([]); setEstado('inicial') }}>Volver</button>
        </div>
      )}
    </section>
  )
}
