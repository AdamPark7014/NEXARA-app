"use client";

import { useRef, type KeyboardEvent } from "react";
import { normalizarPrioridad } from "@/lib/actividad-tiempos";
import s from "./PrioritySemaforo.module.css";

/**
 * Prioridad normalizada del contrato: se guarda ALTA | MEDIA | BAJA y se muestra
 * Alta / Media / Baja. Un valor viejo («urgente», «P1») queda marcado igual.
 *
 * `color` se conserva para quien lo lea fuera de aquí; el control pinta el punto
 * con los tokens del tema (`TONO`), que sí cambian en modo oscuro.
 */
export const PRIORIDAD_SEMAFORO = [
  { value: "BAJA", label: "Baja", color: "#22c55e", hint: "Puede esperar" },
  { value: "MEDIA", label: "Media", color: "#eab308", hint: "Esta semana" },
  { value: "ALTA", label: "Alta", color: "#ef4444", hint: "Urgente" },
] as const;

type PrioridadValor = (typeof PRIORIDAD_SEMAFORO)[number]["value"];

/** Tono del punto de cada prioridad (se resuelve a --ui-success / --ui-warning / --ui-danger). */
const TONO: Record<PrioridadValor, "success" | "warning" | "danger"> = {
  BAJA: "success",
  MEDIA: "warning",
  ALTA: "danger",
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Allow empty (edit screens). */
  allowEmpty?: boolean;
  compact?: boolean;
};

type Opcion = { value: string; label: string; hint?: string; tone: "neutral" | "success" | "warning" | "danger" };

export default function PrioritySemaforo({ value, onChange, allowEmpty = false, compact = false }: Props) {
  // Lo guardado puede venir en texto viejo: se marca la opción equivalente.
  const seleccion = value ? normalizarPrioridad(value) : "";
  const pista = useRef<HTMLDivElement | null>(null);

  const opciones: Opcion[] = [
    ...(allowEmpty ? [{ value: "", label: "Sin definir", tone: "neutral" as const }] : []),
    ...PRIORIDAD_SEMAFORO.map((p) => ({ value: p.value, label: p.label, hint: p.hint, tone: TONO[p.value] })),
  ];
  const marcada = (o: Opcion) => (o.value === "" ? !value : seleccion === o.value);
  // Patrón de grupo de radios: una sola parada de Tab (la marcada, o la primera).
  const indiceFoco = Math.max(0, opciones.findIndex(marcada));

  const conFlechas = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const siguiente = (i + paso + opciones.length) % opciones.length;
    onChange(opciones[siguiente].value);
    pista.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[siguiente]?.focus();
  };

  return (
    <div className={s.wrap} data-compact={compact ? "true" : undefined} role="radiogroup" aria-label="Prioridad">
      <div className={s.label}>Prioridad</div>
      <div className={s.track} ref={pista}>
        {opciones.map((o, i) => {
          const on = marcada(o);
          return (
            <button
              key={o.value || "sin-definir"}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === indiceFoco ? 0 : -1}
              title={o.hint}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => conFlechas(e, i)}
              className={s.option}
            >
              <span className={s.dot} data-tone={o.tone} aria-hidden="true" />
              <span className={s.text}>
                <span className={s.optionLabel}>{o.label}</span>
                {!compact && o.hint ? <span className={s.hint}>{o.hint}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
