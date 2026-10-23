"use client";

/**
 * Permiso del micrófono, igual que el de notificaciones (Adam, 23-10-2026): «cuando lo requiere
 * debe poder solicitarlo como notificaciones».
 *
 * `navigator.permissions.query({ name: 'microphone' })` dice si ya se dio (`granted`), si el
 * navegador va a preguntar (`prompt`) o si se negó (`denied`), y avisa cuando cambia. Donde no
 * existe para el micrófono (Safari viejo) queda `desconocido` y se pide directo con `getUserMedia`.
 */
import { useCallback, useEffect, useState } from "react";

export type EstadoPermiso = "granted" | "prompt" | "denied" | "desconocido";

export const estadoDePermiso = (valor: unknown): EstadoPermiso =>
  valor === "granted" || valor === "prompt" || valor === "denied" ? valor : "desconocido";

export async function consultarPermisoMicrofono(): Promise<{ estado: EstadoPermiso; status: PermissionStatus | null }> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return { estado: estadoDePermiso(status.state), status };
  } catch {
    return { estado: "desconocido", status: null };
  }
}

/** Pide el permiso en el toque del botón (abre el aviso del navegador) y suelta el micrófono. */
export async function pedirPermisoMicrofono(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export function usePermisoMicrofono() {
  const [estado, setEstado] = useState<EstadoPermiso>("desconocido");

  const reconsultar = useCallback(async () => {
    const r = await consultarPermisoMicrofono();
    setEstado(r.estado);
    return r.estado;
  }, []);

  useEffect(() => {
    let vivo = true;
    let status: PermissionStatus | null = null;
    const alCambiar = () => {
      if (vivo && status) setEstado(estadoDePermiso(status.state));
    };
    void consultarPermisoMicrofono().then((r) => {
      if (!vivo) return;
      status = r.status;
      setEstado(r.estado);
      status?.addEventListener?.("change", alCambiar);
    });
    return () => {
      vivo = false;
      status?.removeEventListener?.("change", alCambiar);
    };
  }, []);

  return { estado, reconsultar };
}
