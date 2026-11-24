import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function ingresar(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
    if (error) setError('El mail o la contraseña no son correctos.')
    setEnviando(false)
  }

  return (
    <main className="login">
      <form className="tarjeta" onSubmit={ingresar}>
        <h1>Finanzas familiares</h1>
        <label>
          Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Contraseña
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </main>
  )
}
