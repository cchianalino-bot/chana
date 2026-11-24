import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import EditorTabla from '../componentes/EditorTabla.jsx'

const TIPOS_GRUPO = [
  { valor: 'gasto', etiqueta: 'Gasto' },
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'inversion', etiqueta: 'Inversión' },
]

const TIPOS_MEDIO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta de crédito' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const PESTANAS = ['Grupos', 'Subgrupos', 'Medios de pago', 'Quién']

export default function Configuracion() {
  const [pestana, setPestana] = useState('Subgrupos')
  // Grupos y personas también son opciones de otras pestañas: se recargan cuando cambian.
  const [grupos, setGrupos] = useState([])
  const [personas, setPersonas] = useState([])

  const cargarOpciones = useCallback(() => {
    supabase.from('grupos').select('id, nombre').order('orden').then(({ data }) => setGrupos(data ?? []))
    supabase.from('personas').select('nombre').order('id').then(({ data }) => setPersonas(data ?? []))
  }, [])
  useEffect(() => { cargarOpciones() }, [cargarOpciones])

  return (
    <section>
      <div className="encabezado"><h2>Configuración</h2></div>
      <div className="pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={pestana === p}
            className={pestana === p ? 'activo' : ''} onClick={() => setPestana(p)}>{p}</button>
        ))}
      </div>

      {pestana === 'Grupos' && (
        <EditorTabla
          tabla="grupos"
          orden={['orden', 'nombre']}
          nuevo={{ nombre: '', tipo: 'gasto', orden: 99, activo: true }}
          onCambio={cargarOpciones}
          ayuda="El tipo define si el grupo suma como ingreso, gasto o inversión. El orden es el de las listas."
          columnas={[
            { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
            { campo: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS_GRUPO },
            { campo: 'orden', etiqueta: 'Orden', tipo: 'numero' },
            { campo: 'activo', tipo: 'activo' },
          ]}
        />
      )}

      {pestana === 'Subgrupos' && (
        <EditorTabla
          tabla="subgrupos"
          orden={['grupo_id', 'nombre']}
          nuevo={{ nombre: '', grupo_id: '', activo: true }}
          columnas={[
            { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
            { campo: 'grupo_id', etiqueta: 'Grupo', tipo: 'select', opciones: grupos.map((g) => ({ valor: g.id, etiqueta: g.nombre })) },
            { campo: 'activo', tipo: 'activo' },
          ]}
        />
      )}

      {pestana === 'Medios de pago' && (
        <EditorTabla
          tabla="medios_pago"
          orden={['id']}
          nuevo={{ nombre: '', tipo: 'tarjeta', titular: '', activo: true }}
          ayuda="Con tipo Tarjeta de crédito, el formulario ofrece cargar en cuotas."
          columnas={[
            { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
            { campo: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS_MEDIO },
            { campo: 'titular', etiqueta: 'Titular', tipo: 'select', opcional: true, opciones: personas.map((p) => ({ valor: p.nombre, etiqueta: p.nombre })) },
            { campo: 'activo', tipo: 'activo' },
          ]}
        />
      )}

      {pestana === 'Quién' && (
        <EditorTabla
          tabla="personas"
          orden={['id']}
          nuevo={{ nombre: '', activo: true }}
          onCambio={cargarOpciones}
          ayuda="Si cambiás un nombre, se actualiza en todos los movimientos."
          columnas={[
            { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
            { campo: 'activo', tipo: 'activo' },
          ]}
        />
      )}
    </section>
  )
}
