"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  MAX_CAMPOS,
  MAX_LARGO_NOMBRE,
  MAX_LARGO_NOTAS,
  MOMENTOS,
  MOMENTO_LABEL,
  PRESETS_CAMPOS,
  campoVacio,
  nombreLibre,
  ordenarMomentos,
  type CampoBorrador,
  type ErroresCampos,
  type Momento,
} from "@/lib/evidencia-campos";

type Props = {
  value: CampoBorrador[];
  onChange: (next: CampoBorrador[]) => void;
  /** Errores de la validación completa; `null` mientras no se intente guardar. */
  errores?: ErroresCampos | null;
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

function toggle(on: boolean): CSSProperties {
  return {
    ...chip,
    border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)",
    background: on ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
    color: on ? "var(--primary)" : "var(--text-secondary)",
  };
}

/**
 * Editor de «qué hay que fotografiar»: una fila por cosa (Cámara 1, Rack…) con los momentos
 * en que se pide foto. Controlado: el padre guarda la lista y decide cuándo mandarla.
 */
export default function EvidenciaCamposEditor({ value, onChange, errores, disabled = false }: Props) {
  const idBase = useId();
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const lleno = value.length >= MAX_CAMPOS;

  useEffect(() => {
    if (!enfocar) return;
    const el = document.getElementById(`${idBase}-${enfocar}-nombre`) as HTMLInputElement | null;
    el?.focus();
    setEnfocar(null);
  }, [enfocar, idBase]);

  const cambiar = (key: string, parcial: Partial<CampoBorrador>) =>
    onChange(value.map((f) => (f.key === key ? { ...f, ...parcial } : f)));

  const alternarMomento = (fila: CampoBorrador, momento: Momento) => {
    const tiene = fila.momentos.includes(momento);
    cambiar(fila.key, {
      momentos: ordenarMomentos(tiene ? fila.momentos.filter((m) => m !== momento) : [...fila.momentos, momento]),
    });
  };

  const agregar = (fila: CampoBorrador, enfocarNombre: boolean) => {
    if (lleno) return;
    onChange([...value, fila]);
    if (enfocarNombre) setEnfocar(fila.key);
  };

  const quitar = (key: string) => onChange(value.filter((f) => f.key !== key));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text-secondary)" }}>Agregar rápido:</span>
        {PRESETS_CAMPOS.map((p) => (
          <button
            key={p.nombre}
            type="button"
            style={{ ...chip, opacity: lleno || disabled ? 0.55 : 1 }}
            disabled={lleno || disabled}
            onClick={() =>
              agregar(
                campoVacio(
                  nombreLibre(
                    p.nombre,
                    value.map((f) => f.nombre),
                    p.numerar,
                  ),
                  p.momentos,
                ),
                false,
              )
            }
          >
            <AddIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            {p.nombre}
          </button>
        ))}
      </div>

      {value.length > 0 ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {value.map((fila, i) => {
            const nombreId = `${idBase}-${fila.key}-nombre`;
            const errorId = `${idBase}-${fila.key}-error`;
            const mensaje =
              errores?.porFila[fila.key] ??
              (fila.momentos.length === 0 ? "Elige al menos un momento: antes, en progreso o después." : null);
            const nombreVisible = fila.nombre.trim() || `punto ${i + 1}`;
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
                  <label htmlFor={nombreId} style={{ display: "grid", gap: 4, flex: "1 1 220px", minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
                      Punto {i + 1} · Qué fotografiar
                    </span>
                    <input
                      id={nombreId}
                      value={fila.nombre}
                      maxLength={MAX_LARGO_NOMBRE}
                      placeholder="Ej. Cámara 1, Rack, Canalización"
                      disabled={disabled}
                      aria-invalid={Boolean(mensaje)}
                      aria-describedby={mensaje ? errorId : undefined}
                      onChange={(e) => cambiar(fila.key, { nombre: e.target.value })}
                      style={input}
                    />
                  </label>
                  <div
                    role="group"
                    aria-label={`Momentos en que se pide foto de ${nombreVisible}`}
                    style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                  >
                    {MOMENTOS.map((m) => {
                      const on = fila.momentos.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={on}
                          disabled={disabled}
                          onClick={() => alternarMomento(fila, m)}
                          style={toggle(on)}
                        >
                          {on ? <CheckIcon aria-hidden="true" sx={{ fontSize: 16 }} /> : null}
                          {MOMENTO_LABEL[m]}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => quitar(fila.key)}
                    disabled={disabled}
                    aria-label={`Quitar ${nombreVisible}`}
                    title="Quitar"
                    style={{ ...chip, color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))" }}
                  >
                    <DeleteOutlineIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                    Quitar
                  </button>
                </div>
                <input
                  value={fila.notas}
                  maxLength={MAX_LARGO_NOTAS}
                  placeholder="Nota para quien toma la foto (opcional). Ej. que se vea la etiqueta"
                  aria-label={`Nota para la foto de ${nombreVisible} (opcional)`}
                  disabled={disabled}
                  onChange={(e) => cambiar(fila.key, { notas: e.target.value })}
                  style={{ ...input, fontSize: 13, minHeight: 36, padding: "7px 12px" }}
                />
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
          onClick={() => agregar(campoVacio(), true)}
        >
          <AddIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          Agregar punto
        </button>
        {value.length > 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {value.length} de {MAX_CAMPOS} puntos
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
