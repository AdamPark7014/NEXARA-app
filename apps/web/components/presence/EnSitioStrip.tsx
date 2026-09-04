"use client";

import { useEffect, useState } from "react";
import { PersonFaceThumb, prefetchPersonFace } from "@/app/(panels)/integra/_PersonFace";
import {
  fetchOccupancy,
  relAgeEs,
  type PresenceOccRow,
} from "@/lib/presence-api";
import { PersonPresenceDrawer } from "./PersonPresenceDrawer";
import styles from "./EnSitioStrip.module.css";

type Variant = "panel" | "compact" | "aside";

/**
 * Franja «En sitio» compartida (Ops · ERP RRHH · Integra).
 * Consume integra/occupancy; al clic abre ficha (puertas / OTs / CRM).
 */
export function EnSitioStrip({
  enabled = true,
  variant = "panel",
  title = "En sitio",
  pollMs = 12_000,
  className,
}: {
  enabled?: boolean;
  variant?: Variant;
  title?: string;
  pollMs?: number;
  className?: string;
}) {
  const [items, setItems] = useState<PresenceOccRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PresenceOccRow | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await fetchOccupancy();
        if (stop) return;
        const rows = data.items || [];
        for (const r of rows) prefetchPersonFace(r.personId);
        setItems(rows);
        setNote(data.note || null);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "No se pudo cargar ocupación");
      }
    };
    void load();
    const id = window.setInterval(() => void load(), pollMs);
    const tick = window.setInterval(() => setTick((n) => n + 1), 1_000);
    return () => {
      stop = true;
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [enabled, pollMs]);

  if (!enabled) return null;

  const wrapClass = [
    styles.wrap,
    variant === "panel" ? styles.panel : "",
    variant === "compact" ? styles.compact : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <section className={wrapClass} aria-label={title}>
        <header className={styles.head}>
          <strong>{title}</strong>
          <span>
            {items.length} {items.length === 1 ? "persona" : "personas"}
          </span>
        </header>
        <p className={styles.hint}>
          Presencia por control de acceso. Pulsa a alguien para ver puertas de hoy, actividades y CRM.
        </p>
        {error && (
          <p className={styles.hint} data-tone="error">
            {error}
          </p>
        )}
        {items.length === 0 && !error && (
          <p className={styles.empty}>Nadie con acceso concedido en sitio ahora.</p>
        )}
        {items.length > 0 && (
          <ul className={styles.list}>
            {items.map((h) => (
              <li key={h.personId}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setSelected(h)}
                  aria-label={`Ver presencia de ${h.personName || h.personId}`}
                >
                  <PersonFaceThumb
                    className={styles.photo}
                    size="md"
                    personId={h.personId}
                    personName={h.personName}
                    photoPath={h.lastPhoto}
                  />
                  <div className={styles.body}>
                    <strong>{h.personName || h.personId}</strong>
                    <span>
                      {h.lastDoor || "Acceso"}
                      {h.erpUser?.role?.nombre ? ` · ${h.erpUser.role.nombre}` : ""}
                    </span>
                    <em>{relAgeEs(h.lastAt)}</em>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && variant !== "compact" && <p className={styles.hint}>{note}</p>}
      </section>
      {selected && (
        <PersonPresenceDrawer person={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
