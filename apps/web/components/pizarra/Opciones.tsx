"use client";

import type { ReactNode } from "react";
import CheckIcon from "@mui/icons-material/Check";
import { Avatar } from "@/components/base";
import o from "./Opciones.module.css";

/**
 * Piezas de elección para asignar y auto-asignarse (sistema visual v2).
 *
 * `OpcionTarjeta`: tarjeta seleccionable (tipo de actividad, encargo) con icono,
 * título y ayuda; es un botón con `aria-pressed`, marca de elegida y foco de marca.
 * `OpcionPersona`: pastilla con foto para sumar gente al equipo.
 * `RejillaOpciones`: rejilla que se acomoda sola (`min` = ancho mínimo de la tarjeta).
 *
 * No hay equivalente en `components/base` (el `Segmented` es para 2-4 textos cortos):
 * si otro módulo la necesita, conviene subirla a la base.
 */
export function OpcionTarjeta({
  selected,
  onClick,
  icon,
  title,
  help,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={o.tarjeta}
      aria-pressed={selected}
      data-selected={selected ? "true" : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {icon ? <span className={o.icono}>{icon}</span> : null}
      <span className={o.titulo}>{title}</span>
      {help ? <span className={o.ayuda}>{help}</span> : null}
      <span className={o.marca} aria-hidden="true">
        <CheckIcon />
      </span>
    </button>
  );
}

export function RejillaOpciones({
  children,
  min = 150,
  ariaLabel,
}: {
  children: ReactNode;
  /** Ancho mínimo de cada tarjeta, en px (150 tipos · 220 encargos). */
  min?: 150 | 220;
  ariaLabel?: string;
}) {
  return (
    <div className={o.rejilla} data-min={min} role={ariaLabel ? "group" : undefined} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function OpcionPersona({
  selected,
  onClick,
  nombre,
  nombreCorto,
  avatarUrl,
}: {
  selected: boolean;
  onClick: () => void;
  nombre: string;
  nombreCorto: string;
  avatarUrl?: string | null;
}) {
  return (
    <button
      type="button"
      className={o.persona}
      aria-pressed={selected}
      data-selected={selected ? "true" : undefined}
      onClick={onClick}
      title={nombre}
    >
      <Avatar name={nombre} avatarUrl={avatarUrl} size={28} />
      <span className={o.personaNombre}>{nombreCorto}</span>
      <span className={o.personaMarca} aria-hidden="true">
        <CheckIcon />
      </span>
    </button>
  );
}
