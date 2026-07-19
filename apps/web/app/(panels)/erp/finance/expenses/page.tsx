"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import FileDropzone from "@/components/ui/FileDropzone";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import {
  FinanceField,
  FinanceFormGrid,
  FinanceModuleShell,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { getApiAssetOrigin } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { exportToExcel } from "@/lib/export-excel";
import { filterRowsByScope, getErpExpensesSectionConfig } from "@/lib/section-views";
import {
  EXPENSE_CATEGORIES,
  approveExpense,
  deleteExpense,
  downloadExpensesReportPdf,
  fetchExpensesAnalytics,
  financeFetch,
  markExpensePagado,
  patchExpenseAdmin,
  postExpenseAdmin,
  type ExpensesAnalytics,
} from "@/lib/finance-api";

type ExpenseEstado = "Pendiente" | "Aprobado" | "Pagado" | "Rechazado";

interface Expense {
  id: number;
  concepto?: string;
  monto?: number;
  categoria?: string;
  estado?: ExpenseEstado | string;
  fecha?: string;
  esRecurrente?: boolean;
  ticketEvidenciaUrl?: string | null;
  isAdministrative?: boolean;
  creadoPor?: { id?: number; nombre?: string };
}

const ESTADOS: ExpenseEstado[] = ["Pendiente", "Aprobado", "Pagado", "Rechazado"];

const emptyForm = {
  concepto: "",
  monto: 0,
  categoria: "Servicios",
  esRecurrente: false,
  fecha: new Date().toISOString().slice(0, 10),
};

function assetUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiAssetOrigin().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function mapExpenseRow(raw: Record<string, unknown>): Expense {
  const fechaRaw = raw.fechaGasto ?? raw.fechaSolicitud ?? raw.fecha;
  return {
    id: Number(raw.id),
    concepto: String(raw.concepto ?? raw.razonGasto ?? "—"),
    monto: Number(raw.montoSolicitado ?? raw.monto ?? 0),
    categoria: raw.categoria ? String(raw.categoria) : undefined,
    estado: String(raw.estatusPago ?? raw.estado ?? "Pendiente"),
    fecha: fechaRaw ? String(fechaRaw).slice(0, 10) : undefined,
    esRecurrente: Boolean(raw.esRecurrente),
    ticketEvidenciaUrl: (raw.ticketEvidenciaUrl as string | null | undefined) ?? null,
    isAdministrative: Boolean(raw.isAdministrative),
    creadoPor: (raw.usuario ?? raw.creadoPor ?? raw.createdBy) as Expense["creadoPor"],
  };
}

