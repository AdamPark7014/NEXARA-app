"use client";

import { ultimosPasos } from "@/lib/cctv/historialEtiquetas";
import type { Plano } from "@/lib/cctv/plano";
import {
  ETIQUETA_CAPA,
  type CapasEditor,
  type IdCapa,
} from "@/lib/cctv/seleccionMultiple";
import styles from "./editor.module.css";

export function HistorialVisible({
  pasado,
  actual,
  etiquetasPasado,
  onVolver,
}: {
  pasado: Plano[];
  actual: Plano;
  etiquetasPasado: (string | null)[];
  onVolver: (indicePasado: number) => void;
}) {
  const pasos = ultimosPasos(pasado, actual, 8, etiquetasPasado);
  if (!pasos.length) return null;
  return (
    <div className={styles.historialVisible} role="list" aria-label="Historial">
      <b style={{ fontSize: 12, color: "var(--ui-fg-3)", padding: "0 8px" }}>Historial</b>
      {pasos.map((paso) => (
        <button key={`${paso.indicePasado}-${paso.etiqueta}`} type="button" role="listitem" onClick={() => onVolver(paso.indicePasado)}>
          {paso.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function CapasBloqueoPanel({
  capas,
  onChange,
}: {
  capas: CapasEditor;
  onChange: (c: CapasEditor) => void;
}) {
  return (
    <div className={styles.capasBloqueo} role="group" aria-label="Capas con bloqueo">
      {(Object.keys(ETIQUETA_CAPA) as IdCapa[]).map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={capas[id].visible}
            aria-label={`Ver ${ETIQUETA_CAPA[id]}`}
            onChange={(ev) => onChange({ ...capas, [id]: { ...capas[id], visible: ev.target.checked } })}
          />
          <span style={{ flex: 1 }}>{ETIQUETA_CAPA[id]}</span>
          <button
            type="button"
            aria-pressed={capas[id].bloqueada}
            aria-label={capas[id].bloqueada ? `Desbloquear ${ETIQUETA_CAPA[id]}` : `Bloquear ${ETIQUETA_CAPA[id]}`}
            onClick={() => onChange({ ...capas, [id]: { ...capas[id], bloqueada: !capas[id].bloqueada } })}
          >
            {capas[id].bloqueada ? "Bloqueada" : "Libre"}
          </button>
        </label>
      ))}
    </div>
  );
}
