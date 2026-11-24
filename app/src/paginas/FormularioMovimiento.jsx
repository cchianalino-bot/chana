import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useSesion } from '../lib/sesion.jsx'
import { useCatalogo } from '../lib/useCatalogo.js'
import { calcularCuotas, primerPeriodoSugerido } from '../lib/cuotas.js'
import { hoy, nombreMes, pesos } from '../lib/formato.js'

const TIPOS = [
  { valor: 'gasto', etiqueta: 'Gasto' },
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'inversion', etiqueta: 'Inversión' },
]

const VACIO = {
  tipo: 'gasto',
  fecha: hoy(),
  grupoId: '',
  subgrupoId: '',
  concepto: '',
  monto: '',
  sentidoInversion: 'sale', // 'sale' = se invierte, 'vuelve' = rescate o renta
  medioId: '',
  cuotas: 1,
  montoEsCuota: false,
  primerPeriodo: '',
  primerPeriodoEditado: false,
  quien: 'Ambos',
  notas: '',
}

export default function FormularioMovimiento() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { miembro } = useSesion()
  const { grupos, subgrupos, medios, cargando } = useCatalogo()
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  // Al cargar uno nuevo, "Quién" arranca con el nombre de quien está usando la app.
  useEffect(() => {
    if (!id && miembro) setForm((f) => ({ ...f, quien: miembro }))
  }, [id, miembro])

  // Edición: se trae el movimiento y se completa el formulario.
  useEffect(() => {
    if (!id || cargando) return
    supabase
      .from('movimientos')
      .select('*, subgrupos(grupo_id, grupos(tipo))')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) return setError('No se encontró el movimiento.')
        const tipo = data.subgrupos.grupos.tipo
        setForm({
          tipo,
          fecha: data.fecha,
          grupoId: String(data.subgrupos.grupo_id),
          subgrupoId: String(data.subgrupo_id),
          concepto: data.concepto,
          monto: String(Math.abs(data.monto)),
          sentidoInversion: data.monto < 0 ? 'sale' : 'vuelve',
          medioId: data.medio_pago_id ? String(data.medio_pago_id) : '',
          cuotas: data.cuotas,
          montoEsCuota: data.monto_es_cuota,
          primerPeriodo: data.primer_periodo,
          primerPeriodoEditado: true,
          quien: data.quien,
          notas: data.notas ?? '',
        })
      })
  }, [id, cargando])

  const gruposDelTipo = grupos.filter((g) => g.tipo === form.tipo)
  const subgruposDelGrupo = subgrupos.filter((s) => String(s.grupo_id) === form.grupoId)
  const medio = medios.find((m) => String(m.id) === form.medioId)
  const esTarjeta = medio?.tipo === 'tarjeta'

  // Mientras no se toque a mano, el mes de la primera cuota sigue a la fecha y al medio de pago.
  const primerPeriodo = form.primerPeriodoEditado
    ? form.primerPeriodo
    : primerPeriodoSugerido(form.fecha, esTarjeta)

  const signo = form.tipo === 'inversion' && form.sentidoInversion === 'sale' ? -1 : 1
  const cuotas = esTarjeta ? Number(form.cuotas) || 1 : 1
  const vistaPrevia = useMemo(
    () => calcularCuotas({ monto: form.monto, cuotas, montoEsCuota: esTarjeta && form.montoEsCuota, primerPeriodo }),
    [form.monto, cuotas, esTarjeta, form.montoEsCuota, primerPeriodo],
  )

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!(Number(form.monto) > 0)) return setError('Poné un monto mayor a cero.')

    const registro = {
      fecha: form.fecha,
      subgrupo_id: Number(form.subgrupoId),
      concepto: form.concepto.trim(),
      monto: signo * Number(form.monto),
      cuotas,
      monto_es_cuota: esTarjeta && form.montoEsCuota,
      primer_periodo: primerPeriodo,
      medio_pago_id: form.medioId ? Number(form.medioId) : null,
      quien: form.quien,
      notas: form.notas.trim() || null,
    }

    setGuardando(true)
    const { error } = id
      ? await supabase.from('movimientos').update(registro).eq('id', id)
      : await supabase.from('movimientos').insert({ ...registro, origen: 'formulario' })
    setGuardando(false)

    if (error) return setError(`No se pudo guardar: ${error.message}`)
    navegar('/movimientos')
  }

  async function borrar() {
    if (!window.confirm('¿Borrar este movimiento y todas sus cuotas?')) return
    const { error } = await supabase.from('movimientos').delete().eq('id', id)
    if (error) return setError(`No se pudo borrar: ${error.message}`)
    navegar('/movimientos')
  }

  if (cargando) return <p>Cargando…</p>

  return (
    <form className="tarjeta formulario" onSubmit={guardar}>
      <h2>{id ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>

      <div className="selector-tipo" role="radiogroup" aria-label="Tipo">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={form.tipo === t.valor}
            className={form.tipo === t.valor ? 'activo' : ''}
            onClick={() => setForm((f) => ({ ...f, tipo: t.valor, grupoId: '', subgrupoId: '' }))}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <div className="fila">
        <label>
          Fecha
          <input type="date" value={form.fecha} onChange={cambiar('fecha')} required />
        </label>
        <label>
          Monto
          <input type="number" inputMode="decimal" step="0.01" min="0" value={form.monto} onChange={cambiar('monto')} required />
        </label>
      </div>

      {form.tipo === 'inversion' && (
        <div className="fila opciones">
          <label className="opcion">
            <input type="radio" name="sentido" value="sale" checked={form.sentidoInversion === 'sale'} onChange={cambiar('sentidoInversion')} />
            Invierto (sale plata)
          </label>
          <label className="opcion">
            <input type="radio" name="sentido" value="vuelve" checked={form.sentidoInversion === 'vuelve'} onChange={cambiar('sentidoInversion')} />
            Rescate o renta (vuelve plata)
          </label>
        </div>
      )}

      <div className="fila">
        <label>
          Grupo
          <select value={form.grupoId} onChange={(e) => setForm((f) => ({ ...f, grupoId: e.target.value, subgrupoId: '' }))} required>
            <option value="">Elegí…</option>
            {gruposDelTipo.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
        <label>
          Subgrupo
          <select value={form.subgrupoId} onChange={cambiar('subgrupoId')} required disabled={!form.grupoId}>
            <option value="">Elegí…</option>
            {subgruposDelGrupo.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      </div>

      <label>
        Concepto
        <input value={form.concepto} onChange={cambiar('concepto')} placeholder="Ej: La Anónima" required />
      </label>

      <div className="fila">
        <label>
          Medio de pago
          <select value={form.medioId} onChange={cambiar('medioId')}>
            <option value="">Sin especificar</option>
            {medios.filter((m) => m.tipo !== 'otro').map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </label>
        <label>
          Quién
          <select value={form.quien} onChange={cambiar('quien')}>
            <option>Meli</option>
            <option>Carli</option>
            <option>Ambos</option>
          </select>
        </label>
      </div>

      {esTarjeta && (
        <fieldset className="cuotas">
          <legend>Cuotas</legend>
          <div className="fila">
            <label>
              Cantidad
              <input type="number" min="1" max="60" value={form.cuotas} onChange={cambiar('cuotas')} />
            </label>
            <label>
              Mes de la 1ra cuota
              <input
                type="month"
                value={primerPeriodo.slice(0, 7)}
                onChange={(e) => setForm((f) => ({ ...f, primerPeriodo: `${e.target.value}-01`, primerPeriodoEditado: true }))}
              />
            </label>
          </div>
          {cuotas > 1 && (
            <label className="opcion">
              <input type="checkbox" checked={form.montoEsCuota} onChange={cambiar('montoEsCuota')} />
              El monto es el valor de cada cuota (cuando hay recargo)
            </label>
          )}
        </fieldset>
      )}

      {vistaPrevia.length > 1 && (
        <div className="vista-previa">
          <p>Se va a repartir así:</p>
          <ul>
            {vistaPrevia.map((c) => (
              <li key={c.nro}>
                <span>Cuota {c.nro} · {nombreMes(c.periodo)}</span>
                <strong>{pesos(c.monto)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label>
        Notas
        <textarea value={form.notas} onChange={cambiar('notas')} rows={2} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        {id && <button type="button" className="peligro" onClick={borrar}>Borrar</button>}
        <button type="button" className="secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
