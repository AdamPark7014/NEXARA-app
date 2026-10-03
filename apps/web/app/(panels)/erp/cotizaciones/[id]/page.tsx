"use client";

import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Button, ButtonLink, SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { obtenerCotizacion, type CotizacionDetalle } from "@/lib/cotizaciones-api";
import { formatApiError } from "@/lib/erp-api";
import EditorCotizacion from "../_editor/EditorCotizacion";
import styles from "../cotizaciones-core.module.css";

/** Una cotización de Core: se abre directo en el editor que refleja la propuesta técnica. */
export default function CotizacionDetallePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { token } = useUser();
  const [detalle, setDetalle] = useState<CotizacionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setCargando(true);
    setError(null);
    try {
      setDetalle(await obtenerCotizacion(token, id));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la cotización"));
    } finally {
      setCargando(false);
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (detalle) return <EditorCotizacion key={detalle.id} inicial={detalle} />;

  return (
    <div className={styles.carga}>
      <ButtonLink className={styles.cargaVolver} variant="ghost" size="sm" href="/erp/cotizaciones" iconStart={<ArrowBackRoundedIcon />}>
        Cotizaciones
      </ButtonLink>
      {cargando ? (
        <div className={styles.cargaTarjeta}>
          <SkeletonRows rows={4} label="Cargando la cotización" />
        </div>
      ) : (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {error ?? "No se encontró la cotización."}
        </Alert>
      )}
    </div>
  );
}
