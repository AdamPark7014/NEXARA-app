"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IgBadge, IgBtn, IgError, IgField, IgFilters, IgPage, IgPanel, IgToolbar } from "../_Console";
import { inputStyle, integraApi } from "../_lib";
import styles from "../integra.module.css";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { useUser } from "@/components/UserContext";

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
 *
 * El vínculo con ERP (nómina) vive en /erp/hr/attendance · híbrido: mismo
 * employeeNumber ↔ personId/personCode. Aquí solo se muestra si hay match.
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

type ErpLink = {
  userId: number;
  nombre: string;
  employeeNumber: string | null;
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
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<Row[]>([]);
  const [erpByPerson, setErpByPerson] = useState<Record<string, ErpLink>>({});
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

      // Enriquecer con vínculo ERP del día «hasta» (híbrido; no bloquea si falla).
      if (token) {
        try {
          const hybridRes = await fetch(
            buildApiUrl(`attendance/hybrid?date=${encodeURIComponent(to)}`),
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (hybridRes.ok) {
            const hybrid = await parseResponseJson<{
              items: Array<{
                linkStatus: string;
                acs?: { personId: string } | null;
                user?: { id: number; nombre: string; employeeNumber: string | null } | null;
              }>;
            }>(hybridRes);
            const map: Record<string, ErpLink> = {};
            for (const item of hybrid.items || []) {
              if (item.linkStatus === "linked" && item.acs?.personId && item.user) {
                map[item.acs.personId] = {
                  userId: item.user.id,
                  nombre: item.user.nombre,
                  employeeNumber: item.user.employeeNumber,
                };
              }
            }
            setErpByPerson(map);
          }
        } catch {
          /* opcional */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [from, to, token]);

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
        actions={
          <>
            <Link
              href="/erp/hr/attendance"
              style={{ fontSize: 12, marginRight: 8, color: "var(--ig-accent, #38bdf8)", textDecoration: "none" }}
            >
              Híbrido ERP
            </Link>
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
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
            {list.map((r) => {
              const erp = erpByPerson[r.personId];
              return (
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
                      {erp && day === to && (
                        <IgBadge tone="ok">ERP · {erp.nombre.split(" ")[0]}</IgBadge>
                      )}
                    </div>
                    {erp && day === to && (
                      <Link href={`/erp/hr/${erp.userId}`} className={styles.attDoor}>
                        Ficha ERP #{erp.userId}
                      </Link>
                    )}
                    {r.firstDoor && <span className={styles.attDoor}>{r.firstDoor}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </IgPanel>
      ))}

      <p className={styles.attNote}>
        Las horas salen del primer y el último acceso concedido de cada día: estos terminales
        no distinguen entrada de salida. Un solo paso se marca «sin salida» en vez de contarlo
        como jornada de cero minutos. La nómina sigue el checador ERP; aquí solo se contrastan
        puertas. Vincula con el mismo código en employeeNumber y personId.
      </p>
    </IgPage>
  );
}
