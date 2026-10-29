"use client";

/** Videovigilancia · editor de un diseño (plano 2D, cámaras, cobertura y vista por cámara). */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { Alert, Button, ButtonLink, EmptyState, Skeleton } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { obtenerDiseno, type Diseno } from "@/lib/cctv/api";
import EditorCctv from "../_editor/EditorCctv";

export default function DisenoCctvPage() {
  const { token } = useUser();
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [diseno, setDiseno] = useState<Diseno | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setError(null);
    try {
      setDiseno(await obtenerDiseno(token, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el diseño.");
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <div style={{ padding: "var(--ui-s6) var(--ui-s5)", display: "grid", gap: "var(--ui-s4)" }}>
        <EmptyState
          icon={<VideocamOutlinedIcon />}
          title="No se pudo abrir el diseño"
          description={error}
          tone="neutral"
          action={<ButtonLink href="/erp/videovigilancia">Volver a la lista</ButtonLink>}
          secondaryAction={<Button onClick={() => void cargar()}>Reintentar</Button>}
        />
      </div>
    );
  }
  if (!diseno || !token) {
    return (
      <div style={{ padding: "var(--ui-s5)", display: "grid", gap: "var(--ui-s4)" }}>
        <Skeleton height={96} />
        <Skeleton height={560} />
        {!token ? <Alert tone="info">Iniciando sesión…</Alert> : null}
      </div>
    );
  }
  return <EditorCctv key={diseno.id} diseno={diseno} token={token} onRecargar={cargar} />;
}
