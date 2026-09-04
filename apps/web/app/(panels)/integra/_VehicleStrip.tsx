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

type VehicleSource = { name: string; sourceIp: string | null; via: "direct" | "nvr" };

function relAge(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - DateParseSafe(iso)) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function DateParseSafe(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : Date.now();
}

/** Tira de vehículos — sin inventar matrícula. En PTZ muestra el sitio entero. */
export function IntegraVehicleStrip({
  deviceIp,
  enabled,
  anprCapable,
  isPtz,
}: {
  deviceIp: string | null;
  enabled: boolean;
  anprCapable?: boolean;
  isPtz?: boolean;
}) {
  const [items, setItems] = useState<PlateEv[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [sources, setSources] = useState<VehicleSource[]>([]);

  // PTZ nunca emite vehicle: la tira debe mostrar el parque (NVR PoE / AcuSense).
  const siteWide = Boolean(isPtz) || anprCapable !== true;

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await integraApi<{
          items: PlateEv[];
          note?: string;
          vehicleSources?: VehicleSource[];
        }>("integra/plate-events?limit=20");
        if (stop) return;
        const all = data.items || [];
        setItems(siteWide ? all.slice(0, 10) : deviceIp ? all.filter((e) => e.deviceIp === deviceIp) : all.slice(0, 8));
        setNote(data.note || null);
        setSources(data.vehicleSources || []);
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
  }, [deviceIp, enabled, siteWide]);

  if (!enabled) return null;

  const badge = anprCapable ? "ANPR" : isPtz ? "VIDEO+PTZ" : "SIN ANPR";
  const emptyHint = isPtz
    ? "Esta domo no clasifica vehículos ni lee placas — solo video + mando PTZ. Las detecciones vehicle llegan de Office Entrance / Azotea / Escalera (FieldDetection en el NVR). OCR requiere cámara ITC."
    : note || "Sin detecciones vehicle recientes.";

  return (
    <aside className={styles.accessStrip} aria-label="Vehículos" data-ptz={isPtz ? "1" : undefined}>
      <header className={styles.accessStripHead}>
        <strong>Vehículos</strong>
        <span>{badge}</span>
      </header>
      {isPtz && (
        <p className={styles.ptzCapBanner} data-tone="limit">
          Límite de hardware: FieldDetection / ANPR / ITC = notSupport en DS-2DF8C442.
          Motion sí. Placas OCR: no en este parque.
        </p>
      )}
      {items.length === 0 && <p className={styles.ptzHint}>{emptyHint}</p>}
      {isPtz && sources.length > 0 && items.length === 0 && (
        <p className={styles.ptzHint}>
          Fuentes vehicle: {sources.map((s) => s.name).join(" · ")}
        </p>
      )}
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
              <span>
                {h.deviceName || h.deviceIp}
                {h.anpr ? " · ANPR" : siteWide && isPtz ? " · sitio" : ""}
              </span>
              <em>{relAge(h.occurredAt)}</em>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
