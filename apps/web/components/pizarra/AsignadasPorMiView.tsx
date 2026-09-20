"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PersonaPhotoCard from "@/components/pizarra/PersonaPhotoCard";
import { formatApiError } from "@/lib/erp-api";
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

/** Contrato C: lo que repartió quien mira, con foto grande unificada. */
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {items.map((a) => (
        <PersonaPhotoCard
          key={`${a.id}-${a.persona.id}`}
          href={`/erp/actividades/${a.id}`}
          nombre={a.persona.nombre}
          puesto={a.persona.puesto}
          avatarUrl={a.persona.avatarUrl}
          photoSize={200}
          title={`${a.anNumber} · ${a.titulo}`}
          subtitle={`${a.estatus} · Asignada ${fecha(a.fechaAsignacion)}`}
          prioridad={a.prioridad}
          semaforo={a.semaforo}
          meta={
            <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>Plan {formatMinutes(a.minutosPlan)}</span>
              <span>Real {formatMinutes(a.minutosReales)}</span>
              {a.excedida ? <span style={{ color: "var(--danger)" }}>Excedida</span> : null}
              <Link href={`/erp/pizarra/${a.persona.id}`} style={{ color: "inherit" }}>
                Ver ficha
              </Link>
            </div>
          }
        />
      ))}
    </div>
  );
}
