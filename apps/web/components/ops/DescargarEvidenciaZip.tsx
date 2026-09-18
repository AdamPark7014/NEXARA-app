"use client";

import { useState } from "react";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { descargarEvidenciaZip, esErrorDePermiso, nombreZipPorOmision } from "@/lib/evidencia-campos";

type Props = {
  activityId: number;
  anNumber?: string | null;
  titulo?: string | null;
  size?: "sm" | "md";
};

/**
 * «Descargar evidencia (carpeta .zip)»: Proyecto / AN-xxxx Actividad / <Campo> / fotos,
 * más entrada, salida, hoja de servicio y `resumen.txt`. Se baja con la sesión.
 */
export default function DescargarEvidenciaZip({ activityId, anNumber, titulo, size = "sm" }: Props) {
  const { token } = useUser();
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const descargar = async () => {
    if (!token || descargando) return;
    setDescargando(true);
    setError(null);
    setListo(null);
    try {
      const nombre = await descargarEvidenciaZip(token, activityId, nombreZipPorOmision(anNumber, titulo, activityId));
      setListo(`Descargada: ${nombre}`);
    } catch (e) {
      setError(
        esErrorDePermiso(e)
          ? "No tienes permiso para descargar la evidencia de esta actividad."
          : formatApiError(e, "No se pudo descargar la evidencia. Intenta de nuevo."),
      );
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <Button
        size={size}
        variant="secondary"
        onClick={() => void descargar()}
        loading={descargando}
        iconLeft={<FolderZipOutlinedIcon fontSize="inherit" />}
      >
        {descargando ? "Preparando carpeta…" : "Descargar evidencia (carpeta .zip)"}
      </Button>
      <span aria-live="polite" style={{ fontSize: 12, color: error ? "var(--danger)" : "var(--text-tertiary)" }}>
        {error ?? listo ?? ""}
      </span>
    </div>
  );
}
