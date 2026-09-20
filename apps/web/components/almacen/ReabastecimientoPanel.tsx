"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusDot from "@/components/ui/StatusDot";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  listarReabastecimiento,
  recalcularReabastecimiento,
  type RenglonReabastecimiento,
} from "@/lib/almacen-api";
import { cantidadLegible, pluralEmpaque } from "@/lib/empaque";
import InfoBreve from "./InfoBreve";

const INFO =
  "El mínimo sale del consumo real de los últimos 90 días por los días que tarda el proveedor en entregar, más los días de seguridad. La cantidad sugerida ya viene subida al empaque y a la compra mínima. Solo aplica a material marcado como circulante.";

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function toneCobertura(dias: number | null): "danger" | "warning" | "neutral" {
  if (dias == null) return "neutral";
  if (dias <= 2) return "danger";
  if (dias <= 7) return "warning";
  return "neutral";
}

/** Los días de cobertura no se comunican solo con color: la palabra lo dice. */
function cobertura(dias: number | null): { tono: "danger" | "warning" | "neutral"; texto: string } {
  const tono = toneCobertura(dias);
  if (dias == null) return { tono, texto: "Sin dato" };
  if (tono === "danger") return { tono, texto: `Se acaba en ${cantidadLegible(dias)} d` };
  if (tono === "warning") return { tono, texto: `${cantidadLegible(dias)} d, poco` };
  return { tono, texto: `${cantidadLegible(dias)} d` };
}

/**
 * «Reabastecimiento»: qué comprar y cuánto.
 *
 * Lo urgente arriba (menos días de cobertura primero). Por defecto solo lo que tocó el
 * mínimo; el interruptor enseña todo el material circulante para revisar parámetros.
 */
export default function ReabastecimientoPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [filas, setFilas] = useState<RenglonReabastecimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setFilas(await listarReabastecimiento(token, { todos }));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar el reabastecimiento"));
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [token, todos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recalcular = async () => {
    if (!token) return;
    setRecalculando(true);
    try {
      const res = await recalcularReabastecimiento(token);
      toast.success(`${res.recalculados} renglones recalculados`);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo recalcular"));
    } finally {
      setRecalculando(false);
    }
  };

  const porComprar = useMemo(() => filas.filter((f) => f.reponer).length, [filas]);
  const ultimoCalculo = useMemo(
    () => filas.map((f) => f.calculadoAt).filter(Boolean).sort().at(-1) ?? null,
    [filas],
  );
  const seAcaba = useMemo(
    () => filas.filter((f) => f.diasDeCobertura != null && f.diasDeCobertura <= 2).length,
    [filas],
  );
  const aprietan = useMemo(
    () =>
      filas.filter(
        (f) => f.diasDeCobertura != null && f.diasDeCobertura > 2 && f.diasDeCobertura <= 7,
      ).length,
    [filas],
  );

  const cifras: Metric[] = [
    { label: "por comprar", value: porComprar, hint: "llegaron a su mínimo" },
    {
      label: "se acaban ya",
      value: seAcaba,
      hint: "2 días o menos",
      tone: seAcaba > 0 ? "danger" : "default",
    },
    {
      label: "aprietan",
      value: aprietan,
      hint: "menos de una semana",
      tone: aprietan > 0 ? "warning" : "default",
    },
  ];

  const columnas: Column<RenglonReabastecimiento>[] = [
    {
      key: "producto",
      label: "Material",
      render: (r) => (
        <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 12.5 }}>{r.producto}</strong>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {r.sku} · {r.almacen}
          </span>
        </div>
      ),
      width: 240,
    },
    {
      key: "disponible",
      label: "Disponible",
      numeric: true,
      width: 96,
      render: (r) => (
        <span title={`${r.onHand} en existencia, ${r.reservado} apartado`}>
          {cantidadLegible(r.disponible)} {r.unidadBase}
        </span>
      ),
    },
    {
      key: "min",
      label: "Mín / Máx",
      numeric: true,
      width: 104,
      render: (r) => (
        <span style={{ color: "var(--text-secondary)" }}>
          {cantidadLegible(r.min)} / {cantidadLegible(r.max)}
        </span>
      ),
    },
    {
      key: "cobertura",
      label: "Alcanza para",
      width: 140,
      render: (r) => {
        const { tono, texto } = cobertura(r.diasDeCobertura);
        return <StatusDot tone={tono} label={texto} />;
      },
    },
    {
      key: "consumo",
      label: "Consumo/día",
      numeric: true,
      width: 100,
      render: (r) => (
        <span
          style={{ color: "var(--text-secondary)" }}
          title={r.historiaCorta ? "Poca historia: el número es orientativo" : undefined}
        >
          {cantidadLegible(r.consumoDiario)}
          {r.historiaCorta ? " *" : ""}
        </span>
      ),
    },
    {
      key: "sugerido",
      label: "Comprar",
      numeric: true,
      width: 138,
      render: (r) =>
        r.sugerido > 0 ? (
          <div style={{ display: "grid", gap: 1 }}>
            <strong style={{ fontSize: 12.5 }}>
              {r.sugeridoEmpaque
                ? `${cantidadLegible(r.sugeridoEmpaque.unidades)} ${pluralEmpaque(r.sugeridoEmpaque.nombre, r.sugeridoEmpaque.unidades)}`
                : `${cantidadLegible(r.sugerido)} ${r.unidadBase}`}
            </strong>
            {r.sugeridoEmpaque && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {cantidadLegible(r.sugerido)} {r.unidadBase}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ),
    },
    {
      key: "lead",
      label: "Tarda",
      numeric: true,
      width: 76,
      render: (r) => (
        <span style={{ color: "var(--text-secondary)" }} title="Días que tarda el proveedor">
          {r.leadTimeDias} d
        </span>
      ),
    },
    {
      key: "calculado",
      label: "Calculado",
      width: 86,
      render: (r) => (
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          {fechaCorta(r.calculadoAt)}
        </span>
      ),
    },
  ];

  return (
    <Section
      title="Qué comprar"
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Ver todo el circulante
          </label>
          <Button size="sm" variant="secondary" onClick={() => void recalcular()} loading={recalculando}>
            Recalcular
          </Button>
          <InfoBreve etiqueta="Cómo se calcula el reabastecimiento" texto={INFO} />
        </div>
      }
      footer={
        ultimoCalculo ? (
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Último cálculo: {new Date(ultimoCalculo).toLocaleString("es-MX")}
          </span>
        ) : null
      }
      flush
    >
      {!cargando && filas.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <MetricStrip ariaLabel="Resumen de reabastecimiento" metrics={cifras} />
        </div>
      )}

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
      {cargando && filas.length === 0 ? (
        <p role="status" style={{ margin: 0, padding: "24px 0", fontSize: 12.5, color: "var(--text-tertiary)" }}>
          Cargando…
        </p>
      ) : (
      <DataTable
        columns={columnas}
        rows={filas}
        rowKey={(r) => r.stockLevelId}
        density="compact"
        emptyTitle={todos ? "Aún no hay material circulante" : "Nada por comprar ahora"}
        emptyDescription={
          todos
            ? "El reabastecimiento solo mira el material marcado como circulante. Marca así los productos de consumo en su ficha y volverán a salir aquí."
            : "Ningún material circulante llegó a su mínimo. Marca «Ver todo el circulante» para revisar mínimos y máximos antes de que aprieten."
        }
      />
      )}
    </Section>
  );
}
