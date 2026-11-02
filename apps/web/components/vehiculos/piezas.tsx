"use client";

/** Piezas de las pantallas de vehículos. La banda y las tarjetas son las de Costos. */

import type { ReactNode } from "react";
import { c } from "@/components/costos/piezas";
import { aNumero, etiquetaFuente, type Fuente, type PlanEditable } from "@/lib/vehiculos-ficha";
import v from "./vehiculos.module.scss";

export { c, v };

/** Una cifra de la banda. */
export function KpiBanda({ cifra, texto, tono }: { cifra: ReactNode; texto: ReactNode; tono?: "ok" | "atencion" | "mal" }) {
  return (
    <article className={c.kpi} data-tone={tono}>
      <b>{cifra}</b>
      <span>{texto}</span>
    </article>
  );
}

export function Pastilla({ tono, children }: { tono?: string; children: ReactNode }) {
  return (
    <span className={v.pastilla} data-tono={tono}>
      {children}
    </span>
  );
}

/** De dónde salió un dato. Sin esto, la ficha es de fe. */
export function PastillaFuente({ fuente }: { fuente: Fuente | null | undefined }) {
  const { texto, tono } = etiquetaFuente(fuente);
  return <Pastilla tono={tono}>{texto}</Pastilla>;
}

/** Un renglón editable del programa de servicio: en la revisión de la ficha y en el estándar. */
export function FilaPrograma({
  fila,
  onCambio,
  onQuitar,
  etiqueta,
}: {
  fila: PlanEditable;
  onCambio: (cambio: Partial<PlanEditable>) => void;
  onQuitar: () => void;
  etiqueta?: ReactNode;
}) {
  return (
    <div className={v.filaServicio}>
      <input aria-label="Qué toca" value={fila.concepto} placeholder="Aceite y filtro" onChange={(e) => onCambio({ concepto: e.target.value })} />
      <span className={v.conUnidad}>
        <input aria-label="Cada cuántos km" inputMode="numeric" value={fila.cadaKm ?? ""} onChange={(e) => onCambio({ cadaKm: aNumero(e.target.value) })} />
        <span aria-hidden="true">km</span>
      </span>
      <span className={v.conUnidad}>
        <input aria-label="Cada cuántos meses" inputMode="numeric" value={fila.cadaMeses ?? ""} onChange={(e) => onCambio({ cadaMeses: aNumero(e.target.value) })} />
        <span aria-hidden="true">meses</span>
      </span>
      {etiqueta ?? <span />}
      <button type="button" className={v.botonTexto} onClick={onQuitar} aria-label={`Quitar ${fila.concepto || "renglón"}`}>
        Quitar
      </button>
    </div>
  );
}

export function Medidor({ nombre, pct, nota }: { nombre: ReactNode; pct: number | null; nota: ReactNode }) {
  const tono = pct == null ? undefined : pct >= 100 ? "mal" : pct >= 85 ? "atencion" : undefined;
  return (
    <div className={v.medidor}>
      <div className={v.medidorCabeza}>
        <span>{nombre}</span>
        <span className={v.num}>{pct == null ? "—" : `${pct} %`}</span>
      </div>
      <div className={v.medidorPista}>
        <div className={v.medidorValor} data-tono={tono} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <div className={v.medidorNota}>{nota}</div>
    </div>
  );
}

export function Barra({ partes, etiqueta }: { partes: ReadonlyArray<{ tono: string; pct: number }>; etiqueta: string }) {
  return (
    <div className={v.barra} role="img" aria-label={etiqueta}>
      {partes
        .filter((p) => p.pct > 0)
        .map((p) => (
          <div key={p.tono} className={v.tramo} data-tono={p.tono} style={{ width: `${p.pct}%` }} />
        ))}
    </div>
  );
}

/** Icono del manual en la zona de arrastre. */
export function IconoManual() {
  return (
    <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 17v-6" />
      <path d="m9.5 13.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}
