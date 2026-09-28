"use client";

/**
 * «Mi jornada»: dónde se checa.
 *
 * Por decisión del dueño se checa desde la app NEXARA (el navegador puede falsear su ubicación). Cuando
 * dirección abre la excepción temporal de la empresa (`attendance.web_checkin_until`), aquí aparece el
 * formulario de entrada/salida con cámara y se avisa hasta cuándo dura. Al vencer, se cierra sola.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { buildApiUrl } from "@/lib/api-base";

const AttendanceForm = dynamic(() => import("@/components/AttendanceForm"), { ssr: false });

export type VentanaWeb = { abierta: boolean; hasta: string | null };

export async function fetchVentanaWeb(token: string): Promise<VentanaWeb> {
  try {
    const res = await fetch(buildApiUrl("attendance/web-checkin"), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return { abierta: false, hasta: null };
    const data = (await res.json()) as Partial<VentanaWeb>;
    return { abierta: data.abierta === true, hasta: typeof data.hasta === "string" ? data.hasta : null };
  } catch {
    return { abierta: false, hasta: null };
  }
}

const formatoHasta = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function ChecarEnWeb({ token }: { token: string | null | undefined }) {
  const [ventana, setVentana] = useState<VentanaWeb | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    const consultar = () =>
      void fetchVentanaWeb(token).then((v) => {
        if (!cancelado) setVentana(v);
      });
    consultar();
    // Si la ventana se cierra mientras la pantalla está abierta, se entera sola.
    const id = window.setInterval(consultar, 5 * 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [token]);

  if (ventana?.abierta) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div
          role="status"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--state-warning-bg)",
            color: "var(--state-warning-text)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Checar desde la web está habilitado temporalmente</strong>
          {ventana.hasta ? ` (hasta el ${formatoHasta(ventana.hasta)})` : ""}. Tu checada queda marcada como hecha desde el
          navegador. Permite la cámara y la ubicación cuando el navegador te lo pida; si puedes, usa la app NEXARA.
        </div>
        <AttendanceForm compact />
      </div>
    );
  }

  return (
    <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
      Abre la app NEXARA en tu teléfono para registrar tu entrada o tu salida.
    </p>
  );
}
