"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import PersonaPhotoCard from "@/components/pizarra/PersonaPhotoCard";
import { formatApiError } from "@/lib/erp-api";
import {
  SEMAFORO_COLORS,
  SEMAFORO_LABELS,
  fetchAsignadasPorMi,
  formatMinutes,
  type AsignadaPorMiItem,
  type BoardRange,
  type Semaforo,
} from "@/lib/team-board-api";

function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

type SemaforoFilter = "todos" | Semaforo;
type TriFilter = "todos" | "si" | "no";

const chipBase: CSSProperties = {
  minHeight: 36,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 650,
  cursor: "pointer",
};

function chipOn(active: boolean, accent?: string): CSSProperties {
  if (!active) return chipBase;
  return {
    ...chipBase,
    borderColor: accent || "var(--primary)",
    color: accent || "var(--primary)",
    background: `color-mix(in srgb, ${accent || "var(--primary)"} 12%, var(--surface))`,
  };
}

/** Filtra en cliente con campos que ya trae cada ítem (sin round-trip). */
export function filtrarAsignadasPorMi(
  items: readonly AsignadaPorMiItem[],
  opts: {
    semaforo: SemaforoFilter;
    excedida: TriFilter;
    terminada: TriFilter;
    personaId: number | null;
  },
): AsignadaPorMiItem[] {
  return items.filter((a) => {
    if (opts.semaforo !== "todos" && a.semaforo !== opts.semaforo) return false;
    if (opts.excedida === "si" && !a.excedida) return false;
    if (opts.excedida === "no" && a.excedida) return false;
    if (opts.terminada === "si" && !a.terminada) return false;
    if (opts.terminada === "no" && a.terminada) return false;
    if (opts.personaId != null && a.persona.id !== opts.personaId) return false;
    return true;
  });
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
  const [semaforo, setSemaforo] = useState<SemaforoFilter>("todos");
  const [excedida, setExcedida] = useState<TriFilter>("todos");
  const [terminada, setTerminada] = useState<TriFilter>("todos");
  const [personaId, setPersonaId] = useState<number | null>(null);
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

  const personas = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of items) {
      if (!map.has(a.persona.id)) map.set(a.persona.id, a.persona.nombre);
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [items]);

  const filtered = useMemo(
    () => filtrarAsignadasPorMi(items, { semaforo, excedida, terminada, personaId }),
    [items, semaforo, excedida, terminada, personaId],
  );

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
    <div style={{ display: "grid", gap: 14 }}>
      <div
        role="toolbar"
        aria-label="Filtros de asignadas"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
      >
        <button type="button" style={chipOn(semaforo === "todos")} onClick={() => setSemaforo("todos")}>
          Todos
        </button>
        {(Object.keys(SEMAFORO_LABELS) as Semaforo[]).map((s) => (
          <button
            key={s}
            type="button"
            style={chipOn(semaforo === s, SEMAFORO_COLORS[s])}
            onClick={() => setSemaforo(s)}
          >
            {SEMAFORO_LABELS[s]}
          </button>
        ))}
        <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} aria-hidden />
        <button
          type="button"
          style={chipOn(excedida === "si", "var(--danger)")}
          onClick={() => setExcedida((v) => (v === "si" ? "todos" : "si"))}
        >
          Excedida
        </button>
        <button
          type="button"
          style={chipOn(terminada === "si", "var(--success)")}
          onClick={() => setTerminada((v) => (v === "si" ? "todos" : "si"))}
        >
          Terminada
        </button>
        {personas.length > 1 ? (
          <>
            <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} aria-hidden />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>Persona</span>
              <select
                value={personaId ?? ""}
                onChange={(e) => setPersonaId(e.target.value ? Number(e.target.value) : null)}
                style={{ minHeight: 36, fontSize: 14, borderRadius: 10, border: "1px solid var(--border)", padding: "4px 8px" }}
              >
                <option value="">Todas</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginLeft: "auto" }}>
          {filtered.length} de {items.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Ninguna asignación coincide con estos filtros.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {filtered.map((a) => (
            <PersonaPhotoCard
              key={`${a.id}-${a.persona.id}`}
              href={`/erp/actividades/${a.id}`}
              nombre={a.persona.nombre}
              puesto={a.persona.puesto}
              avatarUrl={a.persona.avatarUrl}
              photoSize={88}
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
      )}
    </div>
  );
}
