"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CONTABILIDAD_FECHA_PRESETS,
  fechaMx,
  guardarRango,
  leerRangoGuardado,
  rangoDePresetContabilidad,
  type ContabilidadFechaPreset,
  type RangoContabilidad,
} from "@/lib/contabilidad-fechas";

type Props = {
  pantalla: string;
  value?: RangoContabilidad;
  preset?: ContabilidadFechaPreset;
  onChange: (preset: ContabilidadFechaPreset, rango: RangoContabilidad) => void;
};

export function RangoFechasContabilidad({ pantalla, value, preset: presetProp, onChange }: Props) {
  const guardado = useMemo(() => leerRangoGuardado(pantalla), [pantalla]);
  const [preset, setPreset] = useState<ContabilidadFechaPreset>(
    presetProp ?? guardado?.preset ?? "este_mes",
  );
  const [rango, setRango] = useState<RangoContabilidad>(
    () =>
      value ??
      (guardado?.desde && guardado?.hasta
        ? { desde: guardado.desde, hasta: guardado.hasta }
        : rangoDePresetContabilidad(presetProp ?? guardado?.preset ?? "este_mes")),
  );

  useEffect(() => {
    if (presetProp && value) {
      setPreset(presetProp);
      setRango(value);
    }
  }, [presetProp, value]);

  function aplicar(p: ContabilidadFechaPreset, personalizado?: RangoContabilidad) {
    const next = p === "personalizado" && personalizado ? personalizado : rangoDePresetContabilidad(p, fechaMx());
    setPreset(p);
    setRango(next);
    guardarRango(pantalla, p, next);
    onChange(p, next);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <label style={{ fontSize: 13, color: "var(--text-secondary, #5b6272)" }}>Periodo</label>
      <select
        value={preset}
        onChange={(e) => aplicar(e.target.value as ContabilidadFechaPreset)}
        style={{ minHeight: 36, padding: "4px 8px" }}
      >
        {CONTABILIDAD_FECHA_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === "personalizado" ? (
        <>
          <input
            type="date"
            value={rango.desde}
            onChange={(e) => aplicar("personalizado", { ...rango, desde: e.target.value })}
            style={{ minHeight: 36 }}
          />
          <span>–</span>
          <input
            type="date"
            value={rango.hasta}
            onChange={(e) => aplicar("personalizado", { ...rango, hasta: e.target.value })}
            style={{ minHeight: 36 }}
          />
        </>
      ) : (
        <span style={{ fontSize: 13, color: "var(--text-tertiary, #8b93a7)" }}>
          {rango.desde} → {rango.hasta}
        </span>
      )}
    </div>
  );
}
