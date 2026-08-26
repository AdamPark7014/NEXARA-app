"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import {
  evidenceStatusVariant,
  listEvidenceReviewHistory,
  type EvidenceReviewRow,
} from "@/lib/activity-evidence-api";
import { formatDateTime } from "@/components/detail/DetailFrame";

export default function EvidenceReviewQueue() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";

  const [rows, setRows] = useState<EvidenceReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listEvidenceReviewHistory(token);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar evidencias");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(token);
    const onEntity = (payload: { model?: string }) => {
      if (payload?.model === "ActivityEvidence" || payload?.model === "Evidence") {
        void load();
      }
    };
    socket.on("entity:updated", onEntity);
    return () => {
      socket.off("entity:updated", onEntity);
      socket.disconnect();
    };
  }, [token, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus && r.estatus !== filterStatus) return false;
      if (!q) return true;
      const hay = [
        r.actividad?.anNumber,
        r.actividad?.titulo,
        r.actividad?.branchName,
        r.actividad?.responsable?.nombre,
        r.estatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, filterStatus]);

  const pendingCount = rows.filter((r) => r.estatus === "Pendiente").length;

  const columns: Column<EvidenceReviewRow>[] = [
    {
      key: "an",
      label: "OT",
      render: (r) => <span style={{ fontWeight: 600 }}>{r.actividad?.anNumber ?? "—"}</span>,
    },
    {
      key: "titulo",
      label: "Actividad",
      render: (r) => r.actividad?.titulo ?? "—",
    },
    {
      key: "responsable",
      label: "Responsable",
      render: (r) => r.actividad?.responsable?.nombre ?? r.user?.nombre ?? "—",
    },
    {
      key: "sucursal",
      label: "Sucursal",
      render: (r) =>
        [r.actividad?.branchName, r.actividad?.branchCity].filter(Boolean).join(" · ") || "—",
    },
    {
      key: "estatus",
      label: "Estatus",
      render: (r) => <Tag variant={evidenceStatusVariant(r.estatus)}>{r.estatus}</Tag>,
    },
    {
      key: "fecha",
      label: "Completada",
      render: (r) => formatDateTime(r.completedAt ?? r.fechaEvidencia ?? r.revisadoEn) ?? "—",
    },
  ];

  const openWorkspace = (row: EvidenceReviewRow) => {
    const activityId = row.actividad?.id;
    if (!activityId) return;
    router.push(`/ops/activities/${activityId}/evidences`);
  };

  if (loading && rows.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--text-secondary)", fontSize: 14 }}>
        Cargando cola de evidencias…
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {pendingCount > 0
            ? `${pendingCount} paquete(s) pendientes de revisión`
            : "Sin evidencias pendientes"}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
      </div>

      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Buscar OT, técnico, sucursal…" }}
        selects={[
          {
            label: "Estatus",
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: "Pendiente", label: "Pendiente" },
              { value: "Aprobada", label: "Aprobada" },
              { value: "Rechazada", label: "Rechazada" },
            ],
            allowAll: true,
          },
        ]}
        onClear={() => {
          setSearch("");
          setFilterStatus("");
        }}
        resultCount={filtered.length}
      />

      {error && (
        <EmptyState
          title="Error al cargar"
          description={error}
          action={<Button size="sm" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {!error && (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowClick={openWorkspace}
          emptyTitle="Sin evidencias"
          emptyDescription="No hay paquetes de evidencia en tu alcance."
          emptyAction={<Button size="sm" variant="secondary" onClick={() => void load()}>Actualizar</Button>}
        />
      )}
    </div>
  );
}
