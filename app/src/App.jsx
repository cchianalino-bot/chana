import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { configurado, supabase } from './lib/supabase.js'
import { SesionProvider, useSesion } from './lib/sesion.jsx'
import Login from './paginas/Login.jsx'
import Inicio from './paginas/Inicio.jsx'
import Movimientos from './paginas/Movimientos.jsx'
import FormularioMovimiento from './paginas/FormularioMovimiento.jsx'
import Sincronizar from './paginas/Sincronizar.jsx'
import Configuracion from './paginas/Configuracion.jsx'
import PlazosFijos from './paginas/PlazosFijos.jsx'
import FormularioPlazoFijo from './paginas/FormularioPlazoFijo.jsx'
import { IconoAjustes, IconoMovimientos, IconoPlanilla, IconoPlazos, IconoResumen } from './componentes/Iconos.jsx'

function Aplicacion() {
  const { sesion, miembro } = useSesion()

  if (sesion === undefined) return <p className="centrado">Cargando…</p>
  if (!sesion) return <Login />
  if (!miembro) {
    return (
      <main className="login">
        <div className="tarjeta">
          <h1>Sin acceso</h1>
          <p>Tu usuario no está habilitado para usar la app.</p>
          <button type="button" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </main>
    )
  }

  return (
    <>
      <header className="cabecera">
        <strong>Finanzas</strong>
        {/* En el celular este menú pasa a ser una barra de pestañas abajo (ver index.css) */}
        <nav className="menu">
          <NavLink to="/" end><IconoResumen /><span>Resumen</span></NavLink>
          <NavLink to="/movimientos"><IconoMovimientos /><span>Movimientos</span></NavLink>
          <NavLink to="/plazos-fijos"><IconoPlazos /><span>Plazos</span></NavLink>
          <NavLink to="/sincronizar"><IconoPlanilla /><span>Planilla</span></NavLink>
          <NavLink to="/configuracion"><IconoAjustes /><span>Ajustes</span></NavLink>
        </nav>
        <button type="button" className="secundario" onClick={() => supabase.auth.signOut()}>
          Salir ({miembro})
        </button>
      </header>
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/movimientos" element={<Movimientos />} />
          <Route path="/movimientos/nuevo" element={<FormularioMovimiento />} />
          <Route path="/movimientos/:id" element={<FormularioMovimiento />} />
          <Route path="/sincronizar" element={<Sincronizar />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/plazos-fijos" element={<PlazosFijos />} />
          <Route path="/plazos-fijos/nuevo" element={<FormularioPlazoFijo />} />
          <Route path="/plazos-fijos/:id" element={<FormularioPlazoFijo />} />
          <Route path="/plazos-fijos/:id/renovar" element={<FormularioPlazoFijo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  if (!configurado) {
    return (
      <p className="centrado">
        Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver <code>.env.example</code>).
      </p>
    )
  }
  return (
    <BrowserRouter>
      <SesionProvider>
        <Aplicacion />
      </SesionProvider>
    </BrowserRouter>
  )
}
