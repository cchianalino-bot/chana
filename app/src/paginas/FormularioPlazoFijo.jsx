import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useSesion } from '../lib/sesion.jsx'
import { useCatalogo } from '../lib/useCatalogo.js'
import { fechaCorta, hoy, montoEscritoANumero, numeroAMontoEscrito, pesos } from '../lib/formato.js'
import { calcularInteres, diasEntre, leerTasa, sumarDias } from '../lib/plazos.js'
import InputMonto from '../componentes/InputMonto.jsx'

const DIAS_POR_DEFECTO = 30

/**
 * Alta, edición y renovación de un plazo fijo.
 *   /plazos-fijos/nuevo        alta
 *   /plazos-fijos/:id          edición
 *   /plazos-fijos/:id/renovar  renovación: precarga capital + intereses, misma tasa y
 *                              mismo plazo, arrancando el día del vencimiento anterior
 */
export default function FormularioPlazoFijo() {
  const { id } = useParams()
  const renovando = useLocation().pathname.endsWith('/renovar')
  const navegar = useNavigate()
  const { miembro } = useSesion()
  const { grupos, subgrupos, medios, personas, cargando } = useCatalogo()
  const [form, setForm] = useState({
    fechaInicio: hoy(), dias: DIAS_POR_DEFECTO, capital: '', tna: '', entidad: '',
    subgrupoId: '', medioId: '', quien: '', notas: '',
  })
  const [anterior, setAnterior] = useState(null) // al renovar: el plazo que vence
  const [reinvertir, setReinvertir] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const subgruposInversion = subgrupos.filter((s) => grupos.some((g) => g.id === s.grupo_id && g.tipo === 'inversion'))
  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  // Valores por defecto de un plazo nuevo: subgrupo "Plazos fijos" y quien usa la app.
  useEffect(() => {
    if (id || cargando) return
    const pf = subgruposInversion.find((s) => s.nombre.toLowerCase() === 'plazos fijos') ?? subgruposInversion[0]
    setForm((f) => ({ ...f, subgrupoId: f.subgrupoId || String(pf?.id ?? ''), quien: f.quien || miembro || '' }))
  }, [id, cargando, miembro]) // eslint-disable-line react-hooks/exhaustive-deps

  // Edición o renovación: se trae el plazo.
  useEffect(() => {
    if (!id || cargando) return
    supabase.from('v_plazos_fijos').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setError('No se encontró el plazo fijo.')
      const comun = {
        tna: String(data.tna).replace('.', ','), entidad: data.entidad ?? '',
        subgrupoId: String(data.subgrupo_id ?? ''), medioId: data.medio_pago_id ? String(data.medio_pago_id) : '',
        quien: data.quien ?? miembro ?? '', notas: data.notas ?? '',
      }
      if (renovando) {
        setAnterior(data)
        setForm({ ...comun, fechaInicio: data.fecha_vencimiento, dias: data.dias, capital: numeroAMontoEscrito(data.total) })
      } else {
        setForm({ ...comun, fechaInicio: data.fecha_inicio, dias: data.dias, capital: numeroAMontoEscrito(data.capital) })
      }
    })
  }, [id, cargando, renovando]) // eslint-disable-line react-hooks/exhaustive-deps

  const capital = montoEscritoANumero(form.capital) ?? 0
  const tna = leerTasa(form.tna)
  const dias = Number(form.dias) || 0
  const fechaVencimiento = dias > 0 ? sumarDias(form.fechaInicio, dias) : form.fechaInicio
  const interes = calcularInteres(capital, tna ?? 0, dias)

  function alternarReinversion(e) {
    const si = e.target.checked
    setReinvertir(si)
    if (anterior) setForm((f) => ({ ...f, capital: numeroAMontoEscrito(si ? anterior.total : anterior.capital) }))
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!(capital > 0)) return setError('Poné el capital.')
    if (tna === null) return setError('Poné la tasa (TNA).')
    if (!(dias > 0)) return setError('El plazo tiene que ser de al menos 1 día.')
    if (!form.subgrupoId) return setError('Elegí el subgrupo.')

    setGuardando(true)
    const { error } = await supabase.rpc('guardar_plazo_fijo', {
      p_id: id && !renovando ? Number(id) : null,
      p_subgrupo_id: Number(form.subgrupoId),
      p_entidad: form.entidad,
      p_capital: capital,
      p_tna: tna,
      p_fecha_inicio: form.fechaInicio,
      p_fecha_vencimiento: fechaVencimiento,
      p_medio_pago_id: form.medioId ? Number(form.medioId) : null,
      p_quien: form.quien,
      p_notas: form.notas.trim() || null,
      p_renovado_de: renovando ? Number(id) : null,
    })
    setGuardando(false)
    if (error) return setError(`No se pudo guardar: ${error.message}`)
    navegar('/plazos-fijos')
  }

  async function borrar() {
    if (!window.confirm('¿Borrar este plazo fijo y sus dos movimientos?')) return
    const { error } = await supabase.from('plazos_fijos').delete().eq('id', id)
    if (error) return setError(`No se pudo borrar: ${error.message}`)
    navegar('/plazos-fijos')
  }

  if (cargando) return <p>Cargando…</p>

  const titulo = renovando ? 'Renovar plazo fijo' : id ? 'Editar plazo fijo' : 'Nuevo plazo fijo'

  return (
    <form className="tarjeta formulario tipo-inversion" onSubmit={guardar}>
      <h2>{titulo}</h2>

      {anterior && (
        <div className="vista-previa">
          <p>
            Vence el <strong>{fechaCorta(anterior.fecha_vencimiento)}</strong>: {pesos(anterior.capital)} + {pesos(anterior.interes)} de
            intereses = <strong>{pesos(anterior.total)}</strong>.
          </p>
          <label className="opcion">
            <input type="checkbox" checked={reinvertir} onChange={alternarReinversion} />
            Reinvertir también los intereses
          </label>
          {!reinvertir && <p className="vacio">Los {pesos(anterior.interes)} de intereses quedan en la cuenta.</p>}
        </div>
      )}

      <div className="fila">
        <label>
          Capital
          <InputMonto value={form.capital} onChange={(v) => setForm((f) => ({ ...f, capital: v }))} required />
        </label>
        <label>
          Tasa nominal anual (TNA %)
          <input inputMode="decimal" placeholder="Ej: 32,5" value={form.tna} onChange={cambiar('tna')} required />
        </label>
      </div>

      <div className="fila">
        <label>
          Fecha de constitución
          <input type="date" value={form.fechaInicio} onChange={cambiar('fechaInicio')}
            onClick={(e) => e.currentTarget.showPicker?.()} required />
        </label>
        <label>
          Plazo (días)
          <input type="number" min="1" max="1825" value={form.dias} onChange={cambiar('dias')} required />
        </label>
      </div>

      <label>
        Vencimiento
        <input
          type="date"
          value={fechaVencimiento}
          min={sumarDias(form.fechaInicio, 1)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          // Elegir la fecha de vencimiento recalcula los días.
          onChange={(e) => e.target.value && setForm((f) => ({ ...f, dias: diasEntre(f.fechaInicio, e.target.value) }))}
        />
      </label>

      <div className="resumen-plazo">
        <div><span>Interés</span><strong className="ingreso">{pesos(interes)}</strong></div>
        <div><span>Total a cobrar</span><strong>{pesos(capital + interes)}</strong></div>
        <div><span>Vence</span><strong>{fechaCorta(fechaVencimiento)}</strong></div>
      </div>

      <div className="fila">
        <label>
          Banco / entidad
          <input value={form.entidad} onChange={cambiar('entidad')} placeholder="Ej: Galicia" />
        </label>
        <label>
          Subgrupo
          <select value={form.subgrupoId} onChange={cambiar('subgrupoId')} required>
            <option value="" disabled>Elegí…</option>
            {subgruposInversion.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      </div>

      <div className="fila">
        <label>
          Desde / hacia
          <select value={form.medioId} onChange={cambiar('medioId')}>
            <option value="">Sin especificar</option>
            {medios.filter((m) => m.tipo !== 'otro' && m.tipo !== 'tarjeta').map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </label>
        <label>
          Quién
          <select value={form.quien} onChange={cambiar('quien')} required>
            {!form.quien && <option value="">Elegí…</option>}
            {personas.map((p) => <option key={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      </div>

      <label>
        Notas
        <textarea value={form.notas} onChange={cambiar('notas')} rows={2} />
      </label>

      <p className="vacio ayuda">
        Se registran dos movimientos: la salida del capital el día de constitución y la vuelta
        del capital con intereses el día del vencimiento.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        {id && !renovando && <button type="button" className="peligro" onClick={borrar}>Borrar</button>}
        <button type="button" className="secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button type="submit" className="guardar" disabled={guardando}>
          {guardando ? 'Guardando…' : renovando ? 'Renovar' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
