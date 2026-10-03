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
import AutorenewOutlined from "@mui/icons-material/AutorenewOutlined";
import HourglassBottomOutlined from "@mui/icons-material/HourglassBottomOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import Modal from "./ui/Modal";
import {
  Alert,
  Button,
  Card,
  CardHead,
  DataTable,
  Field,
  FilterChip,
  FilterChips,
  ListFooter,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  Textarea,
  type Column,
} from "./base";
import { tonoDeVariante } from "./almacen/PiezasAlmacen";
import { useUser } from "./UserContext";
import s from "./ToolRequestsTable.module.css";

const FILTROS = [
  { value: "PENDING", label: "Pendientes", dot: "warning" },
  { value: "APPROVED", label: "Aprobadas", dot: "success" },
  { value: "REJECTED", label: "Rechazadas", dot: "danger" },
  { value: "all", label: "Todos", dot: undefined },
] as const;

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

  /** Lo que queda tras la búsqueda: sobre esto cuentan los chips. */
  const buscadas = useMemo(() => {
    if (!searchQ.trim()) return items;
    const q = searchQ.toLowerCase();
    return items.filter(
      (r) =>
        r.toolName.toLowerCase().includes(q) ||
        r.userName.toLowerCase().includes(q) ||
        (r.renewalReason ?? "").toLowerCase().includes(q),
    );
  }, [items, searchQ]);

  const columns: Column<ToolRenewalRow>[] = [
    {
      key: "user",
      label: "Usuario",
      render: (r) => <PersonCell name={r.userName} subtitle={r.userEmail || undefined} size={28} />,
      width: 200,
    },
    { key: "tool", label: "Herramienta", render: (r) => <span className={s.fuerte}>{r.toolName}</span> },
    { key: "prev", label: "Fecha actual", render: (r) => <span className={s.fecha}>{fmtDate(r.previousReturnDate)}</span>, width: 116 },
    { key: "new", label: "Nueva fecha", render: (r) => <span className={s.fecha}>{fmtDate(r.newReturnDate)}</span>, width: 116 },
    {
      key: "overdue",
      label: "Vencimiento",
      render: (r) => (
        <span className={s.doble}>
          {r.daysOverdue >= 1 ? (
            <StatusBadge label={`${r.daysOverdue} días`} tone="danger" size="sm" dot />
          ) : (
            <span className={s.fecha}>{r.daysOverdue} días</span>
          )}
          {r.renewalReason && <span className={s.tenue}>{r.renewalReason}</span>}
        </span>
      ),
      width: 160,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <StatusBadge
          label={r.status === "PENDING" ? "Pendiente" : r.status === "APPROVED" ? "Aprobada" : "Rechazada"}
          tone={tonoDeVariante(renewalStatusVariant(r.status))}
          size="sm"
          dot
        />
      ),
      width: 120,
    },
    {
      key: "processed",
      label: "Resolvió",
      render: (r) =>
        r.status === "PENDING" ? (
          <span className={s.tenue}>—</span>
        ) : (
          <span className={s.tenue}>{r.approverName ? `Por ${r.approverName}` : "Procesado"}</span>
        ),
      width: 140,
    },
  ];

  const acciones = (r: ToolRenewalRow) =>
    r.status === "PENDING" ? (
      <>
        <Button size="sm" variant="ghost" onClick={() => setModal({ id: r.id, type: "reject" })}>
          Rechazar
        </Button>
        <Button size="sm" variant="tonal" onClick={() => setModal({ id: r.id, type: "approve" })}>
          Aprobar
        </Button>
      </>
    ) : null;

  const cerrarModal = () => {
    if (!actionLoading) setModal(null);
  };

  return (
    <div className={s.pila}>
      {!loading || items.length > 0 ? (
        <StatRow ariaLabel="Resumen de renovaciones" cols={4}>
          <Stat label="Total" value={counts.total} icon={<AutorenewOutlined />} iconTone="neutral" onClick={() => setFilterStatus("all")} pressed={filterStatus === "all"} />
          <Stat
            label="Pendientes"
            value={counts.pending}
            tone={counts.pending > 0 ? "warning" : "default"}
            icon={<HourglassBottomOutlined />}
            iconTone={counts.pending > 0 ? "warning" : "neutral"}
            onClick={() => setFilterStatus("PENDING")}
            pressed={filterStatus === "PENDING"}
          />
          <Stat
            label="Urgentes"
            value={counts.urgent}
            hint="pendientes y ya vencidas"
            tone={counts.urgent > 0 ? "danger" : "success"}
            icon={<ReportProblemOutlined />}
            iconTone={counts.urgent > 0 ? "danger" : "success"}
            semaforo={counts.urgent > 0 ? "rojo" : "verde"}
          />
          <Stat
            label="Aprobadas"
            value={counts.approved}
            tone="success"
            icon={<CheckCircleOutline />}
            iconTone="success"
            onClick={() => setFilterStatus("APPROVED")}
            pressed={filterStatus === "APPROVED"}
          />
        </StatRow>
      ) : null}

      <Card aria-label="Renovaciones de herramientas">
        <CardHead title="Renovaciones de herramientas" subtitle="Quien necesita la herramienta más días pide una nueva fecha de devolución." />
        {error && (
          <div className={s.avisos}>
            <Alert tone="danger" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}>
              {error}
            </Alert>
          </div>
        )}

        <ModuleToolbar
          search={
            <SearchInput
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar herramienta o usuario…"
              aria-label="Buscar renovaciones"
            />
          }
          chips={
            <FilterChips ariaLabel="Estado de la renovación">
              {FILTROS.map((f) => (
                <FilterChip
                  key={f.value}
                  active={filterStatus === f.value}
                  count={loading ? undefined : f.value === "all" ? buscadas.length : buscadas.filter((r) => r.status === f.value).length}
                  dot={f.dot}
                  onClick={() => setFilterStatus(f.value)}
                >
                  {f.label}
                </FilterChip>
              ))}
            </FilterChips>
          }
        />

        {loading && items.length === 0 ? (
          <div className={s.carga}>
            <SkeletonRows rows={4} label="Obteniendo renovaciones pendientes" />
          </div>
        ) : (
          <DataTable<ToolRenewalRow>
            columns={columns}
            rows={visibleItems}
            rowKey={(r) => r.id}
            flush
            ariaLabel="Renovaciones de herramientas"
            rowActions={acciones}
            rowActionsLabel="Acciones"
            emptyTitle="Sin renovaciones"
            emptyDescription="No hay renovaciones con los filtros actuales"
            emptyAction={
              searchQ || filterStatus !== "PENDING" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearchQ("");
                    setFilterStatus("PENDING");
                  }}
                >
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        )}
        {!loading && visibleItems.length > 0 ? <ListFooter total={visibleItems.length} unit="renovaciones" /> : null}
      </Card>

      <Modal
        open={Boolean(modal)}
        onClose={cerrarModal}
        title={modal?.type === "reject" ? "Rechazar renovación" : "Aprobar renovación"}
        maxWidth={440}
        footer={
          <>
            <Button variant="secondary" disabled={actionLoading} onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button
              variant={modal?.type === "reject" ? "danger" : "primary"}
              loading={actionLoading}
              onClick={() => void runModalAction()}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {modal?.type === "reject" ? (
          <Field label="Motivo del rechazo" optional>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo (opcional)"
            />
          </Field>
        ) : (
          <p className={s.tenue}>La herramienta queda prestada hasta la nueva fecha de devolución.</p>
        )}
      </Modal>
    </div>
  );
};

export default ToolRenewalsTable;
