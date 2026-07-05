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
import { exportToCsv } from "@/lib/export-csv";
import {
  createSalesClient,
  listSalesClients,
  updateSalesClient,
  type SalesClient,
} from "@/lib/sales-api";

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

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
    boxSizing: "border-box",
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
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo cliente</Button> : undefined}
      />

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Clientes totales" value={items.length} icon="🏢" />
          <KpiCard label="Activos" value={items.filter(c => c.status === "Activo").length} variant="positive" icon="✅" />
          <KpiCard label="Prospectos" value={items.filter(c => c.status === "Prospecto").length} variant="accent" icon="🎯" hint="Sin contrato aún" />
          <KpiCard label="Inactivos / churned" value={items.filter(c => c.status !== "Activo" && c.status !== "Prospecto").length} variant={items.filter(c => c.status !== "Activo" && c.status !== "Prospecto").length > 0 ? "warning" : "default"} icon="⛔" />
        </div>
      )}

      {showForm && (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {[
            { label: "Nombre comercial", key: "name", ph: "Marca o alias", span: true },
            { label: "Razón social", key: "legalName", ph: "Empresa S.A. de C.V.", span: true },
            { label: "RFC", key: "taxId", ph: "ABC123456XYZ" },
            { label: "Email facturación", key: "billingEmail", ph: "facturacion@empresa.com" },
            { label: "Teléfono", key: "billingPhone", ph: "222 555 1234" },
            { label: "Sitio web", key: "website", ph: "https://..." },
          ].map(({ label, key, ph, span }) => (
            <div key={key} style={span ? { gridColumn: "1 / -1" } : undefined}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                {label}
              </label>
              <input
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={ph}
                style={inp}
              />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Dirección fiscal
            </label>
            <input
              value={form.fiscalAddress}
              onChange={(e) => setForm((f) => ({ ...f, fiscalAddress: e.target.value }))}
              style={inp}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Industria
            </label>
            <select value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} style={inp}>
              {INDUSTRIES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Estado
            </label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
              {ESTADOS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? "Guardar" : "Crear cliente"}
            </Button>
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
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems, [
            { key: "name", label: "Nombre" },
            { key: "legalName", label: "Razón social" },
            { key: "taxId", label: "RFC" },
            { key: "industry", label: "Industria" },
            { key: "status", label: "Estado" },
            { key: "billingEmail", label: "Email" },
          ], "clientes")}>CSV</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} clientes`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(c) => c.id}
            emptyTitle={loadError ? `⚠ ${loadError}` : "Sin clientes"}
            emptyDescription="Agrega el primer cliente a la cartera comercial."
          />
        )}
      </Section>
    </>
  );
}
