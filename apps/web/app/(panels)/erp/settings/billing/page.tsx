"use client";

/**
 * ERP · Billing / metering por empresa
 */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getActiveCompanyId } from "@/lib/tenant";
import { toast } from "@/components/Toast";
import KpiCard from "@/components/ui/KpiCard";
import SettingsModuleRail from "@/components/erp/SettingsModuleRail";

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const companyId = getActiveCompanyId();
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(companyId ? { "X-Company-Id": String(companyId) } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function BillingSettingsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = Boolean(
    user?.isSuperAdmin ||
      user?.permissions?.includes("console.admin") ||
      user?.permissions?.includes("company.settings.manage"),
  );

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seatLimit, setSeatLimit] = useState(50);
  const [planCode, setPlanCode] = useState("enterprise");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch("company/billing", token);
      setData(res);
      setSeatLimit(res?.company?.seatLimit ?? 50);
      setPlanCode(res?.company?.planCode ?? "enterprise");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar billing");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("company/billing", token, {
        method: "PATCH",
        body: JSON.stringify({ planCode, seatLimit: Number(seatLimit) }),
      });
      toast.success("Plan actualizado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return <EmptyState title="Sin permiso" description="Solo administradores pueden ver billing." />;
  }

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--foreground)",
    fontSize: 13,
  };

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno"
        title="Facturación y asientos"
        subtitle="Plan por empresa, límites de asientos y uso (listo para Stripe)."
        density="ops"
        actions={<Button variant="ghost" onClick={() => void load()}>Actualizar</Button>}
      />
      <SettingsModuleRail />

      {!loading && data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Plan" value={data.company?.planCode || "—"} icon="📦" />
          <KpiCard label="Asientos" value={`${data.seats?.used ?? 0}/${data.seats?.limit ?? 0}`} icon="👥" variant="accent" />
          <KpiCard label="Estado" value={data.company?.billingStatus || "—"} icon="💳" />
          <KpiCard label="Métricas 30d" value={data.usage30d?.length ?? 0} icon="📈" />
        </div>
      )}

      {!loading && data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Plan" value={data.company?.planCode || "—"} icon="📦" />
          <KpiCard label="Asientos" value={`${data.seats?.used ?? 0}/${data.seats?.limit ?? 0}`} icon="👥" variant="accent" />
          <KpiCard label="Estado" value={data.company?.billingStatus || "—"} icon="💳" />
          <KpiCard label="Stripe" value={data.stripe?.configured ? (data.stripe?.hasSubscription ? "Sub" : "Listo") : "Off"} icon="⚡" />
        </div>
      )}

      <Section title="Stripe Checkout / Portal">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Button
            variant="primary"
            disabled={!data?.stripe?.configured}
            onClick={async () => {
              try {
                const res = await apiFetch("company/billing/checkout", token, {
                  method: "POST",
                  body: JSON.stringify({ seats: seatLimit }),
                });
                if (res?.url) window.location.href = res.url;
                else toast.error("Sin URL de Checkout");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Checkout falló");
              }
            }}
          >
            Abrir Checkout
          </Button>
          <Button
            variant="secondary"
            disabled={!data?.stripe?.configured}
            onClick={async () => {
              try {
                const res = await apiFetch("company/billing/portal", token, { method: "POST", body: "{}" });
                if (res?.url) window.location.href = res.url;
                else toast.error("Sin URL de Portal");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Portal falló");
              }
            }}
          >
            Customer Portal
          </Button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
          Requiere <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_PRICE_ID</code> y webhook{" "}
          <code>POST /company/billing/stripe/webhook</code> con <code>STRIPE_WEBHOOK_SECRET</code>.
        </p>
      </Section>

      <Section title="Plan">
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Plan code
            <input style={{ ...inp, marginTop: 4 }} value={planCode} onChange={(e) => setPlanCode(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Seat limit
            <input
              style={{ ...inp, marginTop: 4 }}
              type="number"
              min={1}
              value={seatLimit}
              onChange={(e) => setSeatLimit(Number(e.target.value))}
            />
          </label>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      </Section>

      <Section title="Uso 30 días">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(data?.usage30d || []).map((u: { metric: string; quantity: number }) => (
            <div key={u.metric} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", maxWidth: 360 }}>
              <span>{u.metric}</span>
              <strong>{u.quantity}</strong>
            </div>
          ))}
          {!loading && !(data?.usage30d || []).length && (
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin eventos de metering aún</span>
          )}
        </div>
      </Section>
    </>
  );
}
