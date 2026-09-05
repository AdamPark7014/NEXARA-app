"use client";

/**
 * Ficha de una alarma: la foto del pase y la puerta, ahí mismo.
 *
 * El operador no debería cambiar de pantalla para ver qué pasó. Solo se pinta
 * lo que el DTO trae de verdad (`SocQueueItem` en
 * `apps/api/src/integra/integra-acs-alarms.service.ts` y el mapeo Artemis en
 * `integra-artemis.service.ts:alarmQueue`). Lo que no viaja, no se dibuja.
 */

import type { ReactNode } from "react";
import CodeIcon from "@mui/icons-material/Code";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";

import { PersonFaceThumb } from "./_PersonFace";
import styles from "./_soc.module.css";
import { SocKeyValues, SocRepeatChip, SocSeverityPill, SocStatusPill } from "./_SocBits";
import {
  fmtDateTime,
  occurrencesOf,
  relAge,
  sourceLabel,
  type AlarmGroup,
  type KeyValue,
} from "./_soc";

function kindLabel(group: AlarmGroup): string {
  if (group.kind === "DENIED") return "Acceso denegado";
  if (group.kind === "AFTER_HOURS") return "Entrada fuera de horario";
  return group.eventType?.trim() || "";
}

function originLabel(group: AlarmGroup): string {
  if (group.source === "push") return "Empuje ACS del terminal (verificado)";
  return "Artemis · registro de eventos";
}

function buildPairs(group: AlarmGroup): KeyValue[] {
  const pairs: KeyValue[] = [];
  const push = (label: string, value: string | number | null | undefined, key?: string) => {
    const v = value == null ? "" : String(value).trim();
    pairs.push({ key: key || label, label, value: v, empty: v === "" });
  };

  push("Persona", group.personName || group.personId || "");
  push("Puerta", sourceLabel(group));
  push("Equipo", group.deviceName || group.deviceIp || "");
  push("Tipo", kindLabel(group));
  push("Última vez", fmtDateTime(group.timestamp));
  if (group.members.length > 1 || occurrencesOf(group) > 1) {
    push("Primera del grupo", group.firstSeen ? fmtDateTime(new Date(group.firstSeen).toISOString()) : "");
    push("Repeticiones", String(group.totalOccurrences));
  }
  // Estado y severidad se pintan como píldoras arriba: repetirlos aquí es ruido.
  if (group.ackedAt) push("Atendida", fmtDateTime(group.ackedAt));
  if (group.clearedAt) push("Cerrada", fmtDateTime(group.clearedAt));
  if (group.note) push("Nota del operador", group.note);
  if (group.ticketRequestId != null) push("Ticket OPS", `#${group.ticketRequestId}`);
  if (group.pushEventId != null) push("Evento push", `#${group.pushEventId}`);
  push("Origen del dato", originLabel(group));
  push("ID de alarma", group.id);
  return pairs;
}

export function SocAlarmDetail({
  group,
  actions,
}: {
  group: AlarmGroup;
  actions?: ReactNode;
}) {
  const pairs = buildPairs(group);
  const hasPhoto = Boolean(group.photoPath);
  const hasIdentity = Boolean(group.personId);
  const attendedButAnonymous = Boolean(group.ackedAt || group.clearedAt || group.note);

  return (
    <div className={styles.detail}>
      <div className={styles.detailMedia}>
        {hasPhoto || hasIdentity ? (
          <>
            <PersonFaceThumb
              className={styles.photo}
              size="xl"
              personId={group.personId}
              personName={group.personName}
              photoPath={group.photoPath}
            />
            <span className={styles.photoNote}>
              {hasPhoto ? (
                <>
                  <PhotoCameraIcon aria-hidden style={{ width: 11, height: 11, verticalAlign: "-1px" }} />{" "}
                  Captura del pase
                </>
              ) : (
                "Foto enrolada"
              )}
            </span>
          </>
        ) : (
          <>
            <span className={styles.photo} aria-hidden>
              <ImageNotSupportedIcon style={{ width: 30, height: 30, opacity: 0.5 }} />
            </span>
            <span className={styles.photoNote}>Sin captura</span>
          </>
        )}
      </div>

      <div className={styles.detailBody}>
        <div className={styles.detailHead}>
          <span className={styles.detailTitle}>{group.title}</span>
          <SocSeverityPill severity={group.severity} />
          <SocStatusPill status={group.status} />
          <SocRepeatChip
            count={group.totalOccurrences}
            hint={`${group.totalOccurrences} repeticiones sobre la misma puerta y persona`}
          />
          <span className={styles.cellMono}>{relAge(group.timestamp || "")}</span>
        </div>

        <SocKeyValues pairs={pairs} />

        {attendedButAnonymous && (
          <p className={styles.hint}>
            El backend guarda quién atendió la alarma (<code>userId</code> en{" "}
            <code>integra_soc_alarms</code> / <code>integra_alarm_acks</code>) pero no lo devuelve en
            la cola, así que aquí no se puede mostrar el nombre del operador. No se inventa.
          </p>
        )}

        {!group.cameraIndexCode && group.source === "push" && (
          <p className={styles.hint}>
            <CodeIcon aria-hidden style={{ width: 12, height: 12, verticalAlign: "-2px" }} /> Esta
            alarma no trae cámara asociada: el DTO de la cola push fija{" "}
            <code>cameraIndexCode: null</code> y el modelo no relaciona puerta con cámara. Sin ese
            vínculo no hay salto a video desde aquí.
          </p>
        )}

        {actions && <div className={styles.rowActions} style={{ justifyContent: "flex-start" }}>{actions}</div>}
      </div>
    </div>
  );
}