export default function ExpensesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpExpensesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"lista" | "analytics">("lista");
  const [searchQ, setSearchQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<ExpensesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await financeFetch("expenses", token);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => mapExpenseRow(r)));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los gastos"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const data = await fetchExpensesAnalytics(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setAnalytics(data);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar analytics"));
    } finally {
      setAnalyticsLoading(false);
    }
  }, [token, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "analytics") void loadAnalytics();
  }, [tab, loadAnalytics]);

  const visibleItems = useMemo(() => {
    let result = filterRowsByScope(items, user, cfg.defaultScope);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(
        (e) =>
          (e.concepto ?? "").toLowerCase().includes(q) ||
          (e.creadoPor?.nombre ?? "").toLowerCase().includes(q) ||
          (e.categoria ?? "").toLowerCase().includes(q),
      );
    }
    if (filterCat) result = result.filter((e) => e.categoria === filterCat);
    if (filterEstado) result = result.filter((e) => e.estado === filterEstado);
    return result;
  }, [items, user, cfg.defaultScope, searchQ, filterCat, filterEstado]);

  const pendientes = visibleItems.filter((e) => e.estado === "Pendiente").length;
  const aprobados = visibleItems.filter((e) => e.estado === "Aprobado").length;
  const pagadoMonto = visibleItems
    .filter((e) => e.estado === "Pagado")
    .reduce((s, e) => s + (e.monto ?? 0), 0);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setEvidenceFile(null);
    setSaveErr(null);
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      concepto: e.concepto ?? "",
      monto: e.monto ?? 0,
      categoria: e.categoria ?? "Servicios",
      esRecurrente: e.esRecurrente ?? false,
      fecha: e.fecha?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    });
    setEvidenceFile(null);
    setSaveErr(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !form.concepto.trim() || !form.monto) return;
    if (!editing && !evidenceFile) {
      setSaveErr("Adjunta el comprobante del gasto.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const fields = {
        concepto: form.concepto.trim(),
        monto: form.monto,
        categoria: form.categoria,
        esRecurrente: form.esRecurrente,
        fecha: form.fecha,
        usuarioId: user?.id,
      };
      const row = editing
        ? await patchExpenseAdmin(token, editing.id, fields, evidenceFile)
        : await postExpenseAdmin(token, fields, evidenceFile);
      const mapped = mapExpenseRow(row as Record<string, unknown>);
      setItems((prev) =>
        editing ? prev.map((x) => (x.id === editing.id ? mapped : x)) : [mapped, ...prev],
      );
      setShowForm(false);
      toast.success(editing ? "Gasto actualizado" : "Gasto registrado");
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el gasto"));
    } finally {
      setSaving(false);
    }
  };

  const runApprove = (e: Expense) => {
    setConfirmState({
      message: `¿Autorizar el gasto "${e.concepto}"?`,
      confirmLabel: "Autorizar",
      fn: async () => {
        try {
          const updated = await approveExpense(token, e.id, "approve");
          setItems((prev) =>
            prev.map((x) => (x.id === e.id ? mapExpenseRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Gasto autorizado");
        } catch (err) {
          toast.error(formatApiError(err, "No se pudo autorizar"));
        }
      },
    });
  };

  const submitReject = async () => {
    if (!token || !rejectTarget) return;
    setSaving(true);
    try {
      const updated = await approveExpense(token, rejectTarget.id, "reject", rejectNote.trim() || undefined);
      setItems((prev) =>
        prev.map((x) =>
          x.id === rejectTarget.id ? mapExpenseRow(updated as Record<string, unknown>) : x,
        ),
      );
      setRejectTarget(null);
      setRejectNote("");
      toast.success("Gasto rechazado");
    } catch (err) {
      toast.error(formatApiError(err, "No se pudo rechazar"));
    } finally {
      setSaving(false);
    }
  };

  const runMarkPagado = (e: Expense) => {
    setConfirmState({
      message: `¿Marcar como pagado "${e.concepto}"?`,
      confirmLabel: "Marcar pagado",
      fn: async () => {
        try {
          const updated = await markExpensePagado(token, e.id);
          setItems((prev) =>
            prev.map((x) => (x.id === e.id ? mapExpenseRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Marcado como pagado");
        } catch (err) {
          toast.error(formatApiError(err, "No se pudo marcar pagado"));
        }
      },
    });
  };

  const remove = (e: Expense) => {
    setConfirmState({
      message: `¿Eliminar el gasto "${e.concepto}"?`,
      confirmLabel: "Eliminar",
      fn: async () => {
        try {
          await deleteExpense(token, e.id);
          setItems((prev) => prev.filter((x) => x.id !== e.id));
          toast.success("Gasto eliminado");
        } catch (err) {
          toast.error(formatApiError(err, "No se pudo eliminar"));
        }
      },
    });
  };

  const downloadPdf = async () => {
    if (!token) return;
    try {
      await downloadExpensesReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el PDF"));
    }
  };

  const estadoVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" | "positive" => {
    if (s === "Pagado") return "positive";
    if (s === "Aprobado") return "accent";
    if (s === "Rechazado") return "danger";
    return "warning";
  };

  const columns: Column<Expense>[] = [
    {
      key: "concepto",
      label: "Concepto",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{e.concepto ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {e.categoria ?? "Sin categoría"}
            {e.esRecurrente ? " · Recurrente" : ""}
          </div>
        </div>
      ),
    },
    {
      key: "monto",
      label: "Monto",
      render: (e) => <Money value={e.monto ?? 0} />,
      width: 110,
    },
    {
      key: "fecha",
      label: "Fecha",
      render: (e) => (
        <span style={{ fontSize: 12 }}>
          {e.fecha
            ? new Date(`${e.fecha}T12:00:00`).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—"}
        </span>
      ),
      width: 110,
    },
    {
      key: "creadoPor",
      label: "Creado por",
      accessor: (e) => e.creadoPor?.nombre ?? "—",
      width: 130,
    },
    {
      key: "ticketEvidenciaUrl",
      label: "Comprobante",
      render: (e) => {
        const href = assetUrl(e.ticketEvidenciaUrl);
        return href ? (
          <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--primary)" }}>
            Ver
          </a>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
        );
      },
      width: 90,
    },
    {
      key: "estado",
      label: "Estado",
      render: (e) => <Tag variant={estadoVariant(e.estado)}>{e.estado ?? "—"}</Tag>,
      width: 110,
    },
    {
      key: "id",
      label: "",
      render: (e) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {cfg.canEdit && e.estado === "Pendiente" && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
              Editar
            </Button>
          )}
          {cfg.canApprove && e.estado === "Pendiente" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => runApprove(e)}>
                Autorizar
              </Button>
              <Button size="sm" variant="danger" onClick={() => { setRejectTarget(e); setRejectNote(""); }}>
                Rechazar
              </Button>
            </>
          )}
          {cfg.canApprove && e.estado === "Aprobado" && (
            <Button size="sm" variant="ghost" onClick={() => runMarkPagado(e)}>
              Marcar pagado
            </Button>
          )}
          {cfg.canDelete && (
            <Button size="sm" variant="ghost" onClick={() => remove(e)}>
              Eliminar
            </Button>
          )}
        </div>
      ),
      width: 280,
    },
  ];

  return (
    <>
      <FinanceModuleShell
        eyebrow="ERP · Finanzas"
        title={cfg.title || "Gastos · Admin"}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>
              Actualizar
            </Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={openNew}>
                Nuevo gasto
              </Button>
            )}
          </>
        }
        kpis={
          <>
            <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} />
            <KpiCard label="Aprobados" value={aprobados} variant="accent" />
            <KpiCard label="Pagado" value={<Money value={pagadoMonto} compact />} variant="positive" />
            <KpiCard label="Total registros" value={visibleItems.length} />
          </>
        }
        tabs={[
          { id: "lista", label: "Lista" },
          { id: "analytics", label: "Analytics" },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as "lista" | "analytics")}
      >
        {tab === "analytics" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              <FinanceField label="Desde">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={financeInputStyle} />
              </FinanceField>
              <FinanceField label="Hasta">
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={financeInputStyle} />
              </FinanceField>
              <Button size="sm" variant="secondary" onClick={() => void loadAnalytics()}>
                Aplicar
              </Button>
              <Button size="sm" variant="primary" onClick={() => void downloadPdf()}>
                Descargar PDF
              </Button>
            </div>
            {analyticsLoading && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
            )}
            {!analyticsLoading && analytics && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  <KpiCard label="Registros" value={analytics.count} />
                  <KpiCard label="Pendientes" value={analytics.pendientes} variant="warning" />
                  <KpiCard label="Aprobado" value={<Money value={analytics.totalAprobado} compact />} variant="positive" />
                  <KpiCard label="Pagado" value={<Money value={analytics.totalPagado} compact />} />
                </div>
                {(
                  [
                    ["Por categoría", analytics.byCategory],
                    ["Por persona", analytics.byPerson],
                  ] as const
                ).map(([title, rows]) => (
                  <div
                    key={title}
                    style={{
                      padding: 14,
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--surface-2, var(--surface))",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {title}
                    </div>
                    {!rows.length && (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>
                    )}
                    {rows.slice(0, 12).map((r) => (
                      <div
                        key={r.name}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 12,
                          padding: "6px 0",
                          borderBottom: "1px solid var(--border)",
                          fontSize: 13,
                        }}
                      >
                        <span>{r.name}</span>
                        <span style={{ color: "var(--text-tertiary)" }}>{r.count} reg.</span>
                        <Money value={r.total} />
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <>
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto…" }}
              selects={[
                {
                  label: "Categoría",
                  value: filterCat,
                  onChange: setFilterCat,
                  options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })),
                  allowAll: true,
                },
                {
                  label: "Estado",
                  value: filterEstado,
                  onChange: setFilterEstado,
                  options: ESTADOS.map((s) => ({ value: s, label: s })),
                  allowAll: true,
                },
              ]}
              onClear={() => {
                setSearchQ("");
                setFilterCat("");
                setFilterEstado("");
              }}
              resultCount={loading ? null : visibleItems.length}
              rightActions={
                visibleItems.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft="⬇"
                    onClick={() =>
                      exportToExcel(
                        visibleItems,
                        [
                          { key: "concepto", label: "Concepto" },
                          { key: "monto", label: "Monto", format: (v) => `${Number(v).toFixed(2)}` },
                          { key: "categoria", label: "Categoría" },
                          { key: "estado", label: "Estado" },
                          { key: "fecha", label: "Fecha" },
                        ],
                        "gastos",
                      )
                    }
                  >
                    Excel
                  </Button>
                ) : undefined
              }
            />
            {error && (
              <div
                role="alert"
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  background: "var(--state-warning-bg)",
                  border: "1px solid var(--state-warning-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                {error}{" "}
                <Button size="sm" variant="ghost" onClick={() => void load()}>
                  Reintentar
                </Button>
              </div>
            )}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : !error ? (
              <DataTable
                columns={columns}
                rows={visibleItems}
                rowKey={(e) => e.id}
                emptyTitle="Sin gastos"
                emptyDescription="Registra el primer gasto administrativo."
              />
            ) : null}
          </>
        )}
      </FinanceModuleShell>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar gasto" : "Nuevo gasto"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={saving || !form.concepto.trim() || !form.monto || (!editing && !evidenceFile)}
            >
              {saving ? "Guardando…" : editing ? "Guardar" : "Crear gasto"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Concepto" fullWidth>
            <input
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Renta oficinas, internet, SaaS…"
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Categoría">
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              style={financeInputStyle}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FinanceField>
          <FinanceField label="Monto ($)">
            <input
              type="number"
              min={0}
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: Number(e.target.value) }))}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Fecha">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              style={financeInputStyle}
            />
          </FinanceField>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
            <input
              type="checkbox"
              id="recurrente"
              checked={form.esRecurrente}
              onChange={(e) => setForm((f) => ({ ...f, esRecurrente: e.target.checked }))}
            />
            <label htmlFor="recurrente" style={{ fontSize: 13, fontWeight: 500 }}>
              Gasto recurrente mensual
            </label>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={evidenceFile}
              onFile={setEvidenceFile}
              label="Comprobante"
              required={!editing}
              hint={editing ? "Opcional · reemplaza el archivo actual" : "Obligatorio · PDF o imagen"}
            />
            {editing?.ticketEvidenciaUrl && !evidenceFile && (
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                Actual:{" "}
                <a href={assetUrl(editing.ticketEvidenciaUrl) ?? "#"} target="_blank" rel="noreferrer">
                  ver comprobante
                </a>
              </div>
            )}
          </div>
          {saveErr && (
            <div
              role="alert"
              style={{
                gridColumn: "1 / -1",
                padding: "8px 12px",
                background: "var(--state-danger-bg, #fef2f2)",
                border: "1px solid var(--danger)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--danger)",
              }}
            >
              {saveErr}
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Rechazar gasto"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void submitReject()} disabled={saving}>
              {saving ? "Guardando…" : "Rechazar"}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
          {rejectTarget?.concepto} · <Money value={rejectTarget?.monto ?? 0} />
        </p>
        <FinanceField label="Nota (opcional)">
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            placeholder="Motivo del rechazo"
            style={{ ...financeInputStyle, resize: "vertical" }}
          />
        </FinanceField>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
