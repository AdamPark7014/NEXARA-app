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
  verifyMode: string | null;
};

function relAge(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function FaceThumb({
  personId,
  personName,
  lastPhoto,
}: {
  personId: string;
  personName: string | null;
  lastPhoto: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const src = lastPhoto || integraPersonFaceUrl(personId);
  const initial = (personName || personId || "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (broken) {
    return (
      <div className={styles.accessStripPhoto} data-empty="1">
        <span aria-hidden>{initial}</span>
      </div>
    );
  }

  return (
    <div className={styles.accessStripPhoto} data-empty={!lastPhoto ? "1" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onError={() => setBroken(true)} />
    </div>
  );
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
        setItems(data.items || []);
        setNote(data.note || null);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Error ocupación");
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 8_000);
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
        <strong>Identidad ACS</strong>
        <span>{items.length ? `${items.length} en sitio` : "ocupación"}</span>
      </header>
      <p className={styles.ptzHint}>
        Fotos y nombres de terminales / pases. Las cajas del video solo marcan
        humano sin ID — no hay Face ID sobre AcuSense.
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
              <FaceThumb
                personId={h.personId}
                personName={h.personName}
                lastPhoto={h.lastPhoto}
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
