"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import {
  deleteEmployeePayment,
  downloadEmployeePaymentsReportPdf,
  fetchEmployeePaymentsAnalytics,
  financeFetch,
  markEmployeePaymentPagado,
  patchEmployeePayment,
  postEmployeePayment,
  type EmployeePaymentsAnalytics,
} from "@/lib/finance-api";

type PaymentStatus = "Borrador" | "Pagado" | "Anulado";

interface Payment {
  id: number;
  userId: number;
  concepto?: string | null;
  periodFrom: string;
  periodTo: string;
  amount: number;
  note?: string | null;
  status?: PaymentStatus | string;
  evidenceUrls?: string[];
  paidAt?: string | null;
  user?: { id?: number; nombre?: string };
}

interface ApiUserLite {
  id: number;
  nombre: string;
}

const STATUSES: PaymentStatus[] = ["Borrador", "Pagado", "Anulado"];

const emptyForm = {
  userId: "",
  concepto: "",
  periodFrom: "",
  periodTo: "",
  amount: 0,
  note: "",
  status: "Borrador" as PaymentStatus,
};

function assetUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiAssetOrigin().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function mapPaymentRow(raw: Record<string, unknown>): Payment {
  return {
    id: Number(raw.id),
    userId: Number(raw.userId),
    concepto: (raw.concepto as string | null | undefined) ?? null,
    periodFrom: String(raw.periodFrom ?? "").slice(0, 10),
    periodTo: String(raw.periodTo ?? "").slice(0, 10),
    amount: Number(raw.amount ?? 0),
    note: (raw.note as string | null | undefined) ?? null,
    status: String(raw.status ?? "Borrador"),
    evidenceUrls: Array.isArray(raw.evidenceUrls) ? (raw.evidenceUrls as string[]) : [],
    paidAt: raw.paidAt ? String(raw.paidAt) : null,
    user: raw.user as Payment["user"],
  };
}

