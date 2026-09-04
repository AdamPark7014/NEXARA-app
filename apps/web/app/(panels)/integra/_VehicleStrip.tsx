"use client";

import { useEffect, useState } from "react";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

type PlateEv = {
  id: number;
  deviceIp: string;
  deviceName: string | null;
  occurredAt: string;
  plate: string | null;
  label: string | null;
  photoPath: string | null;
  anpr: boolean;
};

function relAge(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

/** Tira de vehículos detectados — sin inventar matrícula si no hay OCR. */
export function IntegraVehicleStrip({
  deviceIp,
  enabled,
}: {
  deviceIp: string | null;
  enabled: boolean;
}) {
  const [items, setItems] = useState<PlateEv[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await integraApi<{ items: PlateEv[]; note?: string }>(
          "integra/plate-events?limit=20",
        );
        if (stop) return;
        const all = data.items || [];
        setItems(
          deviceIp ? all.filter((e) => e.deviceIp === deviceIp) : all.slice(0, 8),
        );
        setNote(data.note || null);
      } catch {
        // Silencioso: no romper el foco PTZ.
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [deviceIp, enabled]);

  if (!enabled || (items.length === 0 && !note)) return null;

  return (
    <aside className={styles.accessStrip} aria-label="Vehículos">
      <header className={styles.accessStripHead}>
        <strong>Vehículos</strong>
        <span>{items.length ? "30 min" : "sin ANPR"}</span>
      </header>
      {items.length === 0 && note && <p className={styles.ptzHint}>{note}</p>}
      <ul className={styles.accessStripList}>
        {items.map((h) => (
          <li key={h.id} className={styles.accessStripRow}>
            <div className={styles.accessStripPhoto} data-empty={!h.photoPath ? "1" : undefined}>
              {h.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.photoPath} alt="" />
              ) : (
                <span aria-hidden>V</span>
              )}
            </div>
            <div className={styles.accessStripBody}>
              <strong>{h.plate || "Vehículo · sin placa"}</strong>
              <span>{h.deviceName || h.deviceIp}{h.anpr ? " · ANPR" : ""}</span>
              <em>{relAge(h.occurredAt)}</em>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
