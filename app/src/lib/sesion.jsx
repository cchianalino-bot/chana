import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const SesionContext = createContext(null)

/**
 * Mantiene la sesión de Supabase y el nombre del miembro (Meli o Carli)
 * que está usando la app. `miembro` queda en null si el usuario inició
 * sesión pero no fue dado de alta en la tabla miembros.
 */
export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(undefined) // undefined = todavía cargando
  const [miembro, setMiembro] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSesion(nueva))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sesion) {
      setMiembro(null)
      return
    }
    supabase
      .from('miembros')
      .select('nombre')
      .eq('user_id', sesion.user.id)
      .maybeSingle()
      .then(({ data }) => setMiembro(data?.nombre ?? null))
  }, [sesion])

  return (
    <SesionContext.Provider value={{ sesion, miembro }}>
      {children}
    </SesionContext.Provider>
  )
}

export function useSesion() {
  return useContext(SesionContext)
}
