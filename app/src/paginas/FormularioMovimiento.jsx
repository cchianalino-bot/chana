import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useSesion } from '../lib/sesion.jsx'
import { useCatalogo } from '../lib/useCatalogo.js'
import { calcularCuotas, primerPeriodoSugerido } from '../lib/cuotas.js'
import { hoy, montoEscritoANumero, nombreMes, numeroAMontoEscrito, pesos } from '../lib/formato.js'
import Buscador from '../componentes/Buscador.jsx'
import InputMonto from '../componentes/InputMonto.jsx'

// Lo que cambia según el tipo: título y cómo se llama el medio de pago.
// Con ingresos e inversiones no se ofrecen tarjetas (y por lo tanto, tampoco cuotas).
const TIPOS = {
  gasto:     { etiqueta: 'Gasto',     titulo: 'gasto',     medio: 'Medio de pago', conTarjeta: true },
  ingreso:   { etiqueta: 'Ingreso',   titulo: 'ingreso',   medio: 'Cobrado en',    conTarjeta: false },
  inversion: { etiqueta: 'Inversión', titulo: 'inversión', medio: 'Desde / hacia', conTarjeta: false },
}

const VACIO = {
  tipo: 'gasto',
  fecha: hoy(),
  grupoId: '',
  subgrupoId: '',
  concepto: '',
  monto: '',          // texto con formato, ej. '1.234,50'
  sentidoInversion: 'sale', // 'sale' = se invierte, 'vuelve' = rescate o renta
  medioId: '',
  cuotas: 1,
  montoEsCuota: false,
  primerPeriodo: '',
  primerPeriodoEditado: false,
  quien: '',
  notas: '',
}

