"use client";

import { useCallback, useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusDot from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  buscarPorCodigoDeRecoleccion,
  entregarConCodigo,
  listarPendientesDeRecoleccion,
  type BusquedaPickup,
  type PendienteDeRecoleccion,
} from "@/lib/almacen-api";
import InfoBreve from "./InfoBreve";

const INFO =
  "Código de 6 caracteres (48 h). Teclea aquí para entregar; queda quién y cuándo.";

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  font: "inherit",
  fontSize: 14,
};

function vigencia(p: { vencido: boolean; horasRestantes: number | null }) {
  if (p.vencido) return <StatusDot tone="danger" label="Caducó" title="Hay que volver a pedirla" />;
  if (p.horasRestantes == null) return <StatusDot label="Sin caducidad" />;
  if (p.horasRestantes <= 6) {
    return <StatusDot tone="warning" label={`Caduca en ${p.horasRestantes} h`} />;
  }
  return <StatusDot label={`${p.horasRestantes} h`} />;
}

/**
 * Mostrador del almacén: teclea el código, verifica y entrega.
 *
 * La lista de abajo es lo que espera ser recogido; el buscador de arriba es el flujo
 * real, porque el técnico llega diciendo su código, no el folio de su solicitud.
 */
export default function RecoleccionAlmacenPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [pendientes, setPendientes] = useState<PendienteDeRecoleccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgo, setHallazgo] = useState<BusquedaPickup | null>(null);
  const [entregando, setEntregando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setPendientes(await listarPendientesDeRecoleccion(token));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar lo pendiente de entregar"));
      setPendientes([]);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const buscar = async () => {
    const limpio = codigo.trim();
    if (!token || !limpio) return;
    setBuscando(true);
    setHallazgo(null);
    try {
      setHallazgo(await buscarPorCodigoDeRecoleccion(token, limpio));
    } catch (e) {
      toast.error(formatApiError(e, "No se encontró el código"));
    } finally {
      setBuscando(false);
    }
  };

  const entregar = async (toolRequestId: number, pickupCode: string, recogidaPorId?: number) => {
    if (!token) return;
    setEntregando(true);
    try {
      await entregarConCodigo(token, toolRequestId, { pickupCode, recogidaPorId });
      toast.success("Herramienta entregada");
      setHallazgo(null);
      setCodigo("");
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo entregar la herramienta"));
    } finally {
      setEntregando(false);
    }
  };

  const columnas: Column<PendienteDeRecoleccion>[] = [
    {
      key: "codigo",
      label: "Código",
      width: 92,
      render: (p) => (
        <strong style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, letterSpacing: "0.06em" }}>
          {p.pickupCode ?? "—"}
        </strong>
      ),
    },
    {
      key: "herramienta",
      label: "Herramienta",
      width: 220,
      render: (p) => (
        <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 12.5 }}>{p.toolName}</strong>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {p.model} · {p.serialNumber}
          </span>
        </div>
      ),
    },
    { key: "quien", label: "Para", width: 150, accessor: (p) => p.usuario?.nombre ?? "—" },
    {
      key: "ot",
      label: "Actividad",
      width: 150,
      render: (p) =>
        p.activity ? (
          <span style={{ fontSize: 11.5 }} title={p.activity.titulo}>
            {p.activity.anNumber}
          </span>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>Préstamo suelto</span>
        ),
    },
    { key: "vigencia", label: "Código válido", width: 132, render: (p) => vigencia(p) },
    {
      key: "acciones",
      label: "",
      width: 96,
      render: (p) => (
        <Button
          size="sm"
          variant="secondary"
          disabled={p.vencido || !p.pickupCode || entregando}
          onClick={() => void entregar(p.id, p.pickupCode ?? "", p.usuario?.id)}
        >
          Entregar
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Section
        title="Entregar con código"
        actions={<InfoBreve etiqueta="Código de recolección" texto={INFO} />}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void buscar();
            }}
            placeholder="A3F7KD"
            aria-label="Código de recolección"
            maxLength={10}
            style={{
              ...inp,
              width: 160,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          />
          {/* Mientras no hay hallazgo, verificar es la acción a la que vino;
              en cuanto lo hay, el primario pasa a la entrega y este baja a gris. */}
          <Button
            variant={hallazgo?.valido ? "secondary" : "primary"}
            onClick={() => void buscar()}
            loading={buscando}
            disabled={!codigo.trim()}
          >
            Verificar
          </Button>
        </div>

        {hallazgo && (
          // Sin recuadro: los datos de la solicitud se separan del buscador con
          // aire, y lo que sí necesita caja es el motivo del rechazo.
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{hallazgo.solicitud.toolName}</strong>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {hallazgo.solicitud.model} · {hallazgo.solicitud.serialNumber}
              </span>
              {vigencia(hallazgo.solicitud)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Para {hallazgo.solicitud.usuario?.nombre ?? "—"}
              {hallazgo.solicitud.activity
                ? ` · ${hallazgo.solicitud.activity.anNumber} ${hallazgo.solicitud.activity.titulo}`
                : " · préstamo suelto"}
            </div>
            {!hallazgo.valido && hallazgo.mensaje && (
              <InlineAlert variant="danger" message={hallazgo.mensaje} />
            )}
            {hallazgo.valido && (
              <div>
                <Button
                  variant="primary"
                  loading={entregando}
                  onClick={() =>
                    void entregar(
                      hallazgo.solicitud.id,
                      hallazgo.solicitud.pickupCode ?? codigo,
                      hallazgo.solicitud.usuario?.id,
                    )
                  }
                >
                  Entregar herramienta
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Esperando a que las recojan"
        subtitle={
          pendientes.length > 0
            ? `${pendientes.length} herramienta${pendientes.length === 1 ? "" : "s"}, ${pendientes.filter((p) => p.vencido).length} con el código caducado`
            : undefined
        }
        flush
      >
        {error && (
          <div style={{ marginBottom: 12 }}>
            <InlineAlert
              variant="danger"
              message={error}
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        )}
        {cargando && pendientes.length === 0 ? (
          <p role="status" style={{ margin: 0, padding: "24px 0", fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Cargando…
          </p>
        ) : (
          <DataTable
            columns={columnas}
            rows={pendientes}
            rowKey={(p) => p.id}
            density="compact"
            emptyTitle="Nadie tiene nada que recoger"
            emptyDescription="Cuando se apruebe un préstamo, la herramienta aparecerá aquí con el código que trae quien viene por ella."
          />
        )}
      </Section>
    </div>
  );
}
