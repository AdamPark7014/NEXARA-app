"use client";

import { useEffect, useState, useCallback, useDeferredValue, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { FormField, FormGrid } from "@/components/ui/FormField";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { getHrSubmoduleConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { isPaid, isCancelled, isOutstanding } from '@/lib/operational-status';

interface HrStaff {
  id: number;
  nombre: string;
  email?: string;
  department?: { nombre?: string } | null;
}

interface Fine {
  id: number;
  usuarioId?: number;
  tipo?: string;
  razon?: string;
  descripcion?: string;
  monto?: number;
  estatusPago?: string;
  estatusAprobacion?: string;
  fechaCreacion?: string;
  usuario?: { id?: number; nombre?: string; email?: string };
}

/** Motivos de sanción → categoría API + código de razón */
const MOTIVOS = [
  { key: "TARDANZA", tipo: "asistencia", razon: "TARDANZA", label: "Tardanza" },
  { key: "FALTA_INJUSTIFICADA", tipo: "asistencia", razon: "FALTA_INJUSTIFICADA", label: "Falta injustificada" },
  { key: "DANO_VEHICULO", tipo: "vehiculo", razon: "DANO_VEHICULO", label: "Daño a vehículo" },
  { key: "USO_VEHICULO_INDEBIDO", tipo: "vehiculo", razon: "USO_VEHICULO_INDEBIDO", label: "Uso indebido de vehículo" },
  { key: "HERRAMIENTA_PERDIDA", tipo: "herramienta", razon: "HERRAMIENTA_PERDIDA", label: "Herramienta perdida" },
  { key: "COMPORTAMIENTO", tipo: "actividad", razon: "COMPORTAMIENTO", label: "Comportamiento" },
  { key: "OTRO", tipo: "actividad", razon: "OTRO", label: "Otro" },
] as const;

const ESTATUS_PAGO = [
  { value: "Pendiente", label: "Pendiente" },
  { value: "Pagado", label: "Aplicado en nómina" },
  { value: "Apelado", label: "Apelado" },
  { value: "Cancelado", label: "Cancelado" },
];
const ESTATUS_PAGO_LABEL: Record<string, string> = Object.fromEntries(ESTATUS_PAGO.map((s) => [s.value, s.label]));

const APROBACION_LABEL: Record<string, string> = {
  Pendiente: "Por autorizar",
  Aprobado: "Autorizada",
  Rechazado: "Rechazada",
};

const HTTP_FALLBACK: Record<number, string> = {
  400: "Revisa los datos capturados.",
  401: "Tu sesión expiró. Vuelve a iniciar sesión.",
  403: "No tienes permiso para esta acción.",
  404: "No encontramos la sanción.",
};

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const readable = text.trim().startsWith("<") ? "" : text;
    throw new Error(readable || HTTP_FALLBACK[res.status] || "El servidor no respondió. Intenta de nuevo en unos minutos.");
  }
  return res.json();
}

const emptyForm = {
  usuarioId: "",
  motivoKey: "TARDANZA",
  descripcion: "",
  monto: 0,
  estatusPago: "Pendiente",
};

function motivoFromFine(f: Fine): string {
  const match = MOTIVOS.find((m) => m.razon === f.razon && m.tipo === f.tipo);
  return match?.key ?? MOTIVOS.find((m) => m.razon === f.razon)?.key ?? "OTRO";
}