export default function FormularioMovimiento() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { miembro } = useSesion()
  const { grupos, subgrupos, medios, personas, cargando } = useCatalogo()
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  // Al cargar uno nuevo, "Quién" arranca con el nombre de quien está usando la app.
  useEffect(() => {
    if (!id && miembro) setForm((f) => ({ ...f, quien: f.quien || miembro }))
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
        // Los movimientos de un plazo fijo se editan desde el plazo (capital, tasa y vencimiento juntos).
        if (data.plazo_fijo_id) return navegar(`/plazos-fijos/${data.plazo_fijo_id}`, { replace: true })
        setForm({
          tipo: data.subgrupos.grupos.tipo,
          fecha: data.fecha,
          grupoId: String(data.subgrupos.grupo_id),
          subgrupoId: String(data.subgrupo_id),
          concepto: data.concepto,
          monto: numeroAMontoEscrito(Math.abs(data.monto)),
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
  }, [id, cargando, navegar])

  const tipo = TIPOS[form.tipo]
  const gruposDelTipo = grupos.filter((g) => g.tipo === form.tipo)
  const nombreGrupo = Object.fromEntries(grupos.map((g) => [g.id, g.nombre]))

  // El subgrupo se busca entre todos los del tipo; si ya hay grupo elegido, solo entre los de ese grupo.
  const opcionesSubgrupo = subgrupos
    .filter((s) => gruposDelTipo.some((g) => g.id === s.grupo_id))
    .filter((s) => !form.grupoId || String(s.grupo_id) === form.grupoId)
    .map((s) => ({ valor: s.id, etiqueta: s.nombre, detalle: form.grupoId ? undefined : nombreGrupo[s.grupo_id] }))

  const mediosDelTipo = medios.filter((m) => m.tipo !== 'otro' && (tipo.conTarjeta || m.tipo !== 'tarjeta'))
  const medio = mediosDelTipo.find((m) => String(m.id) === form.medioId)
  const esTarjeta = medio?.tipo === 'tarjeta'

  // Mientras no se toque a mano, el mes de la primera cuota sigue a la fecha y al medio de pago.
  const primerPeriodo = form.primerPeriodoEditado
    ? form.primerPeriodo
    : primerPeriodoSugerido(form.fecha, esTarjeta)

  const montoNumero = montoEscritoANumero(form.monto)
  const signo = form.tipo === 'inversion' && form.sentidoInversion === 'sale' ? -1 : 1
  const cuotas = esTarjeta ? Number(form.cuotas) || 1 : 1
  const vistaPrevia = useMemo(
    () => calcularCuotas({ monto: montoNumero, cuotas, montoEsCuota: esTarjeta && form.montoEsCuota, primerPeriodo }),
    [montoNumero, cuotas, esTarjeta, form.montoEsCuota, primerPeriodo],
  )

  function cambiarTipo(nuevo) {
    setForm((f) => {
      const medioActual = medios.find((m) => String(m.id) === f.medioId)
      const sacarMedio = !TIPOS[nuevo].conTarjeta && medioActual?.tipo === 'tarjeta'
      return { ...f, tipo: nuevo, grupoId: '', subgrupoId: '', medioId: sacarMedio ? '' : f.medioId }
    })
  }

  function elegirSubgrupo(subgrupoId) {
    const s = subgrupos.find((x) => x.id === subgrupoId)
    setForm((f) => ({ ...f, subgrupoId: String(subgrupoId), grupoId: String(s.grupo_id) }))
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!(montoNumero > 0)) return setError('Poné un monto mayor a cero.')
    if (!form.subgrupoId) return setError('Elegí el subgrupo.')

    const registro = {
      fecha: form.fecha,
      subgrupo_id: Number(form.subgrupoId),
      concepto: form.concepto.trim(),
      monto: signo * montoNumero,
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
    <form className={`tarjeta formulario tipo-${form.tipo}`} onSubmit={guardar}>
      <h2>{id ? `Editar ${tipo.titulo}` : `Nuevo ${tipo.titulo}`}</h2>

      <div className="selector-tipo" role="radiogroup" aria-label="Tipo">
        {Object.entries(TIPOS).map(([valor, t]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={form.tipo === valor}
            className={`opcion-${valor} ${form.tipo === valor ? 'activo' : ''}`}
            onClick={() => cambiarTipo(valor)}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <div className="fila">
        <label>
          Fecha
          <input
            type="date"
            value={form.fecha}
            onChange={cambiar('fecha')}
            // Abre el calendario tocando en cualquier parte del campo
            onClick={(e) => e.currentTarget.showPicker?.()}
            required
          />
        </label>
        <label>
          Monto
          <InputMonto value={form.monto} onChange={(monto) => setForm((f) => ({ ...f, monto }))} required />
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
          <Buscador
            opciones={[{ valor: '', etiqueta: 'Todos los grupos' }, ...gruposDelTipo.map((g) => ({ valor: g.id, etiqueta: g.nombre }))]}
            valor={form.grupoId}
            onChange={(v) => setForm((f) => {
              if (v === '') return { ...f, grupoId: '' }
              const sigue = subgrupos.some((s) => String(s.id) === f.subgrupoId && s.grupo_id === v)
              return { ...f, grupoId: String(v), subgrupoId: sigue ? f.subgrupoId : '' }
            })}
          />
        </label>
        <label>
          Subgrupo
          <Buscador
            opciones={opcionesSubgrupo}
            valor={form.subgrupoId}
            placeholder="Escribí para buscar, ej. nafta"
            onChange={elegirSubgrupo}
            requerido
          />
        </label>
      </div>

      {form.tipo === 'inversion' && subgrupos.find((x) => String(x.id) === form.subgrupoId)?.nombre.toLowerCase() === 'plazos fijos' && (
        <p className="vacio ayuda">
          Para que calcule los intereses y registre la vuelta de la plata al vencimiento,
          cargalo desde <Link to="/plazos-fijos/nuevo">Plazos fijos</Link>.
        </p>
      )}

      <label>
        Concepto
        <input value={form.concepto} onChange={cambiar('concepto')} placeholder="Ej: La Anónima" required />
      </label>

      <div className="fila">
        <label>
          {tipo.medio}
          <select value={form.medioId} onChange={cambiar('medioId')}>
            <option value="">Sin especificar</option>
            {mediosDelTipo.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
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
                onClick={(e) => e.currentTarget.showPicker?.()}
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
        <button type="submit" className="guardar" disabled={guardando}>
          {guardando ? 'Guardando…' : `Guardar ${tipo.titulo}`}
        </button>
      </div>
    </form>
  )
}
