"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import Button from "@/components/ui/Button";
import {
  EXCEL_FECHA_PRESETS,
  fechaMx,
  guardarColumnasPreferidas,
  leerColumnasPreferidas,
  rangoDePresetExcel,
  filtrarPorRangoFecha,
  type ExcelColumnaElegible,
  type ExcelFechaPreset,
  type RangoExcel,
} from "@/lib/excel-rangos";
import { exportToExcelAsync as exportToExcel, type ExcelColumn } from "@/lib/export-excel";
import { formatApiError } from "@/lib/erp-api";

type Props<T extends object> = {
  /** Clave de preferencias de columnas (localStorage). */
  preferenciaKey: string;
  titulo: string;
  filename: string;
  rows: T[];
  columns: Array<ExcelColumn<T> & { defaultOn?: boolean }>;
  /** Extrae fecha ISO del renglón para el filtro de rango. */
  getFecha: (row: T) => string | null | undefined;
  /** Filtro opcional por estado (clave en el row). */
  estadoKey?: keyof T;
  estados?: Array<{ value: string; label: string }>;
  /** Filtro opcional por persona/área (texto libre). */
  getPersonaArea?: (row: T) => string;
  generadoPor?: string | null;
  disabled?: boolean;
};

export default function ExcelExportadorDinamico<T extends object>({
  preferenciaKey,
  titulo,
  filename,
  rows,
  columns,
  getFecha,
  estadoKey,
  estados,
  getPersonaArea,
  generadoPor,
  disabled,
}: Props<T>) {
  const { user } = useUser();
  const storageKey = `${preferenciaKey}:usuario-${user?.id ?? 'anonimo'}`;
  const elegibles: ExcelColumnaElegible[] = columns.map((c) => ({
    key: String(c.key),
    label: c.label,
    defaultOn: c.defaultOn,
  }));
  const [abierto, setAbierto] = useState(false);
  const [preset, setPreset] = useState<ExcelFechaPreset>("todos");
  const [rango, setRango] = useState<RangoExcel>(() => rangoDePresetExcel("todos"));
  const [estado, setEstado] = useState("");
  const [persona, setPersona] = useState("");
  const [colsOn, setColsOn] = useState<string[]>(() =>
    leerColumnasPreferidas(storageKey, elegibles),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rangoInvalido = Boolean(rango.desde && rango.hasta && rango.desde > rango.hasta);
  useEffect(() => {
    setColsOn(leerColumnasPreferidas(storageKey, elegibles));
    // Los cambios de sesión deben recuperar sus propias columnas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const filtradas = useMemo(() => {
    let list = filtrarPorRangoFecha(rows, getFecha, rango);
    if (estadoKey && estado) {
      list = list.filter((r) => String(r[estadoKey] ?? "") === estado);
    }
    if (persona.trim() && getPersonaArea) {
      const q = persona.trim().toLowerCase();
      list = list.filter((r) => getPersonaArea(r).toLowerCase().includes(q));
    }
    return list;
  }, [rows, getFecha, rango, estadoKey, estado, persona, getPersonaArea]);

  const onPreset = (id: ExcelFechaPreset) => {
    setPreset(id);
    if (id !== "personalizado") setRango(rangoDePresetExcel(id));
  };

  const toggleCol = (key: string) => {
    setColsOn((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (!next.length) return prev;
      guardarColumnasPreferidas(storageKey, next);
      return next.length ? next : prev;
    });
  };

  const descargar = async () => {
    if (busy || disabled || rangoInvalido) return;
    setBusy(true);
    setError(null);
    try {
      const cols = columns.filter((c) => colsOn.includes(String(c.key)));
      if (!cols.length) return;
      const labelPreset =
        EXCEL_FECHA_PRESETS.find((p) => p.id === preset)?.label ?? preset;
      await exportToExcel(filtradas, cols, filename, {
        title: titulo,
        subtitle: preset === 'todos' ? labelPreset : `${labelPreset}: ${rango.desde} → ${rango.hasta}`,
        filtros: [
          { etiqueta: "Periodo", valor: preset === 'todos' ? 'Todos los registros filtrados' : `${rango.desde} – ${rango.hasta}` },
          ...(estado ? [{ etiqueta: "Estado", valor: estado }] : []),
          ...(persona.trim() ? [{ etiqueta: "Persona/área", valor: persona.trim() }] : []),
        ],
        generadoPor: generadoPor ?? null,
      });
      setAbierto(false);
    } catch (e) {
      setError(formatApiError(e, 'No se pudo generar el Excel. Vuelve a intentarlo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || busy}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? "Cerrar Excel" : "Exportar Excel"}
      </Button>
      {abierto ? (
        <div
          role="dialog"
          aria-label="Exportar Excel"
          style={{
            border: "1px solid var(--ui-border)",
            borderRadius: 12,
            padding: 12,
            background: "var(--ui-elev-1)",
            display: "grid",
            gap: 10,
            minWidth: "min(360px, 92vw)",
            maxWidth: 520,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EXCEL_FECHA_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p.id)}
                style={{
                  minHeight: 36,
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: preset === p.id ? "1px solid var(--ui-primary)" : "1px solid var(--ui-border)",
                  background: preset === p.id ? "var(--ui-primary)" : "var(--ui-bg)",
                  color: preset === p.id ? "#fff" : "var(--ui-fg)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Desde
              <input
                type="date"
                value={rango.desde}
                onChange={(e) => {
                  setPreset("personalizado");
                  setRango((r) => ({ ...r, desde: e.target.value || fechaMx() }));
                }}
                style={{ minHeight: 40, fontSize: 16, padding: 6 }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Hasta
              <input
                type="date"
                value={rango.hasta}
                onChange={(e) => {
                  setPreset("personalizado");
                  setRango((r) => ({ ...r, hasta: e.target.value || fechaMx() }));
                }}
                style={{ minHeight: 40, fontSize: 16, padding: 6 }}
              />
            </label>
          </div>
          {estados?.length && estadoKey ? (
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Estado
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                style={{ minHeight: 40, fontSize: 16 }}
              >
                <option value="">Todos</option>
                {estados.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {getPersonaArea ? (
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Persona o área
              <input
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Filtrar por nombre o área"
                style={{ minHeight: 40, fontSize: 16, padding: 8 }}
              />
            </label>
          ) : null}
          <fieldset style={{ border: "1px solid var(--ui-border)", borderRadius: 8, padding: 8, margin: 0 }}>
            <legend style={{ fontSize: 13, padding: "0 4px" }}>Columnas</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {elegibles.map((c) => (
                <label key={c.key} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={colsOn.includes(c.key)}
                    onChange={() => toggleCol(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ui-fg-2)" }}>
            {filtradas.length} fila{filtradas.length === 1 ? "" : "s"} con los filtros actuales
          </p>
          {rangoInvalido ? <p role="alert">La fecha de inicio debe ser anterior o igual a la fecha final.</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <Button type="button" variant="primary" size="sm" disabled={disabled || busy || rangoInvalido || !filtradas.length || !colsOn.length} onClick={() => void descargar()}>
            {busy ? "Generando…" : "Descargar .xlsx"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

