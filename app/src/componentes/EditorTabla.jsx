import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { clave } from '../lib/sincronizacion.js'

/**
 * Alta, edición, baja y búsqueda para una tabla del catálogo.
 *
 * columnas: [{ campo, etiqueta, tipo: 'texto' | 'numero' | 'select' | 'activo', opciones?: [{valor, etiqueta}] }]
 * nuevo:    valores iniciales de una fila nueva
 *
 * Lo que está en uso (por movimientos u otras tablas) no se puede borrar:
 * se desactiva, y deja de aparecer en los formularios sin tocar el historial.
 */
export default function EditorTabla({ tabla, columnas, orden, nuevo, ayuda, onCambio }) {
  const [filas, setFilas] = useState(null)
  const [editando, setEditando] = useState(null) // id de la fila, o 'nueva'
  const [borrador, setBorrador] = useState({})
  const [buscado, setBuscado] = useState('')
  const [error, setError] = useState('')

  // El orden llega como lista nueva en cada render: se compara como texto para no recargar de más.
  const ordenTexto = orden.join(',')
  const cargar = useCallback(async () => {
    let consulta = supabase.from(tabla).select('*')
    for (const campo of ordenTexto.split(',')) consulta = consulta.order(campo)
    const { data, error } = await consulta
    if (error) setError(error.message)
    setFilas(data ?? [])
  }, [tabla, ordenTexto])

  useEffect(() => { cargar() }, [cargar])

  function editar(fila) {
    setError('')
    setEditando(fila ? fila.id : 'nueva')
    setBorrador(fila ? { ...fila } : { ...nuevo })
  }

  function mensaje(error) {
    if (error.code === '23505') return 'Ya existe uno con ese nombre.'
    if (error.code === '23503') return 'Está en uso, no se puede borrar. Destildá "Activo" para que no aparezca más en los formularios.'
    return error.message
  }

  async function guardar(e) {
    e.preventDefault()
    const datos = Object.fromEntries(columnas.map((c) => {
      const v = borrador[c.campo]
      if (c.tipo === 'numero') return [c.campo, Number(v) || 0]
      if (c.tipo === 'select') return [c.campo, v === '' || v == null ? null : (typeof c.opciones[0]?.valor === 'number' ? Number(v) : v)]
      if (c.tipo === 'texto') return [c.campo, String(v ?? '').trim()]
      return [c.campo, v]
    }))
    const { error } = editando === 'nueva'
      ? await supabase.from(tabla).insert(datos)
      : await supabase.from(tabla).update(datos).eq('id', editando)
    if (error) return setError(mensaje(error))
    setEditando(null)
    await cargar()
    onCambio?.()
  }

  async function borrar() {
    if (!window.confirm('¿Borrar definitivamente?')) return
    const { error } = await supabase.from(tabla).delete().eq('id', editando)
    if (error) return setError(mensaje(error))
    setEditando(null)
    await cargar()
    onCambio?.()
  }

  function mostrar(columna, fila) {
    const v = fila[columna.campo]
    if (columna.tipo === 'select') return columna.opciones.find((o) => String(o.valor) === String(v))?.etiqueta ?? '—'
    return v
  }

  function campo(c) {
    const valor = borrador[c.campo] ?? ''
    const cambiar = (e) => setBorrador((b) => ({ ...b, [c.campo]: c.tipo === 'activo' ? e.target.checked : e.target.value }))
    if (c.tipo === 'activo') {
      return <label key={c.campo} className="opcion"><input type="checkbox" checked={Boolean(borrador.activo)} onChange={cambiar} /> Activo</label>
    }
    return (
      <label key={c.campo}>
        {c.etiqueta}
        {c.tipo === 'select' ? (
          <select value={valor ?? ''} onChange={cambiar} required={!c.opcional}>
            {c.opcional ? <option value="">—</option> : <option value="" disabled>Elegí…</option>}
            {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
        ) : (
          <input type={c.tipo === 'numero' ? 'number' : 'text'} value={valor} onChange={cambiar} required={c.tipo === 'texto'} />
        )}
      </label>
    )
  }

  const visibles = (filas ?? []).filter((f) => !buscado || clave(columnas.map((c) => mostrar(c, f)).join(' ')).includes(clave(buscado)))
  const resumen = columnas.filter((c) => c.tipo !== 'activo')

  const formulario = (
    <form className="editor-form" onSubmit={guardar}>
      <div className="editor-campos">{columnas.map(campo)}</div>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        {editando !== 'nueva' && <button type="button" className="peligro" onClick={borrar}>Borrar</button>}
        <button type="button" className="secundario" onClick={() => setEditando(null)}>Cancelar</button>
        <button type="submit">Guardar</button>
      </div>
    </form>
  )

  return (
    <div>
      {ayuda && <p className="vacio">{ayuda}</p>}
      <div className="filtros">
        <input className="editor-buscar" placeholder="Buscar…" value={buscado} onChange={(e) => setBuscado(e.target.value)} />
        <button type="button" onClick={() => editar(null)} disabled={editando !== null}>+ Agregar</button>
      </div>
      {editando === 'nueva' && <div className="tarjeta">{formulario}</div>}
      {filas === null ? <p>Cargando…</p> : (
        <ul className="editor-lista">
          {visibles.map((f) => (
            <li key={f.id} className={f.activo === false ? 'inactivo' : ''}>
              {editando === f.id ? formulario : (
                <button type="button" className="editor-fila" onClick={() => editar(f)} disabled={editando !== null}>
                  <strong>{mostrar(resumen[0], f)}</strong>
                  <small>
                    {resumen.slice(1).map((c) => `${c.etiqueta}: ${mostrar(c, f) ?? '—'}`).join(' · ')}
                    {f.activo === false && ' · inactivo'}
                  </small>
                </button>
              )}
            </li>
          ))}
          {visibles.length === 0 && <li className="vacio">Sin resultados.</li>}
        </ul>
      )}
    </div>
  )
}
