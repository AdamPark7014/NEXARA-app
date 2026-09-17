"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  SEGMENTOS,
  SEGMENTO_LABEL,
  formatoFecha,
  formatoMoneda,
  listarCotizaciones,
  type CotizacionRow,
  type EstadoCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";
import styles from "./cotizaciones-core.module.css";

function chipClase(estado: EstadoCotizacion) {
  const tono = ESTADO_TONO[estado];
  if (tono === "info") return `${styles.chip} ${styles.chipInfo}`;
  if (tono === "ok") return `${styles.chip} ${styles.chipOk}`;
  if (tono === "alerta") return `${styles.chip} ${styles.chipAlerta}`;
  return styles.chip;
}

/** «LJ · JA · CE» — quién intervino, en orden. */
function cadena(row: CotizacionRow): string {
  const siglas = row.intervinieron.map((p) => p.siglas).filter(Boolean);
  return [...new Set(siglas)].join(" · ") || "—";
}

export default function CotizacionesPage() {
  const { token } = useUser();
  const [items, setItems] = useState<CotizacionRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState<Segmento | null>(null);
  const [estado, setEstado] = useState<EstadoCotizacion | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setItems(await listarCotizaciones(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return items.filter((row) => {
      if (segmento && row.segmento !== segmento) return false;
      if (estado && row.estado !== estado) return false;
      if (!texto) return true;
      return (
        row.folio.toLowerCase().includes(texto) ||
        (row.clienteNombre ?? "").toLowerCase().includes(texto) ||
        (row.clienteEmpresa ?? "").toLowerCase().includes(texto) ||
        (row.elaboro?.nombre ?? "").toLowerCase().includes(texto)
      );
    });
  }, [items, q, segmento, estado]);

  const total = useMemo(
    () => visibles.reduce((acc, row) => acc + Number(row.total || 0), 0),
    [visibles],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Cotizaciones</h1>
          <p className={styles.sub}>
            El folio lo emite el servidor con tu nomenclatura: dice de quién es y cuántas lleva.
          </p>
        </div>
        <Link className={styles.primaryBtn} href="/erp/cotizaciones/nueva">
          Nueva
        </Link>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar folio, cliente o quién la hizo…"
          aria-label="Buscar cotizaciones"
        />
      </div>

      <div className={styles.filters} role="group" aria-label="Segmento">
        <button
          type="button"
          className={`${styles.filterBtn} ${segmento === null ? styles.filterBtnOn : ""}`}
          onClick={() => setSegmento(null)}
        >
          Todos
        </button>
        {SEGMENTOS.map((s) => (
          <button
            key={s}
            type="button"
            className={`${styles.filterBtn} ${segmento === s ? styles.filterBtnOn : ""}`}
            onClick={() => setSegmento(segmento === s ? null : s)}
          >
            {SEGMENTO_LABEL[s]}
          </button>
        ))}
      </div>

      <div className={styles.filters} role="group" aria-label="Estado">
        {ESTADOS.map((e) => (
          <button
            key={e}
            type="button"
            className={`${styles.filterBtn} ${estado === e ? styles.filterBtnOn : ""}`}
            onClick={() => setEstado(estado === e ? null : e)}
          >
            {ESTADO_LABEL[e]}
          </button>
        ))}
      </div>

      <div className={styles.metaRow}>
        <span>Folio · cliente · segmento · estado · total · quién intervino</span>
        <span>
          {cargando ? "…" : `${visibles.length} · ${formatoMoneda(total)}`}
        </span>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {cargando ? (
        <p className={styles.sub}>Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className={styles.empty}>
          Todavía no hay cotizaciones con estos filtros.{" "}
          <Link href="/erp/cotizaciones/nueva">Crear la primera</Link>
        </div>
      ) : (
        <div className={styles.list}>
          {visibles.map((row) => (
            <Link key={row.id} href={`/erp/cotizaciones/${row.id}`} className={styles.row}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.folio}>{row.folio}</div>
                <div className={styles.rowSub}>
                  {formatoFecha(row.issueDate)}
                  {row.revision && row.revision > 1 ? ` · R${row.revision}` : ""}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className={styles.rowSub} style={{ fontWeight: 650, color: "inherit" }}>
                  {row.clienteNombre || row.clienteEmpresa || "Sin cliente"}
                </div>
                <div className={styles.rowSub}>{row.segmentoEtiqueta}</div>
              </div>
              <span className={chipClase(row.estado)}>{row.estadoEtiqueta}</span>
              <div className={styles.importe}>{formatoMoneda(row.total, row.currency ?? "MXN")}</div>
              <div className={styles.rowSub} title="Quién intervino">
                {cadena(row)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
