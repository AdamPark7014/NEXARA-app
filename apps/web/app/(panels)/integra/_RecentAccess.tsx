"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents, type PushEvent } from "./_DetectionOverlay";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

/**
 * Tira de accesos recientes en Foco de una cámara-puerta.
 *
 * Solo hay identidad en eventos ACS (`personName`). Se filtra por la IP del
 * terminal que alimenta el stream — no se cruza con cámaras AcuSense.
 */

type AccessHit = {
  id: number;
  at: number;
  personName: string;
  personId: string | null;
  photoPath: string | null;
  label: string | null;
  verifyMode: string | null;
};

const ACCESS_TTL_MS = 60_000;
const SEED_MS = 60_000;

function relAge(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 1) return "ahora";
  return `${s}s`;
}

export function IntegraRecentAccess({
  deviceIp,
  enabled,
}: {
  deviceIp: string | null;
  enabled: boolean;
}) {
  const [hits, setHits] = useState<AccessHit[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    setHits([]);
  }, [deviceIp]);

  useEffect(() => {
    if (!enabled || !deviceIp) return;
    let stop = false;
    void integraApi<{ items: PushEvent[] }>(
      `integra/push/events?sinceMs=${SEED_MS}&limit=40&live=1`,
    )
      .then((d) => {
        if (stop) return;
        const fresh: AccessHit[] = [];
        for (const ev of d.items || []) {
          if (ev.deviceIp !== deviceIp) continue;
          const name = ev.personName?.trim();
          if (!name) continue;
          const at = Date.parse(ev.occurredAt);
          if (!Number.isFinite(at) || Date.now() - at > ACCESS_TTL_MS) continue;
          fresh.push({
            id: ev.id,
            at,
            personName: name,
            personId: ev.personId ?? null,
            photoPath: ev.photoPath ?? null,
            label: ev.label ?? null,
            verifyMode: ev.verifyMode ?? null,
          });
        }
        if (!fresh.length) return;
        setHits(
          fresh
            .sort((a, b) => b.at - a.at)
            .slice(0, 12),
        );
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [deviceIp, enabled]);

  useEffect(() => {
    if (!enabled || !deviceIp) return;
    return subscribePushEvents((events: PushEvent[]) => {
      const fresh: AccessHit[] = [];
      for (const ev of events) {
        if (ev.deviceIp !== deviceIp) continue;
        const name = ev.personName?.trim();
        if (!name) continue;
        const age = Date.now() - Date.parse(ev.occurredAt);
        if (!Number.isFinite(age) || age > ACCESS_TTL_MS) continue;
        fresh.push({
          id: ev.id,
          at: Date.parse(ev.occurredAt) || Date.now(),
          personName: name,
          personId: ev.personId ?? null,
          photoPath: ev.photoPath ?? null,
          label: ev.label ?? null,
          verifyMode: ev.verifyMode ?? null,
        });
      }
      if (!fresh.length) return;
      setHits((prev) => {
        const map = new Map(prev.map((h) => [h.id, h]));
        for (const h of fresh) map.set(h.id, h);
        return [...map.values()]
          .sort((a, b) => b.at - a.at)
          .slice(0, 12);
      });
    });
  }, [deviceIp, enabled]);

  useEffect(() => {
    if (!enabled || hits.length === 0) return;
    const id = window.setInterval(() => {
      const cut = Date.now() - ACCESS_TTL_MS;
      setHits((prev) => prev.filter((h) => h.at > cut));
      setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, hits.length]);

  if (!enabled || !deviceIp || hits.length === 0) return null;

  return (
    <aside className={styles.accessStrip} aria-label="Últimos accesos">
      <header className={styles.accessStripHead}>
        <strong>Últimos accesos</strong>
        <span>60 s</span>
      </header>
      <ul className={styles.accessStripList}>
        {hits.map((h) => (
          <li key={h.id} className={styles.accessStripRow}>
            <div className={styles.accessStripPhoto} data-empty={!h.photoPath ? "1" : undefined}>
              {h.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.photoPath} alt="" />
              ) : (
                <span aria-hidden>{h.personName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className={styles.accessStripBody}>
              <strong>{h.personName}</strong>
              <span>
                {h.label || "Acceso"}
                {h.verifyMode ? ` · ${h.verifyMode}` : ""}
              </span>
              <em>{relAge(h.at)}</em>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