export default function EmployeePaymentsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "employee-payments"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Payment[]>([]);
  const [users, setUsers] = useState<ApiUserLite[]>([]);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"lista" | "analytics">("lista");
  const [searchQ, setSearchQ] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<EmployeePaymentsAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [data, usersData] = await Promise.all([
        financeFetch("employee-payments", token),
        financeFetch("users", token).catch((e) => {
          setUsersErr(e instanceof Error ? e.message : "No se cargó el catálogo de empleados");
          return [];
        }),
      ]);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => mapPaymentRow(r)));
      const userRows = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);
      setUsers(
        userRows.map((u: { id: number; nombre?: string }) => ({
          id: u.id,
          nombre: u.nombre || `#${u.id}`,
        })),
      );
    } catch (e) {
      setError(formatApiError(e, "Error al cargar pagos"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const data = await fetchEmployeePaymentsAnalytics(token, {
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
    let result = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(
        (p) =>
          (p.user?.nombre ?? "").toLowerCase().includes(q) ||
          (p.concepto ?? "").toLowerCase().includes(q) ||
          (p.note ?? "").toLowerCase().includes(q),
      );
    }
    if (filterUser) result = result.filter((p) => String(p.userId) === filterUser);
    if (filterStatus) result = result.filter((p) => p.status === filterStatus);
    return result;
  }, [items, searchQ, filterUser, filterStatus]);

  const totalPagado = visibleItems
    .filter((p) => p.status === "Pagado")
    .reduce((s, p) => s + p.amount, 0);
  const borradores = visibleItems.filter((p) => p.status === "Borrador").length;
  const empleados = new Set(visibleItems.map((p) => p.userId)).size;

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setEvidenceFiles([]);
    setSaveErr(null);
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    setEditing(p);
    setForm({
      userId: String(p.userId),
      concepto: p.concepto ?? "",
      periodFrom: p.periodFrom.slice(0, 10),
      periodTo: p.periodTo.slice(0, 10),
      amount: p.amount,
      note: p.note ?? "",
      status: (p.status as PaymentStatus) || "Borrador",
    });
    setEvidenceFiles([]);
    setSaveErr(null);
    setShowForm(true);
  };

  const submit = async () => {
    if (!token || !form.userId || !form.periodFrom || !form.periodTo || !form.amount) return;
    setSaving(true);
    setSaveErr(null);
    try {
      if (editing) {
        const updated = await patchEmployeePayment(
          token,
          editing.id,
          {
            concepto: form.concepto.trim() || undefined,
            periodFrom: form.periodFrom,
            periodTo: form.periodTo,
            amount: form.amount,
            note: form.note.trim() || undefined,
            status: form.status,
          },
          evidenceFiles.length ? evidenceFiles : undefined,
        );
        setItems((prev) =>
          prev.map((p) => (p.id === editing.id ? mapPaymentRow(updated as Record<string, unknown>) : p)),
        );
        toast.success("Pago actualizado");
      } else {
        const created = await postEmployeePayment(
          token,
          {
            userId: Number(form.userId),
            concepto: form.concepto.trim() || undefined,
            periodFrom: form.periodFrom,
            periodTo: form.periodTo,
            amount: form.amount,
            note: form.note.trim() || undefined,
            status: form.status,
          },
          evidenceFiles,
        );
        setItems((prev) => [mapPaymentRow(created as Record<string, unknown>), ...prev]);
        toast.success("Pago registrado");
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      setEvidenceFiles([]);
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el pago"));
    } finally {
      setSaving(false);
    }
  };

  const runMarkPagado = (p: Payment) => {
    setConfirmState({
      message: `¿Marcar como pagado el registro de ${p.user?.nombre ?? "empleado"}?`,
      confirmLabel: "Marcar pagado",
      fn: async () => {
        try {
          const updated = await markEmployeePaymentPagado(token, p.id);
          setItems((prev) =>
            prev.map((x) => (x.id === p.id ? mapPaymentRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Marcado como pagado");
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo marcar pagado"));
        }
      },
    });
  };

  const remove = (p: Payment) => {
    setConfirmState({
      message: `¿Anular / eliminar el pago a ${p.user?.nombre ?? "empleado"}?`,
      confirmLabel: "Anular",
      fn: async () => {
        try {
          await deleteEmployeePayment(token, p.id);
          setItems((prev) => prev.filter((x) => x.id !== p.id));
          toast.success("Pago anulado");
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo anular"));
        }
      },
    });
  };

  const downloadPdf = async () => {
    if (!token) return;
    try {
      await downloadEmployeePaymentsReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el PDF"));
    }
  };

  const statusVariant = (s?: string): "warning" | "positive" | "danger" | "neutral" => {
    if (s === "Pagado") return "positive";
    if (s === "Anulado") return "danger";
    return "warning";
  };

  const columns: Column<Payment>[] = [
    {
      key: "user",
      label: "Empleado",
      render: (p) => (
        <Link
          href={`/erp/hr/${p.userId}`}
          style={{ fontWeight: 600, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}
        >
          {p.user?.nombre ?? `#${p.userId}`}
        </Link>
      ),
      width: 160,
    },
    {
      key: "concepto",
      label: "Concepto",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.concepto || p.note || "—"}</div>
          {p.concepto && p.note ? (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.note}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "periodFrom",
      label: "Periodo",
      render: (p) => (
        <span style={{ fontSize: 12 }}>
          {p.periodFrom ? new Date(`${p.periodFrom}T12:00:00`).toLocaleDateString("es-MX") : "—"}
          {" – "}
          {p.periodTo ? new Date(`${p.periodTo}T12:00:00`).toLocaleDateString("es-MX") : "—"}
        </span>
      ),
      width: 180,
    },
    {
      key: "amount",
      label: "Monto",
      align: "right" as const,
      render: (p) => <Money value={p.amount} />,
      width: 110,
    },
    {
      key: "evidenceUrls",
      label: "Evidencia",
      render: (p) => {
        const urls = p.evidenceUrls ?? [];
        if (!urls.length) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {urls.slice(0, 3).map((u, i) => {
              const href = assetUrl(u);
              return href ? (
                <a key={`${u}-${i}`} href={href} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "var(--primary)" }}>
                  Archivo {i + 1}
                </a>
              ) : null;
            })}
            {urls.length > 3 ? (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{urls.length - 3} más</span>
            ) : null}
          </div>
        );
      },
      width: 100,
    },
    {
      key: "status",
      label: "Estado",
      render: (p) => <Tag variant={statusVariant(p.status)}>{p.status ?? "—"}</Tag>,
      width: 100,
    },
    {
      key: "id",
      label: "",
      render: (p) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {cfg.canEdit && p.status !== "Anulado" && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
              Editar
            </Button>
          )}
          {cfg.canEdit && p.status === "Borrador" && (
            <Button size="sm" variant="secondary" onClick={() => runMarkPagado(p)}>
              Marcar pagado
            </Button>
          )}
          {cfg.canDelete && p.status !== "Anulado" && (
            <Button size="sm" variant="danger" onClick={() => remove(p)}>
              Anular
            </Button>
          )}
        </div>
      ),
      width: 220,
    },
  ];

  return (
    <>
      <FinanceModuleShell
        eyebrow="ERP · Finanzas"
        title={cfg.title || "Pagos a empleados"}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>
              Actualizar
            </Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={openNew}>
                Registrar pago
              </Button>
            )}
          </>
        }
        kpis={
          <>
            <KpiCard label="Total pagado" value={<Money value={totalPagado} compact />} variant="positive" />
            <KpiCard label="Borradores" value={borradores} variant={borradores > 0 ? "warning" : "default"} />
            <KpiCard label="Empleados" value={empleados} />
            <KpiCard label="Registros" value={visibleItems.length} />
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
                  <KpiCard label="Total pagado" value={<Money value={analytics.totalPagado} compact />} variant="positive" />
                  <KpiCard label="Borradores" value={<Money value={analytics.totalBorrador} compact />} variant="warning" />
                  <KpiCard label="Empleados" value={analytics.employees} />
                  <KpiCard label="Registros" value={analytics.count} />
                </div>
                <div
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
                    Por empleado
                  </div>
                  {!analytics.byEmployee.length && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>
                  )}
                  {analytics.byEmployee.slice(0, 12).map((r) => (
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
              </>
            )}
          </div>
        ) : (
          <>
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por empleado o concepto…" }}
              selects={[
                ...(users.length > 0
                  ? [
                      {
                        label: "Empleado",
                        value: filterUser,
                        onChange: setFilterUser,
                        options: users.map((u) => ({ value: String(u.id), label: u.nombre })),
                        allowAll: true,
                      },
                    ]
                  : []),
                {
                  label: "Estado",
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: STATUSES.map((s) => ({ value: s, label: s })),
                  allowAll: true,
                },
              ]}
              onClear={() => {
                setSearchQ("");
                setFilterUser("");
                setFilterStatus("");
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
                          {
                            key: "user",
                            label: "Empleado",
                            format: (v) => (v as Payment["user"])?.nombre ?? "—",
                          },
                          { key: "concepto", label: "Concepto" },
                          { key: "periodFrom", label: "Desde" },
                          { key: "periodTo", label: "Hasta" },
                          { key: "amount", label: "Monto ($)" },
                          { key: "status", label: "Estado" },
                          { key: "note", label: "Nota" },
                        ],
                        "pagos-empleados",
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
                rowKey={(p) => p.id}
                emptyTitle="Sin pagos registrados"
                emptyDescription="Registra el primer pago a empleados."
              />
            ) : null}
          </>
        )}
      </FinanceModuleShell>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar pago" : "Registrar pago"}
        maxWidth={520}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setSaveErr(null);
                setEditing(null);
                setEvidenceFiles([]);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={saving || !form.userId || !form.amount || !form.periodFrom || !form.periodTo}
            >
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          {editing ? (
            <FinanceField label="Empleado" fullWidth>
              <input value={editing.user?.nombre ?? `#${editing.userId}`} disabled style={{ ...financeInputStyle, opacity: 0.7 }} />
            </FinanceField>
          ) : (
            <FinanceField label="Empleado" fullWidth>
              <select
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                style={financeInputStyle}
              >
                <option value="">— Seleccionar —</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.nombre}
                  </option>
                ))}
              </select>
              {usersErr && <p style={{ fontSize: 12, color: "var(--danger)", margin: "4px 0 0" }}>{usersErr}</p>}
            </FinanceField>
          )}
          <FinanceField label="Concepto" fullWidth>
            <input
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Nómina quincenal, bono, finiquito…"
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Periodo desde">
            <input
              type="date"
              value={form.periodFrom}
              onChange={(e) => setForm((f) => ({ ...f, periodFrom: e.target.value }))}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Periodo hasta">
            <input
              type="date"
              value={form.periodTo}
              onChange={(e) => setForm((f) => ({ ...f, periodTo: e.target.value }))}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Monto ($)">
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
              style={financeInputStyle}
            />
          </FinanceField>
          {!editing && (
            <FinanceField label="Estado">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PaymentStatus }))}
                style={financeInputStyle}
              >
                <option value="Borrador">Borrador</option>
                <option value="Pagado">Pagado</option>
              </select>
            </FinanceField>
          )}
          <FinanceField label="Nota" fullWidth>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Referencia interna (opcional)"
              style={financeInputStyle}
            />
          </FinanceField>
          <div style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={null}
              onFile={(f) => {
                if (f) setEvidenceFiles((prev) => [...prev, f]);
              }}
              label={editing ? "Agregar comprobantes" : "Comprobantes"}
              hint={editing ? "Opcional · se anexan a los existentes" : "Opcional · PDF o imagen · puedes agregar varios"}
            />
            {evidenceFiles.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" }}>
                {evidenceFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span>{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--danger)",
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {editing?.evidenceUrls && editing.evidenceUrls.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                Existentes:{" "}
                {editing.evidenceUrls.map((u, i) => {
                  const href = assetUrl(u);
                  return href ? (
                    <a key={`${u}-${i}`} href={href} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
                      archivo {i + 1}
                    </a>
                  ) : null;
                })}
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

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
