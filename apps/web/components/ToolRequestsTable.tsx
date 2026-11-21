"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PedirTexto, { type PedirTextoEstado } from "@/components/ui/PedirTexto";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import HourglassBottomOutlined from "@mui/icons-material/HourglassBottomOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import { getSocketBaseUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { exportToExcel } from "@/lib/export-excel";
import {
  CONDICION_DEVOLUCION,
  approveToolRequest,
  listToolRequests,
  rejectToolRequest,
  toolRequestStatusLabel,
  toolRequestStatusVariant,
  type CondicionDevolucion,
  type ToolRequestRow,
} from "@/lib/tool-requests-api";
import FinesTable from "./FinesTable";
import {
  Alert,
  Button,
  Card,
  CardHead,
  DataTable,
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
  type Column,
} from "./base";
import { tonoDeVariante } from "./almacen/PiezasAlmacen";
import { useUser } from "./UserContext";
import ToolLoanTimeline from "./ToolLoanTimeline";
import { DialogoDevolucion, DialogoEntrega, VisorEvidencia, faltaEvidencia } from "./herramientas/EvidenciaPrestamo";
import { toast } from "./Toast";
import { diaPactadoVencido, textoDiaPactado } from "@/lib/dia-pactado";
import s from "./ToolRequestsTable.module.css";

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

type ToolRequestsTableProps = {
  highlightId?: string | null;
};

const ToolRequestsTable: React.FC<ToolRequestsTableProps> = ({ highlightId = null }) => {
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

  const [pedir, setPedir] = useState<PedirTextoEstado | null>(null);

  const rechazar = (r: ToolRequestRow) =>
    setPedir({
      titulo: `Rechazar ${r.toolName}`,
      etiqueta: "Motivo del rechazo",
      confirmar: "Rechazar",
      minimo: 1,
      peligro: true,
      fn: (adminNotes) => void runAction(r.id, () => rejectToolRequest(token, r.id, adminNotes)),
    });

  // Entregar y recibir piden evidencia (fotos de antes y después): cada uno abre su diálogo.
  const [entregando, setEntregando] = useState<ToolRequestRow | null>(null);
  const [recibiendo, setRecibiendo] = useState<ToolRequestRow | null>(null);
  const [viendo, setViendo] = useState<ToolRequestRow | null>(null);
  const entregar = (r: ToolRequestRow) => setEntregando(r);
  const recibir = (r: ToolRequestRow) => setRecibiendo(r);
  const alTerminar = (mensaje: string) => {
    toast.success(mensaje);
    void load();
  };

  /** Lo que queda tras la búsqueda: sobre esto cuentan los chips de estado. */
  const buscadas = useMemo(() => {
    if (!searchQ.trim()) return items;
    const q = searchQ.toLowerCase();
    return items.filter(
      (r) =>
        r.toolName.toLowerCase().includes(q) ||
        r.requestedByName.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.serialNumber.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q),
    );
  }, [items, searchQ]);

  const visibleItems = useMemo(() => {
    let rows = buscadas;
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [buscadas, filterStatus, highlightId]);

  const ahora = new Date();
  const counts = {
    total: items.length,
    pending: items.filter((t) => t.status === "PENDING").length,
    inUse: items.filter((t) => t.status === "IN_USE").length,
    overdue: items.filter((t) => t.status === "IN_USE" && diaPactadoVencido(t.expectedReturnDate, ahora)).length,
  };
  const alternarEstado = (valor: string) => setFilterStatus((f) => (f === valor ? "" : valor));

  const columns: Column<ToolRequestRow>[] = [
    {
      key: "user",
      label: "Usuario",
      render: (r) => <PersonCell name={r.requestedByName} subtitle={r.requestedByEmail || undefined} size={28} />,
      width: 200,
    },
    {
      key: "tool",
      label: "Herramienta",
      render: (r) => (
        <span className={s.doble}>
          <span className={s.fuerte}>{r.toolName}</span>
          <span className={s.tenue}>
            {r.model} / {r.serialNumber.slice(0, 20)}
          </span>
          <span className={s.tenue} title={r.reason}>
            {r.reason.length > 48 ? `${r.reason.slice(0, 48)}…` : r.reason}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      label: "Estado / timeline",
      render: (r) => {
        const vencida = r.status === "IN_USE" && diaPactadoVencido(r.expectedReturnDate, ahora);
        return (
          <div className={s.estado}>
            <span className={s.insignias}>
              <StatusBadge label={toolRequestStatusLabel(r.status)} tone={tonoDeVariante(toolRequestStatusVariant(r.status))} size="sm" dot />
              {vencida ? <StatusBadge label="Vencida" tone="danger" size="sm" /> : null}
            </span>
            <ToolLoanTimeline
              status={r.status}
              requestDate={r.requestDate}
              approvalDate={r.approvalDate}
              pickedUpAt={r.pickedUpAt}
              deliveryDate={r.deliveryDate}
              returnDate={r.returnDate}
            />
          </div>
        );
      },
      width: 260,
    },
    {
      key: "evidencia",
      label: "Evidencia",
      render: (r) => {
        const falta = faltaEvidencia(r);
        const fotos = r.deliveryPhotos.length + r.returnPhotos.length;
        if (!falta.hay && !falta.entrega && !falta.devolucion) return <span className={s.tenue}>—</span>;
        return (
          <span className={s.insignias}>
            {falta.hay ? (
              <Button size="sm" variant="ghost" onClick={() => setViendo(r)}>
                Ver {fotos} {fotos === 1 ? "foto" : "fotos"}
              </Button>
            ) : null}
            {falta.entrega ? <StatusBadge label="Salió sin foto" tone="warning" size="sm" /> : null}
            {falta.devolucion ? <StatusBadge label="Volvió sin foto" tone="warning" size="sm" /> : null}
          </span>
        );
      },
      width: 170,
    },
    { key: "requestDate", label: "Solicitado", render: (r) => <span className={s.fecha}>{fmtDate(r.requestDate)}</span>, width: 116 },
    {
      key: "expectedReturnDate",
      label: "Devolución",
      render: (r) => <span className={s.fecha}>{textoDiaPactado(r.expectedReturnDate)}</span>,
      width: 116,
    },
    {
      key: "approvedBy",
      label: "Aprobado por",
      accessor: (r) => r.approvedByName ?? "—",
      width: 130,
    },
  ];

  const acciones = (r: ToolRequestRow) => {
    const busy = busyId === r.id;
    return (
      <>
        {r.status === "PENDING" && (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => rechazar(r)}>
              Rechazar
            </Button>
            <Button size="sm" variant="tonal" loading={busy} onClick={() => runAction(r.id, () => approveToolRequest(token, r.id))}>
              Aprobar
            </Button>
          </>
        )}
        {r.status === "APPROVED" && (
          <Button size="sm" variant="tonal" loading={busy} onClick={() => entregar(r)}>
            Entregar
          </Button>
        )}
        {r.status === "IN_USE" && (
          <Button size="sm" variant="tonal" loading={busy} onClick={() => recibir(r)}>
            Devolución
          </Button>
        )}
      </>
    );
  };

  const pendingQueue = useMemo(
    () => items.filter((t) => t.status === "PENDING"),
    [items],
  );

  return (
    <div className={s.pila}>
      {!loading || items.length > 0 ? (
        <StatRow ariaLabel="Resumen de solicitudes" cols={4}>
          <Stat label="Total" value={counts.total} icon={<HandymanOutlined />} iconTone="neutral" onClick={() => setFilterStatus("")} pressed={filterStatus === ""} />
          <Stat
            label="Pendientes"
            value={counts.pending}
            hint="esperan aprobación"
            tone={counts.pending > 0 ? "warning" : "default"}
            icon={<HourglassBottomOutlined />}
            iconTone={counts.pending > 0 ? "warning" : "neutral"}
            onClick={() => alternarEstado("PENDING")}
            pressed={filterStatus === "PENDING"}
          />
          <Stat
            label="En uso"
            value={counts.inUse}
            hint="fuera del almacén"
            tone="brand"
            icon={<PersonOutlineOutlined />}
            onClick={() => alternarEstado("IN_USE")}
            pressed={filterStatus === "IN_USE"}
          />
          <Stat
            label="Vencidas"
            value={counts.overdue}
            hint="pasaron su fecha de devolución"
            tone={counts.overdue > 0 ? "danger" : "success"}
            icon={<ReportProblemOutlined />}
            iconTone={counts.overdue > 0 ? "danger" : "success"}
            semaforo={counts.overdue > 0 ? "rojo" : "verde"}
          />
        </StatRow>
      ) : null}

      {canManage && pendingQueue.length > 0 && (
        <Card aria-label="Cola de aprobación">
          <CardHead title={`Cola de aprobación (${pendingQueue.length})`} subtitle="Lo que espera tu visto bueno para poder entregarse." />
          <ul className={s.cola}>
            {pendingQueue.map((r) => (
              <li key={r.id} className={s.colaFila}>
                <div className={s.colaTexto}>
                  <span className={s.fuerte}>{r.toolName}</span>
                  <PersonCell name={r.requestedByName} subtitle={`${r.model} / ${r.serialNumber}`} size={28} />
                  <ToolLoanTimeline
                    status={r.status}
                    requestDate={r.requestDate}
                    approvalDate={r.approvalDate}
                    pickedUpAt={r.pickedUpAt}
                    deliveryDate={r.deliveryDate}
                    returnDate={r.returnDate}
                  />
                </div>
                <div className={s.colaAcciones}>
                  <Button variant="ghost" disabled={busyId === r.id} onClick={() => rechazar(r)}>
                    Rechazar
                  </Button>
                  <Button
                    variant="tonal"
                    loading={busyId === r.id}
                    onClick={() => runAction(r.id, () => approveToolRequest(token, r.id))}
                  >
                    Aprobar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-label="Solicitudes de herramientas">
        <CardHead title="Solicitudes de herramientas" subtitle="Quién pidió qué, en qué va cada préstamo y cuándo vuelve." />
        {(error || actionError) && (
          <div className={s.avisos}>
            {error && (
              <Alert tone="danger" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}>
                {error}
              </Alert>
            )}
            {actionError && (
              <Alert tone="danger" role="alert" onDismiss={() => setActionError(null)}>
                {actionError}
              </Alert>
            )}
          </div>
        )}

        <ModuleToolbar
          search={
            <SearchInput
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar herramienta, usuario, serie…"
              aria-label="Buscar solicitudes"
            />
          }
          chips={
            <FilterChips ariaLabel="Estado de la solicitud">
              <FilterChip active={filterStatus === ""} count={loading ? undefined : buscadas.length} onClick={() => setFilterStatus("")}>
                Todas
              </FilterChip>
              {STATUS_OPTIONS.map((o) => {
                const n = buscadas.filter((r) => r.status === o.value).length;
                // Un estado sin solicitudes no se ofrece, salvo el que está puesto.
                if (n === 0 && filterStatus !== o.value) return null;
                return (
                  <FilterChip
                    key={o.value}
                    active={filterStatus === o.value}
                    count={n}
                    dot={tonoDeVariante(toolRequestStatusVariant(o.value))}
                    onClick={() => alternarEstado(o.value)}
                  >
                    {o.label}
                  </FilterChip>
                );
              })}
            </FilterChips>
          }
          end={
            <Button
              size="sm"
              variant="ghost"
              iconStart={<FileDownloadOutlined fontSize="small" />}
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
                      format: (v) => textoDiaPactado(v ? String(v) : null),
                    },
                    { key: "deliveredByName", label: "Entregó", format: (v) => String(v ?? "") },
                    { key: "receivedByName", label: "Recibió", format: (v) => String(v ?? "") },
                    {
                      key: "returnCondition",
                      label: "Cómo volvió",
                      format: (v) => (v ? (CONDICION_DEVOLUCION[v as CondicionDevolucion]?.etiqueta ?? String(v)) : ""),
                    },
                    { key: "deliveryPhotos", label: "Fotos de antes", format: (v) => String((v as string[] | null)?.length ?? 0) },
                    { key: "returnPhotos", label: "Fotos de después", format: (v) => String((v as string[] | null)?.length ?? 0) },
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

        {loading && items.length === 0 ? (
          <div className={s.carga}>
            <SkeletonRows rows={5} label="Obteniendo solicitudes de herramientas" />
          </div>
        ) : (
          <DataTable<ToolRequestRow>
            columns={columns}
            rows={visibleItems}
            rowKey={(r) => r.id}
            flush
            ariaLabel="Solicitudes de herramientas"
            rowActions={canManage ? acciones : undefined}
            rowActionsLabel="Acciones"
            emptyTitle="Sin solicitudes"
            emptyDescription="No hay solicitudes con los filtros actuales"
            emptyAction={
              searchQ || filterStatus ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearchQ("");
                    setFilterStatus("");
                  }}
                >
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        )}
        {!loading && visibleItems.length > 0 ? <ListFooter total={visibleItems.length} unit="solicitudes" /> : null}
      </Card>

      <FinesTable tipo="herramienta" showUser={true} />
      <PedirTexto estado={pedir} onCerrar={() => setPedir(null)} />
      <DialogoEntrega
        token={token}
        prestamo={
          entregando
            ? {
                id: entregando.id,
                toolName: entregando.toolName,
                detalle: `${entregando.model} · Serie ${entregando.serialNumber}`,
                persona: entregando.requestedByName === "N/A" ? null : entregando.requestedByName,
                // Solo se pide teclearlo si la solicitud tiene código (las anteriores a los códigos no).
                pideCodigo: Boolean(entregando.pickupCode),
              }
            : null
        }
        onCerrar={() => setEntregando(null)}
        onListo={alTerminar}
      />
      <DialogoDevolucion
        token={token}
        prestamo={
          recibiendo
            ? {
                id: recibiendo.id,
                toolName: recibiendo.toolName,
                detalle: `${recibiendo.model} · Serie ${recibiendo.serialNumber}`,
                persona: recibiendo.requestedByName === "N/A" ? null : recibiendo.requestedByName,
                fotosEntrega: recibiendo.deliveryPhotos,
                entregadaEl: recibiendo.deliveryDate,
              }
            : null
        }
        onCerrar={() => setRecibiendo(null)}
        onListo={alTerminar}
      />
      <VisorEvidencia prestamo={viendo} onCerrar={() => setViendo(null)} />
    </div>
  );
};

export default ToolRequestsTable;
