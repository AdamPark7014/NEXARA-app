"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
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
  "El mínimo sale del consumo real de los últimos 90 días por el lead time del proveedor más los días de seguridad. La cantidad sugerida ya viene subida al empaque y a la compra mínima. Solo aplica a material marcado como circulante.";

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
      label: "Cobertura",
      numeric: true,
      width: 96,
      render: (r) =>
        r.diasDeCobertura == null ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <Tag variant={toneCobertura(r.diasDeCobertura)} dot size="sm">
            {cantidadLegible(r.diasDeCobertura)} d
          </Tag>
        ),
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
      label: "Lead",
      numeric: true,
      width: 70,
      render: (r) => <span style={{ color: "var(--text-secondary)" }}>{r.leadTimeDias} d</span>,
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
      title={cargando ? "Cargando…" : `${porComprar} por comprar`}
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
      {error && (
        <div
          role="alert"
          style={{
            margin: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--danger) 40%, var(--border))",
            fontSize: 12.5,
          }}
        >
          {error}{" "}
          <Button size="sm" variant="ghost" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      )}
      <DataTable
        columns={columnas}
        rows={filas}
        rowKey={(r) => r.stockLevelId}
        density="compact"
        emptyTitle={todos ? "Sin material circulante" : "Nada por comprar"}
        emptyDescription={
          todos
            ? "Marca los productos de consumo como circulantes para que entren aquí."
            : "Ningún material circulante llegó a su mínimo."
        }
      />
    </Section>
  );
}
