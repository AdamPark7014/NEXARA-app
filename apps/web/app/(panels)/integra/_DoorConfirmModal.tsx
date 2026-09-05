"use client";

import { useEffect, useId, useState } from "react";
import DomainOutlinedIcon from "@mui/icons-material/DomainOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import Modal from "@/components/ui/Modal";
import { IgBtn } from "./_Console";
import { DOOR_CONTROL_OPTIONS, DoorControlType } from "./_lib";
import a from "./_access.module.css";

/**
 * Confirmación de control de puerta.
 *
 * Es el diálogo más consecuente del producto: al aceptar se mueve una
 * cerradura física. Por eso:
 *
 *  - Se apoya en `components/ui/Modal`, que ya trae Esc, trampa de foco y
 *    devolución del foco al elemento que lo abrió. No se reimplementa nada.
 *  - El destino (puerta · ubicación · sitio · id) se lee antes que los
 *    controles: abrir la puerta equivocada es un incidente de seguridad,
 *    no una molestia.
 *  - Las acciones que dejan pasar a alguien («Abrir», «Quedar abierta») se
 *    marcan en ámbar para que no se confundan con cerrar.
 */

/** Los dos `controlType` que franquean el paso. */
const RISKY_CONTROL: ReadonlySet<string> = new Set(["0", "2"]);

type Props = {
  open: boolean;
  doorName: string;
  doorId: string;
  /** Región / terminal donde vive la puerta, tal como la reporta el ACS. */
  doorLocation?: string | null;
  /** Estado en vivo ya traducido a español; solo se pinta si llega. */
  doorStateLabel?: string | null;
  /** Sitio activo (la conexión HikCentral / Hik-Connect en uso). */
  siteName?: string | null;
  controlType: DoorControlType;
  busy?: boolean;
  onControlTypeChange?: (t: DoorControlType) => void;
  allowTypeSelect?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function DoorConfirmModal({
  open,
  doorName,
  doorId,
  doorLocation,
  doorStateLabel,
  siteName,
  controlType,
  busy,
  onControlTypeChange,
  allowTypeSelect,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const actionId = useId();

  useEffect(() => {
    if (open) setReason("");
  }, [open, doorId]);

  const label =
    DOOR_CONTROL_OPTIONS.find((o) => o.value === controlType)?.label || controlType;
  const risky = RISKY_CONTROL.has(controlType);
  const reasonOk = reason.trim().length >= 3;

  return (
    <Modal
      open={open}
      // Mientras la orden viaja al ACS no se cierra: ni con Esc, ni con clic
      // fuera, ni con la ×. Cerrar a media orden deja al operador sin saber
      // si la puerta se abrió.
      onClose={() => {
        if (!busy) onCancel();
      }}
      title="Confirmar control de puerta"
      maxWidth={460}
      footer={
        <>
          <IgBtn onClick={onCancel} disabled={busy}>
            Cancelar
          </IgBtn>
          <IgBtn
            variant={risky ? "danger" : "primary"}
            disabled={busy || !reasonOk}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Enviando…" : `Confirmar · ${label}`}
          </IgBtn>
        </>
      }
    >
      <div className={a.modalBody}>
        <div className={a.target}>
          <span className={a.targetEyebrow}>Vas a accionar</span>
          <span className={a.targetName}>
            <MeetingRoomOutlinedIcon className={a.targetIcon} aria-hidden />
            {doorName || "—"}
          </span>
          <span className={a.targetWhere}>
            {doorLocation ? (
              <span className={a.targetWhereItem}>
                <PlaceOutlinedIcon className={a.iconSm} aria-hidden />
                {doorLocation}
              </span>
            ) : null}
            {siteName ? (
              <span className={a.targetWhereItem}>
                <DomainOutlinedIcon className={a.iconSm} aria-hidden />
                {siteName}
              </span>
            ) : null}
            {doorStateLabel ? (
              <span className={a.targetWhereItem}>Ahora: {doorStateLabel}</span>
            ) : null}
          </span>
          <span className={a.targetId}>ID {doorId || "—"}</span>
        </div>

        {allowTypeSelect && onControlTypeChange ? (
          <label className={a.field} htmlFor={actionId}>
            Acción
            <select
              id={actionId}
              value={controlType}
              onChange={(e) => onControlTypeChange(e.target.value as DoorControlType)}
              className={a.control}
              disabled={busy}
            >
              {DOOR_CONTROL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className={a.action} data-risk={risky ? "1" : undefined}>
            {risky ? <WarningAmberOutlinedIcon className={a.icon} aria-hidden /> : null}
            Acción: <strong>{label}</strong>
          </p>
        )}

        {allowTypeSelect && risky ? (
          <p className={a.action} data-risk="1">
            <WarningAmberOutlinedIcon className={a.icon} aria-hidden />
            Esta acción franquea el paso físico.
          </p>
        ) : null}

        <label className={a.field} htmlFor={reasonId}>
          Motivo (obligatorio)
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ej. visita autorizada, mantenimiento, emergencia…"
            className={`${a.control} ${a.textarea}`}
            disabled={busy}
            aria-describedby={`${reasonId}-hint`}
          />
          <span className={a.fieldHint} id={`${reasonId}-hint`}>
            Mínimo 3 caracteres. Queda en la auditoría junto a tu usuario.
          </span>
        </label>
      </div>
    </Modal>
  );
}
