"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getActivitiesSectionConfig, getEvidencesSectionConfig, getActivitiesCanonicalPath } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";

/** Formulario completo de OT (asignar ingeniero, cliente, AN, etc.) */
const ActivitiesTable = dynamic(() => import("@/components/ActivitiesTable"), { ssr: false });

interface Evidence {
  id: number;
  tipo?: string;
  descripcion?: string;
  estado?: string;
  estatus?: string;
  creadoEn?: string;
  activity?: { anNumber?: string; clienteNombre?: string };
  uploadedBy?: { nombre?: string };
  url?: string;
}

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function useActivitiesConfig() {
  const { user } = useUser();
  return useMemo(() => getActivitiesSectionConfig(user), [user]);
}

type TabId = "actividades" | "evidencias";

export default function ActivitiesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = user?.token ?? "";
  const cfg = useActivitiesConfig();
  const evCfg = useMemo(() => getEvidencesSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "activities");

  const [showOnlyMine, setShowOnlyMine] = useState(
    cfg.viewMode === "manage_execute" ? false : cfg.defaultScope === "self",
  );
  const [tab, setTab] = useState<TabId>(
    searchParams.get("tab") === "evidencias" ? "evidencias" : "actividades",
  );
  const [evids, setEvids] = useState<Evidence[]>([]);
  const [evLoading, setEvLoading] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);

  const canToggleScope = cfg.viewMode === "manage_execute";

  const loadEvidences = useCallback(async () => {
    if (!token) return;
    setEvLoading(true);
    setEvError(null);
    try {
      const data = await apiFetch("evidences?limit=80", token);
      setEvids(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setEvError(e instanceof Error ? e.message : "Error al cargar evidencias");
    } finally { setEvLoading(false); }
  }, [token]);

  useEffect(() => {
    if (searchParams.get("tab") === "evidencias") setTab("evidencias");
  }, [searchParams]);
  useEffect(() => {
    if (cfg.viewMode === "execute") {
      router.replace(getActivitiesCanonicalPath(user));
    }
  }, [cfg.viewMode, router, user]);
  useEffect(() => { if (tab === "evidencias") loadEvidences(); }, [tab, loadEvidences]);

  const patchEvState = async (id: number, approve: boolean) => {
    if (!token) return;
    try {
      await apiFetch(`evidences/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          aprobada: approve,
          estatus: approve ? "Aprobada" : "Rechazada",
        }),
      });
      setEvids(prev => prev.map(e => e.id === id ? { ...e, estado: approve ? "APROBADA" : "RECHAZADA", estatus: approve ? "Aprobada" : "Rechazada" } : e));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al actualizar evidencia");
    }
  };

  const isPendingEvidence = (e: Evidence) => {
    const s = (e.estado ?? e.estatus ?? "").toUpperCase();
    return !s || s === "PENDIENTE" || s === "PENDIENTE_REVISION" || s === "PENDIENTE REVISION";
  };

  const removeEvidence = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta evidencia?")) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "DELETE" });
      setEvids(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar evidencia");
    }
  };

  const evColumns: Column<Evidence>[] = [
    { key: "id", label: "ID", render: (e) => <Tag variant="accent">E-{e.id}</Tag>, width: 70 },
    { key: "tipo", label: "Tipo", render: (e) => <Tag variant="neutral">{e.tipo ?? "—"}</Tag>, width: 120 },
    { key: "activity", label: "OT / Cliente", render: (e) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{e.activity?.anNumber ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.activity?.clienteNombre ?? e.descripcion?.slice(0, 40)}</div>
      </div>
    )},
    { key: "uploadedBy", label: "Ingeniero", accessor: (e) => e.uploadedBy?.nombre ?? "—", width: 130 },
    { key: "creadoEn", label: "Capturada", accessor: (e) => e.creadoEn ? new Date(e.creadoEn).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: (e) => {
      const label = e.estado ?? e.estatus ?? "Pendiente";
      const norm = label.toUpperCase();
      return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={norm.includes("APROB") ? "positive" : norm.includes("RECHAZ") ? "danger" : "warning"}>
          {label.replace(/_/g, " ")}
        </Tag>
        {evCfg.canApprove && isPendingEvidence(e) && (
          <>
            <button onClick={() => patchEvState(e.id, true)}  style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓</button>
            <button onClick={() => patchEvState(e.id, false)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
      </div>
    ); }, width: 220 },
    ...(evCfg.canDelete ? [{
      key: "id" as const, label: "" as const,
      render: (e: Evidence) => (
        <button onClick={() => removeEvidence(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}>✕</button>
      ), width: 40,
    }] : []),
  ];

  const visibleEvids = showOnlyMine
    ? evids.filter(e => e.uploadedBy?.nombre === user?.nombre)
    : evids;

  const pendingEvids = visibleEvids.filter(isPendingEvidence).length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent", color: active ? "var(--primary)" : "var(--text-secondary)",
    fontFamily: "inherit",
  });

  if (cfg.viewMode === "execute") return null;

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          tab === "evidencias" ? (
            <Button variant="ghost" onClick={loadEvidences}>
              {pendingEvids > 0 ? `${pendingEvids} pendientes` : "Actualizar"}
            </Button>
          ) : undefined
        }
      />

      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "actividades")} onClick={() => setTab("actividades")}>
          Actividades / OT
        </button>
        <button style={tabStyle(tab === "evidencias")} onClick={() => setTab("evidencias")}>
          Evidencias{pendingEvids > 0 && (
            <span style={{ marginLeft: 6, background: "var(--warning)", color: "#fff", borderRadius: 99, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{pendingEvids}</span>
          )}
        </button>
        {canToggleScope && tab === "evidencias" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, padding: "0 0 8px" }}>
            <button
              onClick={() => setShowOnlyMine(true)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                background: showOnlyMine ? "var(--primary)" : "var(--surface)",
                color: showOnlyMine ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Mis evidencias
            </button>
            <button
              onClick={() => setShowOnlyMine(false)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                background: !showOnlyMine ? "var(--primary)" : "var(--surface)",
                color: !showOnlyMine ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Todo el equipo
            </button>
          </div>
        )}
        {tab === "actividades" && (
          <span style={{ marginLeft: "auto", padding: "0 12px 8px", fontSize: 11, color: "var(--text-tertiary)" }}>
            Asigna OT desde el botón «Nueva actividad» abajo
          </span>
        )}
      </div>

      {tab === "actividades" && <ActivitiesTable />}

      {tab === "evidencias" && (
        <Section title={evLoading ? "Cargando…" : `${visibleEvids.length} evidencias${showOnlyMine && canToggleScope ? " (tuyas)" : ""}`}>
          {evLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : evError ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--danger)", marginBottom: 12 }}>{evError}</p>
              <Button size="sm" variant="secondary" onClick={() => void loadEvidences()}>Reintentar</Button>
            </div>
          ) : (
            <DataTable columns={evColumns} rows={visibleEvids} rowKey={(e) => e.id} emptyTitle="Sin evidencias" emptyDescription={showOnlyMine ? "No tienes evidencias registradas." : "Sin evidencias aún."} />
          )}
        </Section>
      )}
    </>
  );
}
