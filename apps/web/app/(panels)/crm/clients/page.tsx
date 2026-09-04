"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import EmptyState from "@/components/ui/EmptyState";
import {
  createSalesClient,
  listSalesClients,
  updateSalesClient,
  type SalesClient,
} from "@/lib/sales-api";
import chrome from "@/components/crm/crm-chrome.module.css";

const INDUSTRIES = ["Corporativo", "Gobierno", "PyME", "Hogar", "Retail", "Industrial"];
const ESTADOS = ["Activo", "Inactivo", "Prospecto"];

const emptyForm = {
  name: "",
  legalName: "",
  taxId: "",
  billingEmail: "",
  billingPhone: "",
  industry: "PyME",
  status: "Prospecto",
  fiscalAddress: "",
  website: "",
  notes: "",
};

export default function ClientsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "clients"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesClient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listSalesClients(token);
      setItems(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.legalName ?? "").toLowerCase().includes(q) ||
        (c.taxId ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((c) => c.status === filterStatus);
    if (filterIndustry) rows = rows.filter((c) => c.industry === filterIndustry);
    return rows;
  }, [items, searchQ, filterStatus, filterIndustry]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (c: SalesClient) => {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      legalName: c.legalName ?? "",
      taxId: c.taxId ?? "",
      billingEmail: c.billingEmail ?? "",
      billingPhone: c.billingPhone ?? "",
      industry: c.industry ?? "PyME",
      status: c.status ?? "Prospecto",
      fiscalAddress: c.fiscalAddress ?? "",
      website: c.website ?? "",
      notes: c.notes ?? "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await updateSalesClient(token, editing.id, form);
        setItems((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...updated } : c)));
      } else {
        const created = await createSalesClient(token, form);
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el cliente");
    }
  };

  const columns: Column<SalesClient>[] = [
    {
      key: "name",
      label: "Cliente",
      render: (c) => (
        <div>
          <Link href={`/crm/clients/${c.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
            {c.legalName?.trim() || c.name || "—"}
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.taxId}</div>
        </div>
      ),
    },
    { key: "industry", label: "Industria", render: (c) => <Tag variant="neutral">{c.industry ?? "—"}</Tag>, width: 110 },
    {
      key: "billingEmail",
      label: "Contacto",
      render: (c) => (
        <div>
          <div style={{ fontSize: 13 }}>{c.billingEmail ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.billingPhone}</div>
        </div>
      ),
      width: 180,
    },
    {
      key: "serviceClientId",
      label: "OPS",
      render: (c) => (
        <Tag variant={c.serviceClientId ? "positive" : "neutral"}>{c.serviceClientId ? "Activo" : "CRM"}</Tag>
      ),
      width: 80,
    },
    {
      key: "status",
      label: "Estado",
      render: (c) => (
        <Tag variant={c.status === "Activo" ? "accent" : c.status === "Prospecto" ? "warning" : "neutral"}>
          {c.status ?? "—"}
        </Tag>
      ),
      width: 100,
    },
    {
      key: "id",
      label: "",
      render: (c) =>
        cfg.canEdit ? (
          <button
            onClick={() => openEdit(c)}
            title="Editar"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}
          >
            ✎
          </button>
        ) : null,
      width: 40,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Clientes"
        title={cfg.title}
        subtitle={cfg.subtitle ?? "Cartera comercial con datos fiscales y vínculo a operación."}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo cliente</Button> : null}
          </>
        }
      />

      {!loading && items.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
            <KpiCard label="Clientes totales" value={items.length} icon="🏢" />
            <KpiCard label="Activos" value={items.filter(c => c.status === "Activo").length} variant="positive" icon="✅" />
            <KpiCard label="Prospectos" value={items.filter(c => c.status === "Prospecto").length} variant="accent" icon="🎯" hint="Sin contrato aún" />
            <KpiCard label="Inactivos / churned" value={items.filter(c => c.status !== "Activo" && c.status !== "Prospecto").length} variant={items.filter(c => c.status !== "Activo" && c.status !== "Prospecto").length > 0 ? "warning" : "default"} icon="⛔" />
          </div>
          {(() => {
            const byIndustry = Object.entries(
              items.reduce<Record<string, number>>((acc, c) => { const k = c.industry ?? "Sin industria"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})
            ).sort((a, b) => b[1] - a[1]);
            if (byIndustry.length === 0) return null;
            return (
              <div className={chrome.distCard}>
                <div className={chrome.distLabel}>Clientes por industria</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byIndustry.map(([industry, count]) => (
                    <div key={industry} style={{ display: "grid", gridTemplateColumns: "120px 1fr 36px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{industry}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / items.length) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {showForm && (
        <div className={chrome.formPanel}>
          <p className={chrome.formPanelTitle}>{editing ? "Editar cliente" : "Nuevo cliente"}</p>
          {[
            { label: "Nombre comercial", key: "name", ph: "Marca o alias", span: true },
            { label: "Razón social", key: "legalName", ph: "Empresa S.A. de C.V.", span: true },
            { label: "RFC", key: "taxId", ph: "ABC123456XYZ" },
            { label: "Email facturación", key: "billingEmail", ph: "facturacion@empresa.com" },
            { label: "Teléfono", key: "billingPhone", ph: "222 555 1234" },
            { label: "Sitio web", key: "website", ph: "https://..." },
          ].map(({ label, key, ph, span }) => (
            <div key={key} className={span ? chrome.formFull : undefined}>
              <label className={chrome.fieldLabel}>{label}</label>
              <input
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={ph}
                className={chrome.fieldInput}
              />
            </div>
          ))}
          <div className={chrome.formFull}>
            <label className={chrome.fieldLabel}>Dirección fiscal</label>
            <input
              value={form.fiscalAddress}
              onChange={(e) => setForm((f) => ({ ...f, fiscalAddress: e.target.value }))}
              className={chrome.fieldInput}
            />
          </div>
          <div>
            <label className={chrome.fieldLabel}>Industria</label>
            <select value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} className={chrome.fieldInput}>
              {INDUSTRIES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={chrome.fieldLabel}>Estado</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={chrome.fieldInput}>
              {ESTADOS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className={chrome.formActions}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear cliente"}</Button>
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por nombre, RFC o razón social…" }}
        selects={[
          { label: "Estado", value: filterStatus, onChange: setFilterStatus, options: ESTADOS.map((s) => ({ value: s, label: s })), allowAll: true },
          { label: "Industria", value: filterIndustry, onChange: setFilterIndustry, options: INDUSTRIES.map((i) => ({ value: i, label: i })), allowAll: true },
        ]}
        onClear={() => { setSearchQ(""); setFilterStatus(""); setFilterIndustry(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "name", label: "Nombre" },
            { key: "legalName", label: "Razón social" },
            { key: "taxId", label: "RFC" },
            { key: "industry", label: "Industria" },
            { key: "status", label: "Estado" },
            { key: "billingEmail", label: "Email" },
          ], "clientes")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} cliente${visibleItems.length === 1 ? "" : "s"}`}>
        {loading && (
          <EmptyState icon="⏳" title="Cargando clientes…" description="Consultando la cartera comercial." />
        )}
        {!loading && loadError && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={loadError}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {!loading && !loadError && (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(c) => c.id}
            emptyTitle="Sin clientes"
            emptyDescription="Agrega el primer cliente a la cartera comercial."
            emptyAction={
              cfg.canCreate ? (
                <Button size="sm" variant="primary" iconLeft="+" onClick={openNew}>Nuevo cliente</Button>
              ) : undefined
            }
          />
        )}
      </Section>
    </>
  );
}
