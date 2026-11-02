"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/base";
import { erpFetch } from "@/lib/erp-api";

type SalidaDeshecha = {
  id: number;
  salidaAt: string;
  motivo: string | null;
  por: string | null;
  propia: boolean;
  noCumplidas: Array<{ folio: string | null }> | null;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

/** La bitácora en la ficha: la checada ya no existe, pero se ve que hubo una y quién la deshizo. */
export default function SalidasDeshechas({ token, userId, fecha }: { token: string; userId: number; fecha: string }) {
  const [filas, setFilas] = useState<SalidaDeshecha[]>([]);

  useEffect(() => {
    let vigente = true;
    erpFetch<SalidaDeshecha[]>(`attendance/salidas-deshechas?userId=${userId}&fecha=${fecha}`, token)
      .then((r) => {
        if (vigente) setFilas(Array.isArray(r) ? r : []);
      })
      .catch(() => {
        if (vigente) setFilas([]);
      });
    return () => {
      vigente = false;
    };
  }, [token, userId, fecha]);

  if (!filas.length) return null;
  return (
    <>
      {filas.map((f) => {
        const folios = (f.noCumplidas ?? []).map((a) => a.folio).filter(Boolean);
        return (
          <Alert key={f.id} tone="info">
            Se deshizo una salida de las {hora(f.salidaAt)}: {f.propia ? "la misma persona" : (f.por ?? "su jefe")}
            {f.motivo ? `, «${f.motivo}»` : ""}.
            {folios.length ? ` Regresó de «No cumplida»: ${folios.join(", ")}.` : ""}
          </Alert>
        );
      })}
    </>
  );
}
