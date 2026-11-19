"use client";

import { Input } from "@/components/base";
import { completarHora24, teclearHora24 } from "@/lib/ops-activity-form";

/**
 * Hora en 24 h («14:30»), igual en cualquier navegador. El `<input type="time">` de Chrome en español
 * sale en 12 h con «a. m.» marcado y se guardaban actividades de la tarde como de madrugada (18-11-2026).
 */
export default function HoraInput24({
  id,
  value,
  onChange,
  required,
  placeholder = "HH:MM",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (hora: string) => void;
  required?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder={placeholder}
      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      title="Hora en formato de 24 horas, por ejemplo 14:30"
      aria-label={ariaLabel}
      required={required}
      value={value}
      onChange={(e) => onChange(teclearHora24(e.target.value))}
      onBlur={(e) => onChange(completarHora24(e.target.value))}
    />
  );
}
