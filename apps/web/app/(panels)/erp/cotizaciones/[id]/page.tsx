"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { obtenerCotizacion, type CotizacionDetalle } from "@/lib/cotizaciones-api";
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
      setError(e instanceof Error ? e.message : "No se pudo cargar la cotización");
    } finally {
      setCargando(false);
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (detalle) return <EditorCotizacion key={detalle.id} inicial={detalle} />;

  return (
    <div className={styles.wrap}>
      <Link className={styles.migas} href="/erp/cotizaciones">
        ← Cotizaciones
      </Link>
      {cargando ? (
        <div className={styles.esqueleto} aria-busy="true" aria-label="Cargando la cotización">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className={styles.errorBox} role="alert">
          {error ?? "No se encontró la cotización."}{" "}
          <button type="button" className={styles.linkBtn} onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
