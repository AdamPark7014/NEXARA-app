"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "@/lib/erp-api";
import { Chip, PrioridadChip, SemaforoDot } from "@/components/pizarra/PizarraKpi";
import {
  fetchAsignadasPorMi,
  formatMinutes,
  type AsignadaPorMiItem,
  type BoardRange,
} from "@/lib/team-board-api";

function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

/** Contrato C: lo que repartió quien mira, con persona, estado y semáforo. */
export default function AsignadasPorMiView({
  token,
  rango,
}: {
  token: string | null;
  rango: BoardRange;
}) {
  const [items, setItems] = useState<AsignadaPorMiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver lo que asignaste.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAsignadasPorMi(token, { desde, hasta });
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar lo que asignaste"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && items.length === 0) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando…</p>;
  }
  if (error) return <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>;
  if (items.length === 0) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
        No asignaste actividades en este rango.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((a) => (
        <div
          key={`${a.id}-${a.persona.id}`}
          style={{
            display: "grid",
            gap: 6,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <SemaforoDot semaforo={a.semaforo} />
            <Link
              href={`/erp/actividades/${a.id}`}
              style={{
                fontWeight: 750,
                fontSize: 14,
                color: "inherit",
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {a.anNumber} · {a.titulo}
            </Link>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <PrioridadChip prioridad={a.prioridad} />
            {/* Ya no se acepta ni se rechaza: lo que importa es si ya la inició. */}
            {a.inicioRealAt ? (
              <Chip color="#16a34a">Iniciada</Chip>
            ) : a.aceptacion === "RECHAZADA" ? (
              <Chip color="#dc2626" title={a.motivoRechazo ?? undefined}>
                Rechazada
              </Chip>
            ) : null}
            {a.excedida ? <Chip color="#dc2626">Excedió el plan</Chip> : null}
            {a.retirado ? <Chip color="#64748b">Retirado</Chip> : null}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <Link
              href={`/erp/pizarra/${a.persona.id}`}
              style={{ fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}
            >
              {a.persona.nombre}
            </Link>
            {` · ${a.estatus} · asignada ${fecha(a.fechaAsignacion)}`}
            {a.periodo ? ` · ${a.periodo.etiqueta}` : a.fechaMaxima ? ` · vence ${fecha(a.fechaMaxima)}` : ""}
            {a.minutosPlan != null
              ? ` · plan ${formatMinutes(a.minutosPlan)}${
                  a.minutosReales != null ? ` / real ${formatMinutes(a.minutosReales)}` : ""
                }`
              : a.minutosReales != null
                ? ` · real ${formatMinutes(a.minutosReales)}`
                : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
