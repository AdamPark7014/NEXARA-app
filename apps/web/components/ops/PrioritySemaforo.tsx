"use client";

import type { CSSProperties } from "react";
import { normalizarPrioridad } from "@/lib/actividad-tiempos";

/**
 * Prioridad normalizada del contrato: se guarda ALTA | MEDIA | BAJA y se muestra
 * Alta / Media / Baja. Un valor viejo («urgente», «P1») queda marcado igual.
 */
export const PRIORIDAD_SEMAFORO = [
  { value: "BAJA", label: "Baja", color: "#22c55e", hint: "Puede esperar" },
  { value: "MEDIA", label: "Media", color: "#eab308", hint: "Esta semana" },
  { value: "ALTA", label: "Alta", color: "#ef4444", hint: "Urgente" },
] as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Allow empty (edit screens). */
  allowEmpty?: boolean;
  compact?: boolean;
};

export default function PrioritySemaforo({ value, onChange, allowEmpty = false, compact = false }: Props) {
  // Lo guardado puede venir en texto viejo: se marca la opción equivalente.
  const seleccion = value ? normalizarPrioridad(value) : "";
  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: compact ? 6 : 8,
    gridColumn: compact ? undefined : "1 / -1",
  };

  return (
    <div style={wrap} role="radiogroup" aria-label="Prioridad">
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-secondary)",
          letterSpacing: "0.02em",
        }}
      >
        Prioridad
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {allowEmpty ? (
          <button
            type="button"
            role="radio"
            aria-checked={!value}
            onClick={() => onChange("")}
            style={chipStyle(!value, "#94a3b8")}
          >
            <span style={dotStyle("#94a3b8", !value)} />
            Sin definir
          </button>
        ) : null}
        {PRIORIDAD_SEMAFORO.map((p) => {
          const on = seleccion === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={p.hint}
              onClick={() => onChange(p.value)}
              style={chipStyle(on, p.color)}
            >
              <span style={dotStyle(p.color, on)} />
              <span>
                <strong style={{ fontWeight: 750 }}>{p.label}</strong>
                {!compact ? (
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 500,
                      opacity: 0.85,
                      marginTop: 1,
                    }}
                  >
                    {p.hint}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function chipStyle(on: boolean, color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 14,
    border: on ? `2px solid ${color}` : "1px solid var(--border)",
    background: on ? `color-mix(in srgb, ${color} 14%, var(--surface))` : "var(--surface)",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "inherit",
    fontSize: 13,
    textAlign: "left",
    boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` : "none",
    transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
  };
}

function dotStyle(color: string, on: boolean): CSSProperties {
  return {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: color,
    boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${color} 35%, transparent)` : `inset 0 0 0 1px rgba(0,0,0,0.08)`,
    flexShrink: 0,
  };
}