function motivoLabel(f: Fine): string {
  const known = MOTIVOS.find((m) => m.razon === f.razon)?.label;
  if (known) return known;
  if (!f.razon) return "Sin motivo";
  const text = f.razon.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function daysLabel(days: number): string {
  if (days <= 0) return "Hoy";
  return days === 1 ? "1 día" : `${days} días`;
}

export default function FinesPage() {
  const { user } = useUser();
  const cfg = useHrManagementGuard();
  const viewCfg = useMemo(() => getHrSubmoduleConfig(user, "fines"), [user]);
  const token = user?.token ?? "";
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [items, setItems] = useState<Fine[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);
  const [filterMotivo, setFilterMotivo] = useState("");
  const [filterPago, setFilterPago] = useState("");
  const [filterAprobacion, setFilterAprobacion] = useState("");
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fine | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formDirty, setFormDirty] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    setHighlightId(new URLSearchParams(window.location.search).get("highlight"));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Sin `limit`, el API regresa la plantilla completa en un arreglo (no paginado):
      // con `?limit=100` alguien quedaba fuera del selector sin ningún aviso.
      const [finesData, staffData] = await Promise.all([
        apiFetch("fines", token),
        apiFetch("users/hr-staff", token),
      ]);
      setItems(Array.isArray(finesData) ? finesData : (finesData?.data ?? []));
      setStaff(Array.isArray(staffData) ? staffData : (staffData?.data ?? []));
      setLoaded(true);
      setLoadError(null);
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudieron cargar las sanciones."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchForm = (patch: Partial<typeof emptyForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFormDirty(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormDirty(false);
    setSaveErr(null);
    setShowForm(true);
  };

  const openEdit = (f: Fine) => {
    setEditing(f);
    setForm({
      usuarioId: String(f.usuarioId ?? f.usuario?.id ?? ""),
      motivoKey: motivoFromFine(f),
      descripcion: f.descripcion ?? "",
      monto: Number(f.monto ?? 0),
      estatusPago: f.estatusPago ?? "Pendiente",
    });
    setFormDirty(false);
    setSaveErr(null);
    setShowForm(true);
  };

  const montoError = Number.isNaN(form.monto) || form.monto < 0 ? "El monto no puede ser negativo." : null;

  const save = async () => {
    if (!token) return;
    const motivo = MOTIVOS.find((m) => m.key === form.motivoKey) ?? MOTIVOS[0];
    if (!editing && !form.usuarioId) {
      setSaveErr("Elige a la persona a la que aplica la sanción.");
      return;
    }
    if (montoError) {
      setSaveErr(montoError);
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      if (editing) {
        const updated = await apiFetch(`fines/${editing.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            razon: motivo.razon,
            descripcion: form.descripcion || undefined,
            monto: form.monto,
            estatusPago: form.estatusPago,
          }),
        });
        setItems((prev) => prev.map((f) => (f.id === editing.id ? { ...f, ...updated } : f)));
        toast.success("Sanción actualizada");
      } else {
        const created = await apiFetch("fines", token, {
          method: "POST",
          body: JSON.stringify({
            usuarioId: Number(form.usuarioId),
            tipo: motivo.tipo,
            razon: motivo.razon,
            descripcion: form.descripcion || undefined,
            monto: form.monto,
          }),
        });
        setItems((prev) => [created, ...prev]);
        toast.success("Sanción registrada");
      }
      setShowForm(false);
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar la sanción."));
    } finally {
      setSaving(false);
    }
  };

  const remove = (f: Fine) => {
    if (!token) return;
    setConfirmState({
      title: "Eliminar sanción",
      message: `Se eliminará la sanción de ${f.usuario?.nombre ?? "esta persona"} (${motivoLabel(f)}). Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar sanción",
      fn: async () => {
        try {
          await apiFetch(`fines/${f.id}`, token, { method: "DELETE" });
          setItems((prev) => prev.filter((x) => x.id !== f.id));
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo eliminar la sanción."));
        }
      },
    });
  };

  const approveFine = async (id: number, action: "approve" | "reject") => {
    if (!token) return;
    setBusyId(id);
    try {
      await apiFetch(`fines/${id}/approve`, token, { method: "PATCH", body: JSON.stringify({ action }) });
      toast.success(action === "approve" ? "Sanción autorizada" : "Sanción rechazada");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo registrar la autorización."));
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems = useMemo(() => {
    let result = items;
    const q = deferredQ.trim().toLowerCase();
    if (q) {
      result = result.filter((f) =>
        (f.usuario?.nombre ?? "").toLowerCase().includes(q) ||
        (f.usuario?.email ?? "").toLowerCase().includes(q) ||
        (f.descripcion ?? "").toLowerCase().includes(q)
      );
    }
    if (filterMotivo) {
      const m = MOTIVOS.find((x) => x.key === filterMotivo);
      if (m) result = result.filter((f) => f.razon === m.razon && f.tipo === m.tipo);
    }
    if (filterPago) result = result.filter((f) => f.estatusPago === filterPago);
    if (filterAprobacion) result = result.filter((f) => (f.estatusAprobacion ?? "Pendiente") === filterAprobacion);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) result = [...result].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return result;
  }, [items, highlightId, deferredQ, filterMotivo, filterPago, filterAprobacion]);

  const stats = useMemo(() => {
    let pendingApproval = 0, paid = 0, total = 0;
    const byRazon = new Map<string, number>();
    for (const f of items) {
      if (f.estatusAprobacion === "Pendiente") pendingApproval++;
      if (isPaid(f.estatusPago)) paid++;
      total += Number(f.monto ?? 0);
      if (f.razon) byRazon.set(f.razon, (byRazon.get(f.razon) ?? 0) + 1);
    }
    const byTipo = MOTIVOS
      .map((m) => ({ label: m.label, count: byRazon.get(m.razon) ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
    return { pendingApproval, paid, total, byTipo };
  }, [items]);

  const clearFilters = () => { setSearchQ(""); setFilterMotivo(""); setFilterPago(""); setFilterAprobacion(""); };
  const hasFilters = Boolean(searchQ || filterMotivo || filterPago || filterAprobacion);

  const columns: Column<Fine>[] = [
    {
      key: "usuario",
      label: "Persona",
      render: (f) => (
        <div>
          {f.usuario?.id ? (
            <Link href={`/erp/hr/${f.usuario.id}`} style={{ fontWeight: 600, fontSize: 13.5, color: "var(--primary)", textDecoration: "none" }}>{f.usuario.nombre ?? "Sin nombre"}</Link>
          ) : (
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.usuario?.nombre ?? "Sin asignar"}</div>
          )}
          {f.usuario?.email && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{f.usuario.email}</div>}
          {highlightId && String(f.id) === highlightId && <Tag size="sm" variant="accent">Enlace directo</Tag>}
        </div>
      ),
      width: 200,
    },
    {
      key: "razon",
      label: "Motivo",
      render: (f) => <Tag size="sm" variant="warning">{motivoLabel(f)}</Tag>,
      width: 170,
    },
    {
      key: "descripcion",
      label: "Descripción",
      render: (f) => f.descripcion
        ? <span style={{ fontSize: 13, maxWidth: "60ch", display: "inline-block" }}>{f.descripcion}</span>
        : <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin descripción</span>,
    },
    { key: "monto", label: "Monto", render: (f) => <Money value={Number(f.monto ?? 0)} />, width: 120, numeric: true, align: "right" },
    {
      key: "fechaCreacion", label: "Registrada hace",
      render: (f) => {
        if (!f.fechaCreacion) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const days = Math.max(0, Math.floor((Date.now() - new Date(f.fechaCreacion).getTime()) / 86400000));
        const isPending = isOutstanding(f.estatusPago);
        const color = !isPending ? "var(--text-tertiary)" : days >= 30 ? "var(--danger)" : days >= 14 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={new Date(f.fechaCreacion).toLocaleDateString("es-MX", { dateStyle: "long" })}>
            {isPending && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />}
            <span style={{ fontSize: 12.5, fontWeight: isPending && days >= 14 ? 700 : 400, color, fontVariantNumeric: "tabular-nums" }}>{daysLabel(days)}</span>
          </div>
        );
      },
      width: 130,
    },
    {
      key: "estatusAprobacion",
      label: "Autorización",
      render: (f) => (
        <Tag size="sm" dot variant={f.estatusAprobacion === "Aprobado" ? "positive" : f.estatusAprobacion === "Rechazado" ? "danger" : "warning"}>
          {APROBACION_LABEL[f.estatusAprobacion ?? "Pendiente"] ?? f.estatusAprobacion}
        </Tag>
      ),
      width: 140,
    },
    {
      key: "estatusPago",
      label: "Estado",
      render: (f) => (
        <Tag size="sm" variant={isPaid(f.estatusPago) ? "neutral" : isCancelled(f.estatusPago) ? "danger" : "warning"}>
          {ESTATUS_PAGO_LABEL[f.estatusPago ?? "Pendiente"] ?? f.estatusPago}
        </Tag>
      ),
      width: 150,
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (f) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {cfg.canApprove && f.estatusAprobacion === "Pendiente" && (
            <>
              <Button size="sm" variant="primary" loading={busyId === f.id} onClick={() => void approveFine(f.id, "approve")}>Autorizar</Button>
              <Button size="sm" variant="ghost" disabled={busyId === f.id} onClick={() => void approveFine(f.id, "reject")}>Rechazar</Button>
            </>
          )}
          {cfg.canEdit && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(f)} aria-label={`Editar sanción de ${f.usuario?.nombre ?? "persona"}`}>Editar</Button>
          )}
          {cfg.canApprove && (
            <Button size="sm" variant="danger" onClick={() => remove(f)} aria-label={`Eliminar sanción de ${f.usuario?.nombre ?? "persona"}`}>Eliminar</Button>
          )}
        </div>
      ),
      width: 300,
    },
  ];

  const initialLoading = loading && !loaded;
  const inp: React.CSSProperties = {
    width: "100%",
    minHeight: 40,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--foreground)",
    boxSizing: "border-box",
  };

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {visibleItems.length > 0 && (
              <Button variant="ghost" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
                { key: "id", label: "Folio" },
                { key: "usuario", label: "Persona", format: (v) => (v as Fine["usuario"])?.nombre ?? "—" },
                { key: "razon", label: "Motivo", format: (_v, row) => motivoLabel(row as Fine) },
                { key: "descripcion", label: "Descripción" },
                { key: "monto", label: "Monto (MXN)" },
                { key: "estatusPago", label: "Estado", format: (v) => ESTATUS_PAGO_LABEL[String(v ?? "Pendiente")] ?? String(v ?? "") },
                { key: "estatusAprobacion", label: "Autorización", format: (v) => APROBACION_LABEL[String(v ?? "Pendiente")] ?? String(v ?? "") },
                { key: "fechaCreacion", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
              ], "sanciones")}>Exportar a Excel</Button>
            )}
            {cfg.canCreate && <Button variant="primary" onClick={openNew}>Nueva sanción</Button>}
          </div>
        }
      />

      <HrModuleRail />

      {loaded && loadError && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${loadError} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      {loaded && items.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MetricStrip
            ariaLabel="Resumen de sanciones"
            metrics={[
              { label: "Sanciones", value: items.length, onClick: clearFilters },
              {
                label: "Por autorizar",
                value: stats.pendingApproval,
                tone: stats.pendingApproval > 0 ? "warning" : "success",
                onClick: () => setFilterAprobacion("Pendiente"),
              },
              { label: "Aplicadas en nómina", value: stats.paid, onClick: () => setFilterPago("Pagado") },
              { label: "Monto total", value: <Money value={stats.total} compact />, hint: "Todas las sanciones registradas" },
            ]}
          />
        </div>
      )}

      {loaded && stats.byTipo.length > 0 && (
        <section aria-label="Sanciones por motivo" style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Sanciones por motivo</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.byTipo.map((row) => (
              <li key={row.label} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 180px) 1fr 36px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>{row.label}</span>
                <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(row.count / items.length) * 100}%`, background: "var(--danger)", borderRadius: 3, transition: "width .4s" }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por persona o descripción…", ariaLabel: "Buscar sanciones" }}
        selects={[
          {
            label: "Motivo",
            value: filterMotivo,
            onChange: setFilterMotivo,
            options: MOTIVOS.map((m) => ({ value: m.key, label: m.label })),
            allowAll: true,
          },
          {
            label: "Estado",
            value: filterPago,
            onChange: setFilterPago,
            options: ESTATUS_PAGO,
            allowAll: true,
          },
          {
            label: "Autorización",
            value: filterAprobacion,
            onChange: setFilterAprobacion,
            options: Object.entries(APROBACION_LABEL).map(([value, label]) => ({ value, label })),
            allowAll: true,
          },
        ]}
        onClear={clearFilters}
        resultCount={loaded ? visibleItems.length : null}
      />

      <Section title="Sanciones registradas">
        {highlightId && (
          <InlineAlert
            variant="info"
            dense
            message="Abriste esta página desde un enlace directo: la sanción indicada aparece primero."
            onDismiss={() => setHighlightId(null)}
            style={{ marginBottom: 12 }}
          />
        )}
        {initialLoading && <SkeletonList rows={5} tableLike />}
        {!loaded && !loading && loadError && (
          <InlineAlert
            variant="danger"
            title="No se pudieron cargar las sanciones"
            message={loadError}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(f) => f.id}
            ariaLabel="Sanciones"
            emptyTitle={hasFilters ? "Ninguna sanción coincide" : "Sin sanciones registradas"}
            emptyDescription={hasFilters ? "Prueba con otra búsqueda o quita los filtros." : "Registra una sanción solo cuando haya una incidencia documentada."}
            emptyAction={hasFilters ? <Button size="sm" variant="secondary" onClick={clearFilters}>Quitar filtros</Button> : undefined}
          />
        )}
      </Section>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        dirty={formDirty && !saving}
        maxWidth={560}
        title={editing ? "Editar sanción" : "Nueva sanción"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!!montoError || (!!editing && !formDirty)}>
              {editing ? "Guardar cambios" : "Registrar sanción"}
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Persona" fullWidth>
            {editing ? (
              <input value={staff.find((s) => String(s.id) === form.usuarioId)?.nombre ?? editing.usuario?.nombre ?? "—"} disabled style={{ ...inp, opacity: 0.7 }} />
            ) : (
              <select value={form.usuarioId} onChange={(e) => patchForm({ usuarioId: e.target.value })} style={inp} required>
                <option value="">Elige a la persona</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {s.department?.nombre ? ` · ${s.department.nombre}` : ""}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Motivo">
            <select value={form.motivoKey} onChange={(e) => patchForm({ motivoKey: e.target.value })} style={inp}>
              {MOTIVOS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </FormField>
          {editing && (
            <FormField label="Estado">
              <select value={form.estatusPago} onChange={(e) => patchForm({ estatusPago: e.target.value })} style={inp}>
                {ESTATUS_PAGO.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Monto a descontar (MXN)" error={montoError} hint="Escribe 0 si solo es una amonestación.">
            <input type="number" inputMode="decimal" min={0} step="0.01" value={form.monto} onChange={(e) => patchForm({ monto: +e.target.value })} style={{ ...inp, fontVariantNumeric: "tabular-nums" }} />
          </FormField>
          <FormField label="Descripción del hecho" fullWidth optional hint="Qué pasó, cuándo y dónde. Ayuda si la persona apela.">
            <textarea rows={3} value={form.descripcion} onChange={(e) => patchForm({ descripcion: e.target.value })} style={{ ...inp, resize: "vertical" }} />
          </FormField>
        </FormGrid>
        {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 14 }} />}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
