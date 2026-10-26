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
        <Renglones
          lineas={[
            inc.reprogramadaPara ? `Nueva fecha: ${formatDateTime(inc.reprogramadaPara)}` : null,
            inc.reprogramadaPor?.nombre ? `Reprogramada por ${inc.reprogramadaPor.nombre}` : null,
            inc.motivoReprogramacion ? `Motivo: ${inc.motivoReprogramacion}` : null,
          ]}
        />
      </Alert>
    );
  }

  return (
    <Alert tone="danger" role="status" title="No cumplida">
      <Renglones
        lineas={[
          inc.causaEtiqueta,
          quien,
          formatDateTime(inc.registradoAt),
          pendientes ? `Pendiente de entrega: ${pendientes}` : null,
          inc.observaciones ? `Observaciones: ${inc.observaciones}` : null,
        ]}
      />
    </Alert>
  );
}

/** Cada dato en su propio renglón. Un `<span>` porque el aviso vive dentro de otro. */
function Renglones({ lineas }: { lineas: Array<string | null | false | undefined> }) {
  const visibles = lineas.filter((linea): linea is string => Boolean(linea));
  if (!visibles.length) return null;
  return visibles.map((linea, i) => (
    <span key={i} style={{ display: "block" }}>
      {linea}
    </span>
  ));
}
