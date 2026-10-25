"use client";

/**
 * Una actividad comercial **es** una cotización (contrato del viernes, D).
 *
 * Desde el detalle de la actividad: «Hacer cotización» la crea con ese cliente y las deja ligadas;
 * «Ligar cotización» conecta una que ya existe. La evidencia del levantamiento pasa a ser anexo de
 * la propuesta sin volver a subirla, así que no hay que adjuntar nada dos veces.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones."));
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
    const filas: { etiqueta: string; valor: ReactNode }[] = [
      {
        etiqueta: "Folio",
        valor: (
          <Link href={`/erp/cotizaciones/${cotizacion.id}`} style={{ fontWeight: 650 }}>
            {cotizacion.quoteNumber}
          </Link>
        ),
      },
      { etiqueta: "Estado", valor: estadoEnEspanol(cotizacion.status) },
    ];
    if (cotizacion.total != null) {
      filas.push({ etiqueta: "Total", valor: formatoMoneda(Number(cotizacion.total)) });
    }
    return (
      <>
        <dl className="cotiz-datos">
          {filas.map((fila) => (
            <div key={fila.etiqueta}>
              <dt>{fila.etiqueta}</dt>
              <dd>{fila.valor}</dd>
            </div>
          ))}
        </dl>
        <style>{`
          .cotiz-datos {
            display: grid;
            grid-template-columns: repeat(3, max-content);
            gap: 4px 28px;
            margin: 0;
          }
          .cotiz-datos > div { display: grid; gap: 2px; min-width: 0; }
          .cotiz-datos dt {
            margin: 0;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary, var(--ui-fg-3));
          }
          .cotiz-datos dd { margin: 0; font-size: 15px; font-weight: 650; }
          @media (max-width: 480px) {
            .cotiz-datos { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          }
        `}</style>
      </>
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
      setError(e instanceof Error ? e.message : "No se pudo ligar la cotización.");
    } finally {
      setLigando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13 }}>Sin cotización.</p>
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
              flex: "1 1 220px",
              width: "100%",
              maxWidth: 420,
              minWidth: 0,
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
