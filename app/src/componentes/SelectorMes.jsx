import { nombreMes, sumarMeses } from '../lib/formato.js'

/** Flechas para moverse de mes en mes. `mes` es 'AAAA-MM-01'. */
export default function SelectorMes({ mes, onChange }) {
  return (
    <div className="selector-mes">
      <button type="button" className="secundario" onClick={() => onChange(sumarMeses(mes, -1))} aria-label="Mes anterior">‹</button>
      <span>{nombreMes(mes)}</span>
      <button type="button" className="secundario" onClick={() => onChange(sumarMeses(mes, 1))} aria-label="Mes siguiente">›</button>
    </div>
  )
}
