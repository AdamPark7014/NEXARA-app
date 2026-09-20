"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  MAX_LARGO_DESCRIPCION,
  MAX_REQUISITOS,
  PRESETS_HERRAMIENTAS,
  descripcionLibre,
  requisitoVacio,
  type ErroresRequisitos,
  type RequisitoBorrador,
} from "@/lib/herramientas-checklist";

type Props = {
  value: RequisitoBorrador[];
  onChange: (next: RequisitoBorrador[]) => void;
  /** Errores de la validación completa; `null` mientras no se intente guardar. */
  errores?: ErroresRequisitos | null;
  disabled?: boolean;
};

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  font: "inherit",
  fontSize: 14,
};

const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  minHeight: 36,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 650,
};

/**
 * Editor del checklist de herramientas: una fila por cosa que hay que llevar, con cuántas.
 * Controlado: el padre guarda la lista y decide cuándo mandarla a la API.
 */
export default function HerramientasChecklistEditor({
  value,
  onChange,
  errores,
  disabled = false,
}: Props) {
  const idBase = useId();
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const lleno = value.length >= MAX_REQUISITOS;

  useEffect(() => {
    if (!enfocar) return;
    const el = document.getElementById(`${idBase}-${enfocar}-desc`) as HTMLInputElement | null;
    el?.focus();
    setEnfocar(null);
  }, [enfocar, idBase]);

  const cambiar = (key: string, parcial: Partial<RequisitoBorrador>) =>
    onChange(value.map((f) => (f.key === key ? { ...f, ...parcial } : f)));

  const agregar = (fila: RequisitoBorrador, enfocarDescripcion: boolean) => {
    if (lleno) return;
    onChange([...value, fila]);
    if (enfocarDescripcion) setEnfocar(fila.key);
  };

  const quitar = (key: string) => onChange(value.filter((f) => f.key !== key));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text-secondary)" }}>Agregar rápido:</span>
        {PRESETS_HERRAMIENTAS.map((p) => (
          <button
            key={p.descripcion}
            type="button"
            style={{ ...chip, opacity: lleno || disabled ? 0.55 : 1 }}
            disabled={lleno || disabled}
            onClick={() =>
              agregar(
                requisitoVacio(
                  descripcionLibre(
                    p.descripcion,
                    value.map((f) => f.descripcion),
                  ),
                  p.cantidad,
                ),
                false,
              )
            }
          >
            <AddIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            {p.descripcion}
          </button>
        ))}
      </div>

      {value.length > 0 ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {value.map((fila, i) => {
            const descId = `${idBase}-${fila.key}-desc`;
            const cantId = `${idBase}-${fila.key}-cant`;
            const errorId = `${idBase}-${fila.key}-error`;
            const mensaje = errores?.porFila[fila.key] ?? null;
            const visible = fila.descripcion.trim() || `herramienta ${i + 1}`;
            return (
              <li
                key={fila.key}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 12,
                  borderRadius: 14,
                  border: `1px solid ${mensaje ? "color-mix(in srgb, var(--danger) 45%, var(--border))" : "var(--border)"}`,
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <label htmlFor={descId} style={{ display: "grid", gap: 4, flex: "1 1 220px", minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
                      Herramienta {i + 1}
                    </span>
                    <input
                      id={descId}
                      value={fila.descripcion}
                      maxLength={MAX_LARGO_DESCRIPCION}
                      placeholder="Ej. Escalera, Taladro con brocas"
                      disabled={disabled}
                      aria-invalid={Boolean(mensaje)}
                      aria-describedby={mensaje ? errorId : undefined}
                      onChange={(e) => cambiar(fila.key, { descripcion: e.target.value })}
                      style={input}
                    />
                  </label>
                  <label htmlFor={cantId} style={{ display: "grid", gap: 4, flex: "0 0 auto", width: 88 }}>
                    <span style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>Cantidad</span>
                    <input
                      id={cantId}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={Number.isFinite(fila.cantidad) ? fila.cantidad : ""}
                      aria-label={`Cantidad de ${visible}`}
                      disabled={disabled}
                      aria-invalid={Boolean(mensaje)}
                      onChange={(e) =>
                        cambiar(fila.key, { cantidad: e.target.value === "" ? Number.NaN : Number(e.target.value) })
                      }
                      style={{ ...input, textAlign: "center" }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => quitar(fila.key)}
                    disabled={disabled}
                    aria-label={`Quitar ${visible}`}
                    title="Quitar"
                    style={{
                      ...chip,
                      color: "var(--danger)",
                      borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))",
                    }}
                  >
                    <DeleteOutlineIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                    Quitar
                  </button>
                </div>
                {mensaje ? (
                  <p id={errorId} style={{ margin: 0, fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
                    {mensaje}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          style={{ ...chip, borderStyle: "dashed", opacity: lleno || disabled ? 0.55 : 1 }}
          disabled={lleno || disabled}
          onClick={() => agregar(requisitoVacio(), true)}
        >
          <AddIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          Agregar herramienta
        </button>
        {value.length > 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {value.length} de {MAX_REQUISITOS} herramientas
          </span>
        ) : null}
      </div>

      {errores?.general ? (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
          {errores.general}
        </p>
      ) : null}
    </div>
  );
}
