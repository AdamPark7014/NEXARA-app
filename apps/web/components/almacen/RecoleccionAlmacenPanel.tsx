"use client";

import { useCallback, useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
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
  if (p.vencido) return <Tag variant="danger" dot size="sm">Vencido</Tag>;
  if (p.horasRestantes == null) return <Tag variant="neutral" size="sm">Sin límite</Tag>;
  return (
    <Tag variant={p.horasRestantes <= 6 ? "warning" : "positive"} dot size="sm">
      {p.horasRestantes} h
    </Tag>
  );
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
      label: "OT",
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
    { key: "vigencia", label: "Vigencia", width: 96, render: (p) => vigencia(p) },
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
    <div style={{ display: "grid", gap: 10 }}>
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
          <Button variant="primary" onClick={() => void buscar()} loading={buscando} disabled={!codigo.trim()}>
            Verificar
          </Button>
        </div>

        {hallazgo && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${hallazgo.valido ? "var(--nx-panel-hairline)" : "color-mix(in srgb, var(--danger) 45%, var(--border))"}`,
              background: "var(--surface-2)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{hallazgo.solicitud.toolName}</strong>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
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
              <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
                {hallazgo.mensaje}
              </p>
            )}
            {hallazgo.valido && (
              <div>
                <Button
                  variant="primary"
                  size="sm"
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

      <Section title={cargando ? "Cargando…" : `${pendientes.length} por entregar`} flush>
        {error && (
          <div role="alert" style={{ margin: 16, fontSize: 12.5 }}>
            {error}{" "}
            <Button size="sm" variant="ghost" onClick={() => void cargar()}>
              Reintentar
            </Button>
          </div>
        )}
        <DataTable
          columns={columnas}
          rows={pendientes}
          rowKey={(p) => p.id}
          density="compact"
          emptyTitle="Nada por entregar"
          emptyDescription="Las aprobadas aparecen aquí con su código."
        />
      </Section>
    </div>
  );
}
