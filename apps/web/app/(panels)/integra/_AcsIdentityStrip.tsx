"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents } from "./_DetectionOverlay";
import { PersonFaceThumb, prefetchPersonFace } from "./_PersonFace";
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
 * Identidad ACS al lado del video de oficina.
 *
 * No es Face ID sobre AcuSense: caras y nombres vienen del control de acceso
 * (eventos + biblioteca de terminales). Las cajas ópticas solo dicen «Humano · sin ID».
 */
export function IntegraAcsIdentityStrip({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<OccRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await integraApi<{ items: OccRow[]; note?: string }>("integra/occupancy");
        if (stop) return;
        const rows = data.items || [];
        for (const r of rows) prefetchPersonFace(r.personId);
        setItems(rows);
        setNote(data.note || null);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Error ocupación");
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 6_000);
    const tick = window.setInterval(() => setTick((n) => n + 1), 1_000);
    const unsub = subscribePushEvents((events) => {
      if (events.some((e) => e.personName?.trim())) void load();
    });
    return () => {
      stop = true;
      window.clearInterval(id);
      window.clearInterval(tick);
      unsub();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside className={styles.accessStrip} aria-label="Identidad ACS">
      <header className={styles.accessStripHead}>
        <strong>En sitio · ACS</strong>
        <span>{items.length ? `${items.length} hoy` : "ocupación"}</span>
      </header>
      <p className={styles.ptzHint}>
        Face ID en terminal / pases — no en video de oficina. Las cajas ópticas
        solo marcan «Humano · sin ID».
      </p>
      {error && (
        <p className={styles.ptzHint} data-tone="error">
          {error}
        </p>
      )}
      {items.length === 0 && !error ? (
        <p className={styles.ptzHint}>Nadie con acceso concedido hoy.</p>
      ) : (
        <ul className={styles.accessStripList}>
          {items.map((h) => (
            <li key={h.personId} className={styles.accessStripRow}>
              <PersonFaceThumb
                className={styles.accessStripPhoto}
                size="md"
                personId={h.personId}
                personName={h.personName}
                photoPath={h.lastPhoto}
              />
              <div className={styles.accessStripBody}>
                <strong>{h.personName || h.personId}</strong>
                <span>
                  {h.lastDoor || "Acceso"}
                  {h.verifyMode ? ` · ${h.verifyMode}` : ""}
                </span>
                <em>{relAge(h.lastAt)}</em>
              </div>
            </li>
          ))}
        </ul>
      )}
      {note && <p className={styles.ptzHint}>{note}</p>}
    </aside>
  );
}
