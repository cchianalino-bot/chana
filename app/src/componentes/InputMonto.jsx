import { useLayoutEffect, useRef } from 'react'
import { formatearMontoEscrito } from '../lib/formato.js'

/** Cuántos dígitos y comas hay antes de la posición `pos` (los puntos de miles no cuentan). */
function significativosAntes(texto, pos) {
  return texto.slice(0, pos).replace(/[^\d,]/g, '').length
}

/** Posición en `texto` justo después del carácter significativo número `n`. */
function posicionTras(texto, n) {
  if (n === 0) return 0
  let vistos = 0
  for (let i = 0; i < texto.length; i++) {
    if (/[\d,]/.test(texto[i]) && ++vistos === n) return i + 1
  }
  return texto.length
}

/**
 * Campo de monto que se formatea mientras se escribe (1.234.567,89) sin que el
 * cursor salte al final. Al tocarlo se selecciona todo, así lo que se escribe
 * reemplaza el monto anterior.
 */
export default function InputMonto({ value, onChange, ...props }) {
  const entrada = useRef(null)
  const cursor = useRef(null) // caracteres significativos antes del cursor tras el último cambio

  useLayoutEffect(() => {
    if (cursor.current === null || document.activeElement !== entrada.current) return
    const pos = posicionTras(value, cursor.current)
    entrada.current.setSelectionRange(pos, pos)
    cursor.current = null
  }, [value])

  function cambiar(e) {
    const crudo = e.target.value
    const formateado = formatearMontoEscrito(crudo, { limpiarCeros: false })
    // Al formatear se pueden perder caracteres (un 0 a la izquierda, un tercer decimal):
    // el cursor no puede quedar más allá de lo que sobrevivió.
    const significativos = formateado.replace(/[^\d,]/g, '').length
    cursor.current = Math.min(significativosAntes(crudo, e.target.selectionStart), significativos)
    onChange(formateado)
  }

  return (
    <input
      ref={entrada}
      className="monto-entrada"
      inputMode="decimal"
      placeholder="0,00"
      autoComplete="off"
      value={value}
      onChange={cambiar}
      // En el celular la selección hay que pedirla después de que el teclado aparece.
      onFocus={(e) => { const i = e.target; setTimeout(() => i.select(), 0) }}
      // Al salir del campo se limpian los ceros de la izquierda ("0.500" -> "500").
      onBlur={() => onChange(formatearMontoEscrito(value))}
      {...props}
    />
  )
}
