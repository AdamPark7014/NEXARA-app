"use client";

import { useCallback, useEffect, useState } from "react";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import SensorDoorRounded from "@mui/icons-material/SensorDoorRounded";
import { IgError } from "../_Console";
import { integraApi } from "../_lib";
import { formatApiError } from "@/lib/erp-api";
import styles from "./_people.module.css";
import { describeError, formatWhen } from "./_peopleView";

/**
 * Puertas de una persona con su plan horario.
 *
 * `GET integra/people/:id/access` ya calculaba `templateName` — el nombre real
 * del plan que aplica en cada puerta — leyendo `UserRightPlanTemplate` del
 * terminal. La ficha nunca lo enseñaba: se veía «Puerta principal» y punto, sin
 * decir si esa persona la abre a cualquier hora o solo de 9 a 6. Eso es
 * exactamente la mitad de la respuesta que busca quien mira esta pantalla.
 */

type AccessValid = {
  enable?: boolean;
  beginTime?: string;
  endTime?: string;
  timeType?: string;
};

type AccessDoor = {
  deviceIp?: string;
  deviceName?: string;
  doorIndexCode?: string;
  doorName?: string;
  present?: boolean;
  doorNo?: number;
  doorRight?: string | null;
  planTemplateNo?: string | null;
  /** Nombre del plan horario en el terminal. El dato que se tiraba. */
  templateName?: string | null;
  rightPlan?: Array<{ doorNo?: number; planTemplateNo?: string }>;
  Valid?: AccessValid | null;
  validMode?: string;
  name?: string;
  userType?: string;
  error?: string;
};

type PersonAccess = {
  personId?: string;
  name?: string;
  valid?: AccessValid | null;
  validMode?: string;
  doors?: AccessDoor[];
};

const VALID_MODE_LABEL: Record<string, string> = {
  indefinite: "Indefinida — sin fecha de fin real",
  window: "Ventana de fechas",
  disabled: "Suspendida en el terminal",
};

export function PersonAccessPanel({ personId }: { personId: string }) {
  const [data, setData] = useState<PersonAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await integraApi<PersonAccess>(
          `integra/people/${encodeURIComponent(personId)}/access`,
        ),
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo leer el acceso de esta persona"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className={styles.doorList} role="status" aria-busy="true" aria-live="polite">
        {[0, 1].map((i) => (
          <span key={i} className={`${styles.shimmer} ${styles.shimmerBlock}`} />
        ))}
        <span className={styles.srOnly}>Consultando puertas y planes horarios…</span>
      </div>
    );
  }

  if (error) {
    const info = describeError(error);
    return (
      <IgError
        title={info.title}
        tone={info.tone}
        onRetry={info.retriable ? () => void load() : undefined}
      >
        {info.hint} <span className={styles.credDetail}>{error}</span>
      </IgError>
    );
  }

  const doors = data?.doors ?? [];
  const valid = data?.valid ?? null;
  const modeLabel = data?.validMode ? VALID_MODE_LABEL[data.validMode] || data.validMode : null;

  return (
    <>
      {valid && (
        <dl className={styles.factGrid}>
          <div className={styles.factCell}>
            <dt>Vigencia en terminal</dt>
            <dd>
              {formatWhen(valid.beginTime)} → {formatWhen(valid.endTime)}
            </dd>
          </div>
          {modeLabel && (
            <div className={styles.factCell}>
              <dt>Modo</dt>
              <dd>{modeLabel}</dd>
            </div>
          )}
          <div className={styles.factCell}>
            <dt>Activa</dt>
            <dd>{valid.enable === false ? "No — está suspendida" : "Sí"}</dd>
          </div>
        </dl>
      )}

      {doors.length === 0 ? (
        <p className={styles.credDetail}>
          Ningún terminal del sitio devolvió puertas para esta persona. Puede que aún no esté
          enrolada o que los ACS no respondan.
        </p>
      ) : (
        <div className={styles.doorList}>
          {doors.map((d, i) => {
            const present = d.present === true;
            const doorLabel = d.doorName || d.deviceName || d.deviceIp || `Puerta ${i + 1}`;
            const terminal = d.deviceName && d.deviceIp ? `${d.deviceName} · ${d.deviceIp}` : d.deviceName || d.deviceIp;
            return (
              <div
                key={d.doorIndexCode || `${d.deviceIp}-${i}`}
                className={styles.doorRow}
                data-present={present ? "1" : "0"}
              >
                <span className={styles.doorIcon} aria-hidden>
                  <SensorDoorRounded />
                </span>
                <span>
                  <span className={styles.doorName}>{doorLabel}</span>
                  {present ? (
                    <span className={styles.doorPlan}>
                      <ScheduleRounded aria-hidden />
                      {d.templateName ? (
                        <>
                          Plan <span className={styles.doorPlanName}>{d.templateName}</span>
                          {d.planTemplateNo ? ` (nº ${d.planTemplateNo})` : ""}
                        </>
                      ) : d.planTemplateNo ? (
                        <>Plan nº {d.planTemplateNo} — el terminal no le puso nombre</>
                      ) : (
                        <>Sin plan horario asignado en esta puerta</>
                      )}
                    </span>
                  ) : (
                    <span className={styles.doorPlan}>
                      {d.error ? `No se pudo consultar: ${d.error}` : "No está dada de alta aquí"}
                    </span>
                  )}
                  <span className={styles.doorMeta}>
                    {terminal ? `Terminal ${terminal}` : "Terminal sin nombre"}
                    {d.doorNo != null ? ` · puerta nº ${d.doorNo}` : ""}
                  </span>
                </span>
                <span className={styles.doorState}>{present ? "Enrolada" : "Ausente"}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
