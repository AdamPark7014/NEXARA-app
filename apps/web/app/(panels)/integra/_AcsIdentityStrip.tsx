"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents } from "./_DetectionOverlay";
import { integraApi, integraPersonFaceUrl } from "./_lib";
import styles from "./integra.module.css";

type OccRow = {
  personId: string;
  personName: string | null;
  lastAt: string;
  lastDoor: string | null;
  lastPhoto: string | null;
};

/**
 * Identidad ACS al lado del video de oficina.
 *
 * No es Face ID sobre AcuSense: son las caras/accesos del control de acceso
 * (UserInfo / eventos). Sirve de contexto honesto mientras las cajas ópticas
 * solo dicen «Humano · sin ID».
 */
export function IntegraAcsIdentityStrip({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<OccRow[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await integraApi<{ items: OccRow[] }>("integra/occupancy");
        if (!stop) setItems((data.items || []).slice(0, 8));
      } catch {
        /* ignore */
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
    <aside className={styles.accessStrip} aria-label="Identidad ACS">
      <header className={styles.accessStripHead}>
        <strong>Identidad ACS</strong>
        <span>no Face ID video</span>
      </header>
      <p className={styles.ptzHint}>
        Fotos y nombres vienen de terminales de acceso (biblioteca / pases). Las
        cajas del video solo marcan humano sin ID.
      </p>
      {items.length === 0 ? (
        <p className={styles.ptzHint}>Nadie con acceso concedido hoy.</p>
      ) : (
        <ul className={styles.accessStripList}>
          {items.map((h) => {
            const face = h.lastPhoto || integraPersonFaceUrl(h.personId);
            return (
              <li key={h.personId} className={styles.accessStripRow}>
                <div className={styles.accessStripPhoto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={face}
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className={styles.accessStripBody}>
                  <strong>{h.personName || h.personId}</strong>
                  <span>{h.lastDoor || "Acceso"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
