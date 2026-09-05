"use client";

import { useId } from "react";
import a from "./_access.module.css";

/**
 * Conmutador de módulo del sitio.
 *
 * Antes eran botones con `opacity: .35` y texto tachado: no se leía si el
 * módulo estaba activo o solo deshabilitado, y esa opacidad dejaba la
 * etiqueta por debajo del contraste mínimo AA. Ahora es un `role="switch"`
 * de verdad: el lector de pantalla anuncia el estado, el carril lo muestra
 * de un vistazo y el texto conserva su color a plena tinta.
 */
export function ModuleSwitch({
  label,
  checked,
  disabled,
  /** Motivo por el que no se puede tocar (p. ej. módulo solo Artemis). */
  lockedReason,
  lockedTag,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  lockedReason?: string;
  lockedTag?: string;
  onToggle: () => void;
}) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={lockedTag ? hintId : undefined}
      disabled={disabled}
      className={a.switch}
      onClick={onToggle}
      title={lockedReason}
    >
      <span className={a.switchTrack} aria-hidden>
        <span className={a.switchThumb} />
      </span>
      <span className={a.switchLabel}>{label}</span>
      {lockedTag ? (
        <span className={a.switchTag} id={hintId}>
          {lockedTag}
        </span>
      ) : (
        <span className={a.switchState} aria-hidden>
          {checked ? "Visible" : "Oculto"}
        </span>
      )}
    </button>
  );
}
