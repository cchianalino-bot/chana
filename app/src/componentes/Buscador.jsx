import { useId, useMemo, useRef, useState } from 'react'
import { clave } from '../lib/sincronizacion.js'

/**
 * Select con búsqueda: se escribe parte del nombre y se elige de la lista
 * filtrada (sin importar mayúsculas ni tildes). Con el teclado: flechas para
 * moverse, Enter para elegir, Escape para cerrar.
 *
 * opciones: [{ valor, etiqueta, detalle? }]  (detalle se muestra al costado y también se busca)
 */
export default function Buscador({ opciones, valor, onChange, placeholder = 'Buscar…', requerido, deshabilitado, id }) {
  const idLista = useId()
  const entrada = useRef(null)
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)

  const elegida = opciones.find((o) => String(o.valor) === String(valor))
  const filtradas = useMemo(() => {
    const buscado = clave(texto)
    if (!buscado) return opciones
    return opciones.filter((o) => clave(`${o.etiqueta} ${o.detalle ?? ''}`).includes(buscado))
  }, [opciones, texto])

  function abrir() {
    setTexto('')
    setActivo(0)
    setAbierto(true)
  }

  function elegir(opcion) {
    onChange(opcion.valor)
    setAbierto(false)
    entrada.current?.blur()
  }

  function teclado(e) {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      return abrir()
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i) => Math.min(i + 1, filtradas.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtradas[activo]) { e.preventDefault(); elegir(filtradas[activo]) }
    if (e.key === 'Escape') setAbierto(false)
  }

  const mostrado = abierto ? texto : elegida ? `${elegida.etiqueta}${elegida.detalle ? ` · ${elegida.detalle}` : ''}` : ''

  return (
    <div className="buscador">
      <input
        id={id}
        ref={entrada}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        value={mostrado}
        placeholder={elegida && abierto ? `${elegida.etiqueta} — escribí para buscar` : placeholder}
        onFocus={abrir}
        onClick={() => !abierto && abrir()}
        onBlur={() => setAbierto(false)}
        onChange={(e) => { setTexto(e.target.value); setActivo(0); setAbierto(true) }}
        onKeyDown={teclado}
        disabled={deshabilitado}
        // El formulario no se envía si es obligatorio y no se eligió nada.
        required={requerido && !elegida}
      />
      {abierto && (
        <ul id={idLista} role="listbox" className="buscador-lista">
          {filtradas.length === 0 && <li className="vacio">Sin resultados</li>}
          {filtradas.map((o, i) => (
            <li
              key={o.valor}
              role="option"
              aria-selected={i === activo}
              className={i === activo ? 'activa' : ''}
              // mousedown (y no click) para elegir antes de que el input pierda el foco
              onMouseDown={(e) => { e.preventDefault(); elegir(o) }}
              onMouseEnter={() => setActivo(i)}
            >
              <span>{o.etiqueta}</span>
              {o.detalle && <small>{o.detalle}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
