"use client";

/**
 * «Mi jornada»: dónde se checa.
 *
 * Por decisión del dueño se checa desde la app NEXARA (el navegador puede falsear su ubicación). Cuando
 * dirección abre la excepción temporal de la empresa (`attendance.web_checkin_until`), aquí aparece el
 * formulario de entrada/salida con cámara y se avisa hasta cuándo dura. Al vencer, se cierra sola y lo dice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import PhoneIphoneOutlinedIcon from "@mui/icons-material/PhoneIphoneOutlined";
import { Alert } from "@/components/base";
import { buildApiUrl } from "@/lib/api-base";
import s from "./asistencia-confiable.module.css";

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
  new Date(iso).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

/** `setTimeout` no aguanta más de ~24 días; más allá basta con la consulta periódica. */
const MAX_ESPERA_MS = 2_000_000_000;

export default function ChecarEnWeb({ token }: { token: string | null | undefined }) {
  const [ventana, setVentana] = useState<VentanaWeb | null>(null);
  // Si estaba abierta y se cerró con la pantalla abierta, se avisa en lugar de desaparecer sin más.
  const [vencida, setVencida] = useState(false);
  const abiertaRef = useRef(false);

  const aplicar = useCallback((v: VentanaWeb) => {
    if (abiertaRef.current && !v.abierta) setVencida(true);
    if (v.abierta) setVencida(false);
    abiertaRef.current = v.abierta;
    setVentana(v);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    const consultar = () =>
      void fetchVentanaWeb(token).then((v) => {
        if (!cancelado) aplicar(v);
      });
    consultar();
    // Si la ventana se cierra mientras la pantalla está abierta, se entera sola.
    const id = window.setInterval(consultar, 5 * 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [token, aplicar]);

  // Y justo a la hora en que vence, vuelve a preguntar (sin esperar los 5 minutos).
  useEffect(() => {
    if (!token || !ventana?.abierta || !ventana.hasta) return;
    const falta = new Date(ventana.hasta).getTime() - Date.now();
    if (!Number.isFinite(falta) || falta > MAX_ESPERA_MS) return;
    let cancelado = false;
    const id = window.setTimeout(
      () =>
        void fetchVentanaWeb(token).then((v) => {
          if (!cancelado) aplicar(v);
        }),
      Math.max(0, falta) + 1_000,
    );
    return () => {
      cancelado = true;
      window.clearTimeout(id);
    };
  }, [token, ventana, aplicar]);

  if (ventana?.abierta) {
    return (
      <div className={s.checar}>
        <Alert tone="warning" role="status" title="Checar desde la web está habilitado temporalmente">
          {ventana.hasta ? `Abierto hasta el ${formatoHasta(ventana.hasta)}. ` : ""}Tu checada queda marcada como hecha desde el
          navegador. Permite la cámara y la ubicación cuando el navegador te lo pida; si puedes, usa la app NEXARA.
        </Alert>
        <AttendanceForm compact />
      </div>
    );
  }

  if (vencida) {
    return (
      <Alert tone="info" title="Terminó el permiso para checar desde la web">
        Abre la app NEXARA en tu teléfono para registrar tu entrada o tu salida.
      </Alert>
    );
  }

  return (
    <p className={s.usaLaApp}>
      <PhoneIphoneOutlinedIcon fontSize="inherit" aria-hidden="true" />
      Abre la app NEXARA en tu teléfono para registrar tu entrada o tu salida.
    </p>
  );
}
