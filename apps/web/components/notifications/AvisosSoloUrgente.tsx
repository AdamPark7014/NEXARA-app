"use client";

/**
 * Preferencia «Solo lo urgente»: con ella activa, el servidor deja de generar los avisos informativos de esa persona
 * (asistencias, evidencias enviadas, «se creó…») y le siguen llegando el resumen de cada mañana y lo que pide su
 * decisión o es urgente (`apps/api/src/notifications/notification-noise.ts`).
 *
 * Vive en Notificaciones porque es un ajuste de avisos: antes era una casilla al pie de «Tu día» y se leía como si
 * marcara algo de la lista.
 */
import { useEffect, useState } from "react";
import { Switch } from "@/components/base/campos";
import { buildApiUrl } from "@/lib/api-base";

/** Clave de la preferencia (la misma que lee la API). */
export const PREF_SOLO_RESUMEN = "notificaciones.solo_resumen";

async function leer(token: string): Promise<boolean> {
  const res = await fetch(buildApiUrl(`user-preferences/${encodeURIComponent(PREF_SOLO_RESUMEN)}`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return false;
  const valor = (await res.text().catch(() => "")).trim().replace(/^"|"$/g, "").toLowerCase();
  return valor === "1" || valor === "true";
}

async function guardar(token: string, activo: boolean): Promise<void> {
  const res = await fetch(buildApiUrl("user-preferences"), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key: PREF_SOLO_RESUMEN, value: activo ? "1" : "0" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export default function AvisosSoloUrgente({ token }: { token: string | null | undefined }) {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    leer(token)
      .then((v) => !cancelado && setActivo(v))
      .catch(() => !cancelado && setActivo(false));
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (!token || activo === null) return null;

  const cambiar = (valor: boolean) => {
    const anterior = activo;
    setActivo(valor); // se ve al instante; si no se guarda, vuelve a como estaba
    setError(false);
    guardar(token, valor).catch(() => {
      setActivo(anterior);
      setError(true);
    });
  };

  return (
    <div>
      <Switch
        checked={activo}
        onChange={(e) => cambiar(e.target.checked)}
        label="Recibir solo lo urgente"
        description="Dejan de llegarte los avisos informativos (asistencias, evidencias enviadas, «se creó…»). Te siguen llegando el resumen de cada mañana y lo que necesita tu decisión."
      />
      {error ? (
        <p role="alert" style={{ marginTop: 8, fontSize: 13, color: "var(--danger)" }}>
          No se pudo guardar. Intenta de nuevo.
        </p>
      ) : null}
    </div>
  );
}
