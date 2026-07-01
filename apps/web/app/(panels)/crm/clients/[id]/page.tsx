"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { provisionSalesServiceClient, updateSalesClient } from "@/lib/sales-api";
import { DetailError, DetailField, DetailFieldGrid, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { toast } from "@/components/Toast";

const INDUSTRIES = ["Corporativo", "Gobierno", "PyME", "Hogar", "Retail", "Industrial", "Educación", "Salud", "Otro"];
const ESTADOS = ["Activo", "Inactivo", "Prospecto"];

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function ClientDetailPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { client, error, reload } = useClientDetail();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", legalName: "", taxId: "", billingEmail: "", billingPhone: "",
    industry: "", status: "", fiscalAddress: "", fiscalZipCode: "", fiscalRegime: "601",
    website: "", notes: "",
  });

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  const openEdit = () => {
    setForm({
      name: client.name ?? "",
      legalName: client.legalName ?? "",
      taxId: client.taxId ?? "",
      billingEmail: client.billingEmail ?? "",
      billingPhone: client.billingPhone ?? "",
      industry: client.industry ?? "PyME",
      status: client.status ?? "Prospecto",
      fiscalAddress: client.fiscalAddress ?? "",
      fiscalZipCode: client.fiscalZipCode ?? "",
      fiscalRegime: client.fiscalRegime ?? "601",
      website: client.website ?? "",
      notes: client.notes ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await updateSalesClient(token, client.id, form);
      reload();
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el cliente");
    } finally { setSaving(false); }
  };

  const provision = async () => {
    if (!token) return;
    try {
      await provisionSalesServiceClient(token, client.id);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo provisionar el cliente");
    }
  };

  if (editing) {
    return (
      <DetailSection title="Editar cliente">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {([
            { label: "Nombre comercial *", key: "name", ph: "Marca o alias", span: true },
            { label: "Razón social", key: "legalName", ph: "Empresa S.A. de C.V.", span: true },
            { label: "RFC", key: "taxId", ph: "ABC123456XYZ0" },
            { label: "CP fiscal (CFDI)", key: "fiscalZipCode", ph: "64000" },
            { label: "Régimen fiscal", key: "fiscalRegime", ph: "601" },
            { label: "Sitio web", key: "website", ph: "https://www.empresa.com" },
            { label: "Email facturación", key: "billingEmail", ph: "facturación@empresa.com" },
            { label: "Teléfono", key: "billingPhone", ph: "222 555 1234" },
            { label: "Dirección fiscal", key: "fiscalAddress", ph: "Calle, Col., CP, Estado", span: true },
          ] as const).map(({ label, key, ph, ...rest }) => (
            <div key={key} style={{ gridColumn: "span" in rest && rest.span ? "1 / -1" : undefined }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={(form as Record<string, string>)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Industria</label>
            <select value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} style={inp}>
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
              {ESTADOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas internas</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.name.trim()}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Datos generales">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Tag variant={client.status === "Activo" ? "positive" : client.status === "Prospecto" ? "warning" : "neutral"}>
          {client.status || "Prospecto"}
        </Tag>
        {client.industry && <Tag variant="neutral">{client.industry}</Tag>}
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={openEdit}>✎ Editar</Button>
      </div>
      <DetailFieldGrid>
        <DetailField label="Nombre comercial" value={client.name} />
        <DetailField label="Razón social" value={client.legalName} />
        <DetailField label="RFC" value={client.taxId} />
        <DetailField label="CP fiscal" value={client.fiscalZipCode} />
        <DetailField label="Régimen fiscal" value={client.fiscalRegime} />
        <DetailField label="Industria" value={client.industry} />
        <DetailField label="Email facturación" value={client.billingEmail} />
        <DetailField label="Teléfono" value={client.billingPhone} />
        <DetailField label="Sitio web" value={client.website} />
        <DetailField label="Dirección fiscal" value={client.fiscalAddress} />
      </DetailFieldGrid>
      {client.notes && (
        <div style={{ marginTop: 14 }}>
          <DetailField label="Notas" value={client.notes} />
        </div>
      )}
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!client.serviceClientId && (
          <Button variant="secondary" onClick={() => void provision()}>Activar en operación</Button>
        )}
        {client.serviceClientId && (
          <Link href={`/ops/service-clients`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", alignSelf: "center" }}>
            Ver en clientes de servicio →
          </Link>
        )}
      </div>
      {(client.opportunities?.length ?? 0) > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Oportunidades activas</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {client.opportunities!.map((o) => (
              <li key={o.id}>
                <Link href={`/crm/opportunities/${o.id}`} style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
                  {o.title}
                </Link>
                <span style={{ color: "var(--text-tertiary)", fontSize: 12, marginLeft: 8 }}>{o.stage}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailSection>
  );
}
