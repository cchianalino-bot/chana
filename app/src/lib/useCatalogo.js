import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const PERSONAS_INICIALES = [{ id: 1, nombre: 'Meli' }, { id: 2, nombre: 'Carli' }, { id: 3, nombre: 'Ambos' }]

/** Grupos, subgrupos, medios de pago y personas activos, para los formularios y filtros. */
export function useCatalogo() {
  const [catalogo, setCatalogo] = useState({ grupos: [], subgrupos: [], medios: [], personas: [], cargando: true })

  useEffect(() => {
    Promise.all([
      supabase.from('grupos').select('id, nombre, tipo, orden').eq('activo', true).order('orden'),
      supabase.from('subgrupos').select('id, nombre, grupo_id').eq('activo', true).order('nombre'),
      supabase.from('medios_pago').select('id, nombre, tipo').eq('activo', true).order('id'),
      supabase.from('personas').select('id, nombre').eq('activo', true).order('id'),
    ]).then(([grupos, subgrupos, medios, personas]) => {
      setCatalogo({
        grupos: grupos.data ?? [],
        subgrupos: subgrupos.data ?? [],
        medios: medios.data ?? [],
        // Hasta que se corra la migración de personas, se usan los nombres de siempre.
        personas: personas.error ? PERSONAS_INICIALES : personas.data,
        cargando: false,
        error: grupos.error || subgrupos.error || medios.error,
      })
    })
  }, [])

  return catalogo
}
