"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents, type PushEvent } from "./_DetectionOverlay";
import styles from "./integra.module.css";

/**
 * Flash de identidad a nivel sitio: cuando un terminal ACS concede acceso,
 * aparece aquí aunque estés mirando una cámara de oficina (sin Face ID óptico).
 */

type Flash = {
  id: number;
  at: number;
  personName: string;
  door: string;
  photoPath: string | null;
};

const FLASH_TTL_MS = 12_000;

export function IntegraLiveAccessBanner({ enabled }: { enabled: boolean }) {
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (!enabled) return;
    return subscribePushEvents((events: PushEvent[]) => {
      let best: Flash | null = null;
      for (const ev of events) {
        const name = ev.personName?.trim();
        if (!name) continue;
        const at = Date.parse(ev.occurredAt);
        if (!Number.isFinite(at) || Date.now() - at > FLASH_TTL_MS) continue;
        if (!best || at > best.at) {
          best = {
            id: ev.id,
            at,
            personName: name,
            door: ev.deviceName || ev.deviceIp || "Acceso",
            photoPath: ev.photoPath ?? null,
          };
        }
      }
      if (best) setFlash(best);
    });
  }, [enabled]);

  useEffect(() => {
    if (!flash) return;
    const left = FLASH_TTL_MS - (Date.now() - flash.at);
    const id = window.setTimeout(() => setFlash(null), Math.max(500, left));
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!enabled || !flash) return null;

  const age = Math.max(0, Math.round((Date.now() - flash.at) / 1000));

  return (
    <div className={styles.liveAccessBanner} role="status">
      <div className={styles.liveAccessPhoto} data-empty={!flash.photoPath ? "1" : undefined}>
        {flash.photoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flash.photoPath} alt="" />
        ) : (
          <span aria-hidden>{flash.personName.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className={styles.liveAccessBody}>
        <strong>{flash.personName}</strong>
        <span>
          Acceso · {flash.door} · {age < 1 ? "ahora" : `${age}s`}
        </span>
      </div>
    </div>
  );
}
