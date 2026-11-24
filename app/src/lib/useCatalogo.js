import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

/** Grupos, subgrupos y medios de pago activos, para los formularios y filtros. */
export function useCatalogo() {
  const [catalogo, setCatalogo] = useState({ grupos: [], subgrupos: [], medios: [], cargando: true })

  useEffect(() => {
    Promise.all([
      supabase.from('grupos').select('id, nombre, tipo, orden').eq('activo', true).order('orden'),
      supabase.from('subgrupos').select('id, nombre, grupo_id').eq('activo', true).order('nombre'),
      supabase.from('medios_pago').select('id, nombre, tipo').eq('activo', true).order('id'),
    ]).then(([grupos, subgrupos, medios]) => {
      setCatalogo({
        grupos: grupos.data ?? [],
        subgrupos: subgrupos.data ?? [],
        medios: medios.data ?? [],
        cargando: false,
        error: grupos.error || subgrupos.error || medios.error,
      })
    })
  }, [])

  return catalogo
}
