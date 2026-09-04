"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents, type PushEvent } from "./_DetectionOverlay";
import { PersonFaceThumb, prefetchPersonFace } from "./_PersonFace";
import styles from "./integra.module.css";

/**
 * Flash de identidad a nivel sitio: cuando un terminal ACS concede acceso,
 * aparece aquí aunque estés mirando una cámara de oficina (sin Face ID óptico).
 */

type Flash = {
  id: number;
  at: number;
  personName: string;
  personId: string | null;
  door: string;
  photoPath: string | null;
  verifyMode: string | null;
};

const FLASH_TTL_MS = 14_000;

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
        if (ev.personId) prefetchPersonFace(ev.personId);
        if (!best || at > best.at) {
          best = {
            id: ev.id,
            at,
            personName: name,
            personId: ev.personId ?? null,
            door: ev.deviceName || ev.deviceIp || "Acceso",
            photoPath: ev.photoPath ?? null,
            verifyMode: ev.verifyMode ?? null,
          };
        }
      }
      if (best) setFlash(best);
    });
  }, [enabled]);

  useEffect(() => {
    if (!flash) return;
    const left = FLASH_TTL_MS - (Date.now() - flash.at);
    const id = window.setTimeout(() => setFlash(null), Math.max(400, left));
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!enabled || !flash) return null;

  const age = Math.max(0, Math.round((Date.now() - flash.at) / 1000));

  return (
    <div className={styles.liveAccessBanner} role="status" data-fresh={age < 3 ? "1" : undefined}>
      <PersonFaceThumb
        className={styles.liveAccessPhoto}
        size="lg"
        personId={flash.personId}
        personName={flash.personName}
        photoPath={flash.photoPath}
      />
      <div className={styles.liveAccessBody}>
        <span className={styles.liveAccessEyebrow}>
          Reconocimiento ACS{flash.verifyMode ? ` · ${flash.verifyMode}` : ""}
        </span>
        <strong>{flash.personName}</strong>
        <span>
          {flash.door} · {age < 1 ? "ahora" : `hace ${age}s`}
        </span>
      </div>
    </div>
  );
}
