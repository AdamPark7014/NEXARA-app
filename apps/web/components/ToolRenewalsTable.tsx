"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSocketBaseUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import {
  approveToolRenewal,
  listPendingToolRenewals,
  rejectToolRenewal,
  type ToolRenewalRow,
} from "@/lib/tool-requests-api";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import FilterToolbar from "./FilterToolbar";
import Button from "./ui/Button";
import KpiCard from "./ui/KpiCard";
import Section from "./ui/Section";
import DataTable, { Tag, type Column } from "./ui/DataTable";
import { useUser } from "./UserContext";

interface ToolRenewalsTableProps {
  refreshTrigger?: number;
  highlightId?: string | null;
}

function fmtDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renewalStatusVariant(status: string): "warning" | "positive" | "danger" | "default" {
  if (status === "PENDING") return "warning";
  if (status === "APPROVED") return "positive";
  if (status === "REJECTED") return "danger";
  return "default";
}

const ToolRenewalsTable: React.FC<ToolRenewalsTableProps> = ({ refreshTrigger = 0, highlightId = null }) => {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<ToolRenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("PENDING");
  const [searchQ, setSearchQ] = useState("");
  const [modal, setModal] = useState<{ id: number; type: "approve" | "reject" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listPendingToolRenewals(token));
    } catch (err) {
      setError(formatApiError(err, "Error al cargar renovaciones"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), { transports: ["polling", "websocket"] });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 250);
    };
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "ToolRenewal" || payload?.model === "ToolRequest") schedule();
    });
    return () => {
      if (timer) clearTimeout(timer);
      socket.disconnect();
    };
  }, [token, load]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (filterStatus !== "all") rows = rows.filter((r) => r.status === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.toolName.toLowerCase().includes(q) ||
          r.userName.toLowerCase().includes(q) ||
          (r.renewalReason ?? "").toLowerCase().includes(q),
      );
    }
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [items, filterStatus, searchQ, highlightId]);

  const counts = {
    total: items.length,
    pending: items.filter((r) => r.status === "PENDING").length,
    urgent: items.filter((r) => r.status === "PENDING" && r.daysOverdue >= 1).length,
    approved: items.filter((r) => r.status === "APPROVED").length,
  };

  const runModalAction = async () => {
    if (!token || !modal) return;
    setActionLoading(true);
    setError(null);
    try {
      if (modal.type === "approve") {
        await approveToolRenewal(token, modal.id);
      } else {
        await rejectToolRenewal(token, modal.id, rejectReason);
      }
      setModal(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(formatApiError(err, "Error en la acción"));
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Column<ToolRenewalRow>[] = [
    {
      key: "user",
      label: "Usuario",
      render: (r) => (
        <div>
          <div>{r.userName}</div>
          {r.userEmail && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.userEmail}</div>
          )}
        </div>
      ),
      width: 150,
    },
    { key: "tool", label: "Herramienta", accessor: (r) => r.toolName },
    { key: "prev", label: "Fecha actual", accessor: (r) => fmtDate(r.previousReturnDate), width: 110 },
    { key: "new", label: "Nueva fecha", accessor: (r) => fmtDate(r.newReturnDate), width: 110 },
    {
      key: "overdue",
      label: "Vencimiento",
      render: (r) => (
        <div>
          <span style={{ fontWeight: r.daysOverdue >= 1 ? 700 : 400, color: r.daysOverdue >= 1 ? "var(--danger)" : undefined }}>
            {r.daysOverdue >= 1 ? "⚠️ " : ""}{r.daysOverdue} días
          </span>
          {r.renewalReason && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.renewalReason}</div>
          )}
        </div>
      ),
      width: 130,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <Tag variant={renewalStatusVariant(r.status)}>
          {r.status === "PENDING" ? "Pendiente" : r.status === "APPROVED" ? "Aprobada" : "Rechazada"}
        </Tag>
      ),
      width: 100,
    },
    {
      key: "actions",
      label: "Acciones",
      width: 160,
      render: (r) =>
        r.status === "PENDING" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="sm" onClick={() => setModal({ id: r.id, type: "approve" })}>Aprobar</Button>
            <Button size="sm" variant="ghost" onClick={() => setModal({ id: r.id, type: "reject" })}>
              Rechazar
            </Button>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {r.approverName ? `Por ${r.approverName}` : "Procesado"}
          </span>
        ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <KpiCard label="Total" value={counts.total} icon="🔁" />
        <KpiCard
          label="Pendientes"
          value={counts.pending}
          icon="⏳"
          variant={counts.pending > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Urgentes"
          value={counts.urgent}
          icon="⚠️"
          variant={counts.urgent > 0 ? "danger" : "positive"}
        />
        <KpiCard label="Aprobadas" value={counts.approved} icon="✅" variant="positive" />
      </div>

      <Section title="Renovaciones de herramientas">
        {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar herramienta o usuario…" }}
          selects={[
            {
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "PENDING", label: "Pendientes" },
                { value: "APPROVED", label: "Aprobadas" },
                { value: "REJECTED", label: "Rechazadas" },
                { value: "all", label: "Todos" },
              ],
              allowAll: false,
            },
          ]}
          onClear={() => {
            setSearchQ("");
            setFilterStatus("PENDING");
          }}
          resultCount={loading ? null : visibleItems.length}
        />

        <DataTable<ToolRenewalRow>
          columns={columns}
          rows={loading ? [] : visibleItems}
          rowKey={(r) => r.id}
          emptyTitle={loading ? "Cargando…" : "Sin renovaciones"}
          emptyDescription={
            loading ? "Obteniendo renovaciones pendientes" : "No hay renovaciones con los filtros actuales"
          }
        />
      </Section>

      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,24,38,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => !actionLoading && setModal(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 420, width: "100%", padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>
              {modal.type === "approve" ? "Aprobar renovación" : "Rechazar renovación"}
            </h3>
            {modal.type === "reject" && (
              <textarea
                className="input"
                style={{ width: "100%", minHeight: 80, marginBottom: 12 }}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo (opcional)"
              />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Button loading={actionLoading} onClick={() => void runModalAction()}>Confirmar</Button>
              <Button variant="secondary" disabled={actionLoading} onClick={() => setModal(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolRenewalsTable;
