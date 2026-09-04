"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IgBadge, IgBtn, IgError, IgField, IgFilters, IgPage, IgPanel, IgToolbar } from "../_Console";
import { inputStyle, integraApi } from "../_lib";
import styles from "../integra.module.css";

/**
 * Asistencia deducida del control de acceso.
 *
 * Estos terminales no marcan entrada ni salida —su `AttendanceMode` responde
 * `notSupport`—, así que no hay un fichaje que leer: la jornada sale del primer
 * y el último acceso concedido del día. Se dice en pantalla, porque un número
 * de horas sin saber de dónde sale invita a confiar en él más de lo debido.
 *
 * La foto es la que NEXARA tomó del terminal al llegar el evento. El equipo no
 * entrega la suya: guarda el rostro como modelo biométrico, no como imagen.
 */

type Row = {
  day: string;
  personId: string;
  personName: string | null;
  firstAt: string;
  lastAt: string;
  firstDoor: string | null;
  firstPhoto: string | null;
  passes: number;
  denied: number;
  minutes: number | null;
};

function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

function durationLabel(min: number | null): string {
  if (min == null) return "sin salida";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

function todayInput(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function IntegraAttendancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState(() => todayInput(6));
  const [to, setTo] = useState(() => todayInput(0));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
      });
      const data = await integraApi<{ items: Row[] }>(`integra/attendance?${qs.toString()}`);
      setRows(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter(
      (r) =>
        (r.personName || "").toLowerCase().includes(needle) ||
        r.personId.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const list = map.get(r.day);
      if (list) list.push(r);
      else map.set(r.day, [r]);
    }
    return [...map.entries()];
  }, [filtered]);

  const people = useMemo(() => new Set(filtered.map((r) => r.personId)).size, [filtered]);

  return (
    <IgPage>
      <IgToolbar
        title="Asistencia"
        meta={
          busy
            ? "Cargando…"
            : `${filtered.length} jornadas · ${people} personas`
        }
        actions={<IgBtn onClick={() => void load()}>Actualizar</IgBtn>}
      />
      <IgError>{error}</IgError>

      <IgFilters>
        <IgField label="Desde">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Hasta">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Buscar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
            placeholder="nombre o código"
          />
        </IgField>
      </IgFilters>

      {byDay.length === 0 && !busy && (
        <IgPanel title="Sin registros">
          <p className={styles.igEmpty}>
            No hay accesos concedidos en ese rango. La asistencia se arma con los eventos que
            los terminales empujan a NEXARA.
          </p>
        </IgPanel>
      )}

      {byDay.map(([day, list]) => (
        <IgPanel key={day} title={dayLabel(day)} count={`${list.length}`}>
          <div className={styles.attGrid}>
            {list.map((r) => (
              <article key={`${r.day}-${r.personId}`} className={styles.attCard}>
                <div className={styles.attPhoto} data-empty={!r.firstPhoto ? "1" : undefined}>
                  {r.firstPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.firstPhoto} alt="" />
                  ) : (
                    <span aria-hidden>{(r.personName || "?").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className={styles.attBody}>
                  <strong className={styles.attName}>{r.personName || r.personId}</strong>
                  <span className={styles.attCode}>{r.personId}</span>
                  <div className={styles.attTimes}>
                    <span>
                      <b>{hhmm(r.firstAt)}</b> entrada
                    </span>
                    {r.passes > 1 && (
                      <span>
                        <b>{hhmm(r.lastAt)}</b> último paso
                      </span>
                    )}
                  </div>
                  <div className={styles.attChips}>
                    <IgBadge tone={r.minutes == null ? "warn" : "ok"}>
                      {durationLabel(r.minutes)}
                    </IgBadge>
                    <IgBadge tone="neutral">{r.passes} pasos</IgBadge>
                    {r.denied > 0 && <IgBadge tone="warn">{r.denied} denegados</IgBadge>}
                  </div>
                  {r.firstDoor && <span className={styles.attDoor}>{r.firstDoor}</span>}
                </div>
              </article>
            ))}
          </div>
        </IgPanel>
      ))}

      <p className={styles.attNote}>
        Las horas salen del primer y el último acceso concedido de cada día: estos terminales
        no distinguen entrada de salida. Un solo paso se marca «sin salida» en vez de contarlo
        como jornada de cero minutos.
      </p>
    </IgPage>
  );
}
