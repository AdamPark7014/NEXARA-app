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

type VehicleSource = {
  name: string;
  sourceIp: string | null;
  via: "direct" | "nvr";
  lastSeenAt?: string | null;
  lastEventType?: string | null;
};

type SiblingActivity = {
  id: number;
  deviceIp: string;
  deviceName: string | null;
  occurredAt: string;
  kind: "fielddetection" | "motion" | "line" | "other";
  label: string;
  photoPath: string | null;
  notVehicleClassified: true;
};

function relAge(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - DateParseSafe(iso)) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function DateParseSafe(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : Date.now();
}

function sourceFresh(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Date.now() - DateParseSafe(iso) < 15 * 60_000;
}

/** Tira de vehículos — sin inventar matrícula. En PTZ muestra el parque (fuentes AcuSense/NVR). */
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
  const [honesty, setHonesty] = useState<string | null>(null);
  const [sources, setSources] = useState<VehicleSource[]>([]);
  const [sibling, setSibling] = useState<SiblingActivity[]>([]);
  const [ptzMotionAt, setPtzMotionAt] = useState<string | null>(null);
  const [nvrPushActive, setNvrPushActive] = useState<boolean | null>(null);

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
          honesty?: string;
          vehicleSources?: VehicleSource[];
          siblingActivity?: SiblingActivity[];
          ptzMotion?: SiblingActivity | null;
          nvrPushActive?: boolean;
          ptz?: { lastMotionAt?: string | null };
        }>("integra/plate-events?limit=20");
        if (stop) return;
        const all = data.items || [];
        setItems(siteWide ? all.slice(0, 10) : deviceIp ? all.filter((e) => e.deviceIp === deviceIp) : all.slice(0, 8));
        setNote(data.note || null);
        setHonesty(data.honesty || null);
        setSources(data.vehicleSources || []);
        setSibling((data.siblingActivity || []).slice(0, 8));
        setPtzMotionAt(data.ptzMotion?.occurredAt || data.ptz?.lastMotionAt || null);
        setNvrPushActive(typeof data.nvrPushActive === "boolean" ? data.nvrPushActive : null);
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
    ? note ||
      "Esta domo no clasifica vehículos ni lee placas — solo video + mando PTZ. Las detecciones vehicle llegan de Office Entrance / Azotea / Escalera (FieldDetection en el NVR). OCR requiere cámara ITC."
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
      {isPtz && honesty && <p className={styles.ptzHint}>{honesty}</p>}
      {isPtz && ptzMotionAt && (
        <p className={styles.ptzHint} data-tone="ok">
          Motion PTZ hace {relAge(ptzMotionAt)} — movimiento, no ID de vehículo.
        </p>
      )}
      {isPtz && sources.length > 0 && (
        <ul className={styles.vehicleSourceList} aria-label="Fuentes vehicle del parque">
          {sources.map((s) => {
            const fresh = sourceFresh(s.lastSeenAt);
            return (
              <li key={`${s.name}-${s.sourceIp || s.via}`} data-fresh={fresh ? "1" : "0"}>
                <strong>{s.name}</strong>
                <span>
                  {s.via === "nvr" ? "NVR FieldDetection" : "directo"}
                  {fresh && s.lastSeenAt
                    ? ` · vivo ${relAge(s.lastSeenAt)}`
                    : " · sin empuje reciente"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {isPtz && nvrPushActive === false && (
        <p className={styles.ptzCapBanner} data-tone="limit">
          NVR PoE sin empuje a NEXARA: no llegarán vehicle de Azotea / Entrance / Escalera
          hasta cablear httpHosts + FieldDetection human,vehicle en el grabador.
        </p>
      )}
      {items.length === 0 && <p className={styles.ptzHint}>{emptyHint}</p>}
      <ul className={styles.accessStripList}>
        {items.map((h) => (
          <li key={h.id} className={styles.accessStripRow} data-fresh="1">
            <div className={styles.accessStripPhoto} data-empty={!h.photoPath ? "1" : undefined}>
              {h.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.photoPath} alt="" />
              ) : (
                <span aria-hidden>V</span>
              )}
            </div>
            <div className={styles.accessStripBody}>
              <strong>{h.plate || h.label || "Vehículo · sin placa"}</strong>
              <span>
                {h.deviceName || h.deviceIp}
                {h.anpr ? " · ANPR" : isPtz ? " · fuente AcuSense/NVR" : ""}
              </span>
              <em>{relAge(h.occurredAt)}</em>
            </div>
          </li>
        ))}
        {isPtz &&
          items.length === 0 &&
          sibling.map((h) => (
            <li key={`sib-${h.id}`} className={styles.accessStripRow} data-kind="activity">
              <div className={styles.accessStripPhoto} data-empty={!h.photoPath ? "1" : undefined}>
                {h.photoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.photoPath} alt="" />
                ) : (
                  <span aria-hidden>{h.kind === "motion" ? "M" : "·"}</span>
                )}
              </div>
              <div className={styles.accessStripBody}>
                <strong>{h.label}</strong>
                <span>
                  {h.deviceName || h.deviceIp} · no es ID vehicle
                </span>
                <em>{relAge(h.occurredAt)}</em>
              </div>
            </li>
          ))}
      </ul>
    </aside>
  );
}
