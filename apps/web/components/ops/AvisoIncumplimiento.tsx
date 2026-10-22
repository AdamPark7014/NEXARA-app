"use client";

import { Alert } from "@/components/base";
import { formatDateTime } from "@/components/detail/DetailFrame";
import type { Incumplimiento } from "@/lib/ops-activities-api";

const horaMx = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));

/**
 * Registro de incumplimiento en el detalle. Mientras la actividad siga «No cumplida» es el aviso
 * principal (rojo); si ya se reprogramó, queda como antecedente (amarillo) con la fecha nueva.
 */
export default function AvisoIncumplimiento({ estatus, inc }: { estatus?: string | null; inc: Incumplimiento }) {
  const vigente = /no cumplida|incumplida/i.test(estatus ?? "");
  if (!vigente && !inc.reprogramadaAt) return null;

  const quien =
    inc.origen === "CIERRE_JORNADA"
      ? `Cierre automático de la jornada${inc.limite ? ` (${horaMx(inc.limite)})` : ""}`
      : `Registrada por ${inc.registradoPor?.nombre ?? "un superior"}`;
  const pendientes = inc.pendientes.map((p) => p.nombre).join(", ");

  if (!vigente) {
    return (
      <Alert tone="warning" role="status" title={`No se cumplió el ${formatDateTime(inc.registradoAt)} y se reprogramó`}>
        {[
          inc.reprogramadaPara ? `Nueva fecha: ${formatDateTime(inc.reprogramadaPara)}` : null,
          inc.reprogramadaPor?.nombre ? `por ${inc.reprogramadaPor.nombre}` : null,
          inc.motivoReprogramacion ? `Motivo: ${inc.motivoReprogramacion}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Alert>
    );
  }

  return (
    <Alert tone="danger" role="status" title={`No cumplida · ${inc.causaEtiqueta}`}>
      <span>
        {quien} · {formatDateTime(inc.registradoAt)}
      </span>
      {pendientes ? (
        <>
          <br />
          <span>Pendiente de entrega: {pendientes}</span>
        </>
      ) : null}
      {inc.observaciones ? (
        <>
          <br />
          <span>Observaciones: {inc.observaciones}</span>
        </>
      ) : null}
    </Alert>
  );
}
