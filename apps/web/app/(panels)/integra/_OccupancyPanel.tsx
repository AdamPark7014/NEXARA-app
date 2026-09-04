"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents } from "./_DetectionOverlay";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

type OccRow = {
  personId: string;
  personName: string | null;
  lastAt: string;
  lastDoor: string | null;
  lastPhoto: string | null;
  verifyMode: string | null;
};

function relAge(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/**
 * Quién está en sitio según accesos ACS de hoy — no es Face ID sobre el video
 * de oficina. Va al lado del foco para no fingir nameplates en AcuSense.
 */
export function IntegraOccupancyPanel({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<OccRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await integraApi<{ items: OccRow[]; note?: string; total?: number }>(
          "integra/occupancy",
        );
        if (stop) return;
        setItems(data.items || []);
        setNote(data.note || null);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Error ocupación");
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    const unsub = subscribePushEvents((events) => {
      if (events.some((e) => e.personName?.trim())) void load();
    });
    return () => {
      stop = true;
      window.clearInterval(id);
      unsub();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside className={styles.accessStrip} aria-label="En sitio ahora">
      <header className={styles.accessStripHead}>
        <strong>En sitio ahora</strong>
        <span>{items.length}</span>
      </header>
      {error && <p className={styles.ptzHint} data-tone="error">{error}</p>}
      {items.length === 0 && !error && (
        <p className={styles.ptzHint}>Nadie con acceso concedido hoy (o aún no hay eventos).</p>
      )}
      <ul className={styles.accessStripList}>
        {items.map((h) => (
          <li key={h.personId} className={styles.accessStripRow}>
            <div className={styles.accessStripPhoto} data-empty={!h.lastPhoto ? "1" : undefined}>
              {h.lastPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.lastPhoto} alt="" />
              ) : (
                <span aria-hidden>{(h.personName || "?").slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className={styles.accessStripBody}>
              <strong>{h.personName || h.personId}</strong>
              <span>{h.lastDoor || "Acceso"}{h.verifyMode ? ` · ${h.verifyMode}` : ""}</span>
              <em>{relAge(h.lastAt)}</em>
            </div>
          </li>
        ))}
      </ul>
      {note && <p className={styles.ptzHint}>{note}</p>}
    </aside>
  );
}
