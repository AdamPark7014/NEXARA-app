"use client";

/**
 * Una actividad comercial **es** una cotización (contrato del viernes, D).
 *
 * Desde el detalle de la actividad: «Hacer cotización» la crea con ese cliente y las deja ligadas;
 * «Ligar cotización» conecta una que ya existe. La evidencia del levantamiento pasa a ser anexo de
 * la propuesta sin volver a subirla, así que no hay que adjuntar nada dos veces.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import {
  ESTADO_LABEL,
  formatoMoneda,
  ligarActividadACotizacion,
  listarCotizaciones,
  type CotizacionRow,
  type EstadoCotizacion,
} from "@/lib/cotizaciones-api";

export type CotizacionLigada = {
  id: number;
  quoteNumber: string;
  status?: string | null;
  total?: number | string | null;
  segmento?: string | null;
};

const estadoEnEspanol = (status?: string | null): string => {
  const mapa: Record<string, EstadoCotizacion> = {
    DRAFT: "BORRADOR",
    SENT: "ENVIADA",
    APPROVED: "APROBADA",
    REJECTED: "RECHAZADA",
    EXPIRED: "VENCIDA",
  };
  const estado = mapa[String(status ?? "").toUpperCase()];
  return estado ? ESTADO_LABEL[estado] : "Borrador";
};

export default function CotizacionDeActividad({
  activityId,
  coreKind,
  cotizacion,
  onLigada,
}: {
  activityId: number;
  coreKind?: string | null;
  cotizacion?: CotizacionLigada | null;
  onLigada?: () => void;
}) {
  const { token } = useUser();
  const esComercial = String(coreKind ?? "").toLowerCase() === "comercial";

  const [eligiendo, setEligiendo] = useState(false);
  const [opciones, setOpciones] = useState<CotizacionRow[]>([]);
  const [elegida, setElegida] = useState("");
  const [ligando, setLigando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eligiendo || !token) return;
    let vivo = true;
    listarCotizaciones(token)
      .then((rows) => vivo && setOpciones(rows))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar"));
    return () => {
      vivo = false;
    };
  }, [eligiendo, token]);

  const disponibles = useMemo(
    () => opciones.filter((row) => !(row.actividades ?? []).some((a) => a.id === activityId)),
    [opciones, activityId],
  );

  if (!esComercial) return null;

  if (cotizacion?.id) {
    return (
      <p style={{ margin: 0, fontSize: 13 }}>
        Cotización{" "}
        <Link href={`/erp/cotizaciones/${cotizacion.id}`} style={{ fontWeight: 700 }}>
          {cotizacion.quoteNumber}
        </Link>{" "}
        · {estadoEnEspanol(cotizacion.status)}
        {cotizacion.total != null ? ` · ${formatoMoneda(Number(cotizacion.total))}` : ""}
        <br />
        <span style={{ color: "var(--text-secondary)" }}>
          Las fotos del levantamiento de esta actividad salen como anexos (03 Planos) de la propuesta.
        </span>
      </p>
    );
  }

  async function ligar() {
    if (!token || !elegida) return;
    setLigando(true);
    setError(null);
    try {
      await ligarActividadACotizacion(token, Number(elegida), activityId);
      setEligiendo(false);
      onLigada?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ligar");
    } finally {
      setLigando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
        Esta actividad es comercial: su entregable es una cotización, no una hoja de servicio.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Link
          href={`/erp/cotizaciones/nueva?activityId=${activityId}`}
          style={{
            background: "var(--primary)",
            color: "#fff",
            borderRadius: 10,
            padding: "0.5rem 0.85rem",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Hacer cotización
        </Link>
        <button
          type="button"
          onClick={() => setEligiendo((v) => !v)}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "inherit",
            borderRadius: 10,
            padding: "0.5rem 0.85rem",
            fontSize: 13,
            fontWeight: 650,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Ligar cotización
        </button>
      </div>

      {eligiendo ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select
            value={elegida}
            onChange={(e) => setElegida(e.target.value)}
            style={{
              padding: "0.5rem 0.6rem",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "inherit",
              fontSize: 13,
              minWidth: 260,
            }}
          >
            <option value="">Elige una cotización…</option>
            {disponibles.map((row) => (
              <option key={row.id} value={row.id}>
                {row.folio} · {row.clienteNombre ?? "sin cliente"} · {row.estadoEtiqueta}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void ligar()}
            disabled={!elegida || ligando}
            style={{
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "0.5rem 0.85rem",
              fontSize: 13,
              fontWeight: 700,
              cursor: elegida ? "pointer" : "not-allowed",
              opacity: elegida ? 1 : 0.6,
              fontFamily: "inherit",
            }}
          >
            {ligando ? "Ligando…" : "Ligar"}
          </button>
        </div>
      ) : null}

      {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>{error}</p> : null}
    </div>
  );
}
