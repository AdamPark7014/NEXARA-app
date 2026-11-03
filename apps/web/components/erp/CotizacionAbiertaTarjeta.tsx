"use client";

/**
 * En el detalle de la actividad: a quien la trabaja le lleva a su cotización abierta; a quien la abrió le
 * enseña la bitácora y le deja cerrarla. Sin cotización abierta no se pinta nada.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/base";
import { toast } from "@/components/Toast";
import { cerrarCotizacionAbierta, leerCotizacionAbierta, type CotizacionAbierta } from "@/lib/cotizacion-abierta-api";
import { formatApiError } from "@/lib/erp-api";

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function CotizacionAbiertaTarjeta({ activityId, token }: { activityId: number; token: string }) {
  const [a, setA] = useState<CotizacionAbierta | null>(null);

  useEffect(() => {
    let vigente = true;
    leerCotizacionAbierta(token, activityId)
      .then((d) => {
        if (vigente) setA(d);
      })
      .catch(() => {
        /* Sin ruta o sin acceso: esta tarjeta no estorba. */
      });
    return () => {
      vigente = false;
    };
  }, [activityId, token]);

  if (!a) return null;
  const cierre =
    a.estado === "revocado" ? "Se cerró porque se la quitaron." : a.estado === "terminada" ? "Se cerró al terminar la actividad." : null;

  return (
    <section aria-label="Cotización abierta" style={{ display: "grid", gap: 8, padding: "12px 14px", border: "1px solid var(--ui-border)", borderRadius: 14, background: "var(--ui-surface)" }}>
      <strong>
        {a.soyQuienLaTrabaja ? "Te abrieron esta cotización" : `Cotización abierta a ${a.para}`}: {a.folio}
      </strong>
      <span style={{ fontSize: 13, color: "var(--ui-fg-2)" }}>
        {[a.titulo, a.cliente].filter(Boolean).join(" · ")}
      </span>
      <span style={{ fontSize: 13, color: "var(--ui-fg-2)" }}>
        {cierre ??
          (a.soyQuienLaTrabaja
            ? `Solo esta, hasta que termines la actividad. Te la abrió ${a.otorgadoPor}.`
            : `La abrió ${a.otorgadoPor} el ${cuando(a.otorgadoAt)}.`)}{" "}
        {a.cambios > 0 ? `${a.cambios} ${a.cambios === 1 ? "cambio" : "cambios"}, el último el ${cuando(a.ultimoCambioAt as string)}.` : "Sin cambios todavía."}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {a.puedeEditar ? (
          <Link href={`/erp/actividades/${activityId}/cotizacion`} style={{ fontWeight: 600, color: "var(--ui-primary)" }}>
            Abrir la cotización
          </Link>
        ) : null}
        {a.puedeCerrar ? (
          <Button
            variant="tertiary"
            onClick={async () => {
              try {
                setA(await cerrarCotizacionAbierta(token, activityId));
                toast.success("Le cerraste el acceso a la cotización");
              } catch (e) {
                toast.error(formatApiError(e, "No se pudo cerrar"));
              }
            }}
          >
            Cerrarle el acceso
          </Button>
        ) : null}
      </div>
    </section>
  );
}
