"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => <p style={{ margin: 0, fontSize: 13, color: "var(--ui-fg-3)" }}>Cargando visor…</p>,
});

/**
 * La propuesta en PDF de una cotización, abierta dentro de la actividad (pedido de Adam, 29-10:
 * «que se vea embebida, que se vea abierta, como las cotizaciones»). Se baja con la sesión
 * (`GET cotizaciones/:id/pdf`) y se dibuja con el visor pdf.js de la web: la CSP no deja `<object>`
 * ni el visor de Chrome en iframe. Sin permiso de cotizaciones o sin PDF, solo se avisa.
 */
export default function PropuestaEmbebida({
  cotizacionId,
  quoteNumber,
  token,
}: {
  cotizacionId: number;
  quoteNumber: string;
  token: string | null | undefined;
}) {
  const [estado, setEstado] = useState<{ datos: Uint8Array | null; error: string | null }>({ datos: null, error: null });
  const ruta = buildApiUrl(`cotizaciones/${cotizacionId}/pdf`);

  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, error: null });
    void (async () => {
      try {
        const res = await fetch(ruta, {
          credentials: "include",
          headers: withTenantHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
        });
        if (res.status === 403) throw new Error("No tienes acceso a cotizaciones: ábrela desde el enlace si te lo dan.");
        if (!res.ok) throw new Error("No se pudo generar la propuesta en PDF.");
        const datos = new Uint8Array(await res.arrayBuffer());
        if (vivo) setEstado({ datos, error: null });
      } catch (e) {
        if (vivo) setEstado({ datos: null, error: e instanceof Error ? e.message : "No se pudo abrir la propuesta." });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ruta, token]);

  if (estado.error) return <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ui-fg-3)" }}>{estado.error}</p>;
  if (!estado.datos) return <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ui-fg-3)" }}>Abriendo la propuesta…</p>;
  return (
    <div style={{ marginTop: 10 }}>
      <PDFViewer pdfUrl={ruta} pdfData={estado.datos} fileName={`${quoteNumber}.pdf`} height="620px" />
    </div>
  );
}
