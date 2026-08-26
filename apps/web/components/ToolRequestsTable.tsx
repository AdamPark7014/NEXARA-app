"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSocketBaseUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { exportToExcel } from "@/lib/export-excel";
import {
  approveToolRequest,
  deliverToolRequest,
  listToolRequests,
  rejectToolRequest,
  returnToolRequest,
  toolRequestStatusLabel,
  toolRequestStatusVariant,
  type ToolRequestRow,
} from "@/lib/tool-requests-api";
import FinesTable from "./FinesTable";
import FilterToolbar from "./FilterToolbar";
import Button from "./ui/Button";
import KpiCard from "./ui/KpiCard";
import Section from "./ui/Section";
import DataTable, { Tag, type Column } from "./ui/DataTable";
import { useUser } from "./UserContext";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pendiente" },
  { value: "APPROVED", label: "Aprobada" },
  { value: "IN_USE", label: "En uso" },
  { value: "RETURNED", label: "Devuelta" },
  { value: "DAMAGED", label: "Dañada" },
  { value: "REJECTED", label: "Rechazada" },
];

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const ToolRequestsTable: React.FC = () => {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = hasPermission(user, PERMISSIONS.TOOLS_MANAGE);

  const [items, setItems] = useState<ToolRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listToolRequests(token);
      setItems(rows);
    } catch (err) {
      setError(formatApiError(err, "Error al cargar solicitudes"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), { transports: ["polling", "websocket"] });
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "ToolRequest") void load();
    });
    return () => {
      socket.disconnect();
    };
  }, [token, load]);

  const runAction = async (id: number, action: () => Promise<unknown>) => {
    if (!canManage) return;
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(formatApiError(err, "No se pudo completar la acción"));
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems = useMemo(() => {
    let rows = items;
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.toolName.toLowerCase().includes(q) ||
          r.requestedByName.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q) ||
          r.serialNumber.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [items, filterStatus, searchQ]);

  const now = Date.now();
  const counts = {
    total: items.length,
    pending: items.filter((t) => t.status === "PENDING").length,
    inUse: items.filter((t) => t.status === "IN_USE").length,
    overdue: items.filter(
      (t) =>
        t.status === "IN_USE" &&
        t.expectedReturnDate &&
        new Date(t.expectedReturnDate).getTime() < now,
    ).length,
  };

  const columns: Column<ToolRequestRow>[] = [
    {
      key: "user",
      label: "Usuario",
      render: (r) => (
        <div>
          <div>{r.requestedByName}</div>
          {r.requestedByEmail && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.requestedByEmail}</div>
          )}
        </div>
      ),
      width: 160,
    },
    {
      key: "tool",
      label: "Herramienta",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.toolName}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {r.reason.length > 48 ? `${r.reason.slice(0, 48)}…` : r.reason}
          </div>
        </div>
      ),
    },
    {
      key: "model",
      label: "Modelo / Serie",
      accessor: (r) => `${r.model} / ${r.serialNumber.slice(0, 20)}`,
      width: 140,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => <Tag variant={toolRequestStatusVariant(r.status)}>{toolRequestStatusLabel(r.status)}</Tag>,
      width: 110,
    },
    { key: "requestDate", label: "Solicitado", accessor: (r) => fmtDate(r.requestDate), width: 110 },
    {
      key: "expectedReturnDate",
      label: "Devolución",
      accessor: (r) => fmtDate(r.expectedReturnDate),
      width: 110,
    },
    {
      key: "approvedBy",
      label: "Aprobado por",
      accessor: (r) => r.approvedByName ?? "—",
      width: 120,
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      label: "Acciones",
      width: 200,
      render: (r) => {
        const busy = busyId === r.id;
        return (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {r.status === "PENDING" && (
              <>
                <Button size="sm" disabled={busy} onClick={() => runAction(r.id, () => approveToolRequest(token, r.id))}>
                  Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    const adminNotes = window.prompt("Motivo del rechazo (obligatorio):");
                    if (!adminNotes?.trim()) return;
                    void runAction(r.id, () => rejectToolRequest(token, r.id, adminNotes.trim()));
                  }}
                >
                  Rechazar
                </Button>
              </>
            )}
            {r.status === "APPROVED" && (
              <Button size="sm" disabled={busy} onClick={() => runAction(r.id, () => deliverToolRequest(token, r.id))}>
                Entregar
              </Button>
            )}
            {r.status === "IN_USE" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  const damageDescription =
                    window.prompt("Descripción de daño (opcional, vacío si está en buen estado):") ?? "";
                  void runAction(r.id, () => returnToolRequest(token, r.id, damageDescription));
                }}
              >
                Devolución
              </Button>
            )}
          </div>
        );
      },
    });
  }

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
        <KpiCard label="Total" value={counts.total} icon="🧰" />
        <KpiCard
          label="Pendientes"
          value={counts.pending}
          icon="⏳"
          variant={counts.pending > 0 ? "warning" : "default"}
        />
        <KpiCard label="En uso" value={counts.inUse} icon="👤" variant="accent" />
        <KpiCard
          label="Vencidas"
          value={counts.overdue}
          icon="⚠️"
          variant={counts.overdue > 0 ? "danger" : "positive"}
        />
      </div>

      <Section title="Solicitudes de herramientas">
        {error && (
          <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>
        )}
        {actionError && (
          <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{actionError}</div>
        )}

        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar herramienta, usuario, serie…" }}
          selects={[
            {
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: STATUS_OPTIONS,
              allowAll: true,
            },
          ]}
          onClear={() => {
            setSearchQ("");
            setFilterStatus("");
          }}
          resultCount={loading ? null : visibleItems.length}
          rightActions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                exportToExcel(
                  visibleItems,
                  [
                    { key: "id", label: "ID" },
                    { key: "requestedByName", label: "Usuario" },
                    { key: "toolName", label: "Herramienta" },
                    { key: "status", label: "Estado", format: (v) => toolRequestStatusLabel(String(v)) },
                    { key: "requestDate", label: "Solicitado", format: (v) => fmtDate(String(v)) },
                    {
                      key: "expectedReturnDate",
                      label: "Devolución",
                      format: (v) => fmtDate(v ? String(v) : null),
                    },
                  ],
                  "solicitudes-herramientas",
                  "Solicitudes de herramientas",
                )
              }
            >
              Excel
            </Button>
          }
        />

        <DataTable<ToolRequestRow>
          columns={columns}
          rows={loading ? [] : visibleItems}
          rowKey={(r) => r.id}
          emptyTitle={loading ? "Cargando…" : "Sin solicitudes"}
          emptyDescription={
            loading ? "Obteniendo solicitudes de herramientas" : "No hay solicitudes con los filtros actuales"
          }
        />
      </Section>

      <FinesTable tipo="herramienta" showUser={true} />
    </div>
  );
};

export default ToolRequestsTable;
