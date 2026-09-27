"use client";

/**
 * ERP · Plan y facturación por empresa
 */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import KpiCard from "@/components/ui/KpiCard";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { getActiveCompanyId } from "@/lib/tenant";
import { toast } from "@/components/Toast";
import SettingsModuleRail from "@/components/erp/SettingsModuleRail";

type BillingData = {
  company?: { planCode?: string | null; seatLimit?: number | null; billingStatus?: string | null } | null;
  seats?: { used?: number; limit?: number } | null;
  stripe?: { configured?: boolean; hasSubscription?: boolean } | null;
  usage30d?: Array<{ metric: string; quantity: number }> | null;
};

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

const BILLING_STATUS: Record<string, { label: string; variant: "positive" | "warning" | "danger" | "default" }> = {
  active: { label: "Al corriente", variant: "positive" },
  trialing: { label: "Periodo de prueba", variant: "positive" },
  past_due: { label: "Pago pendiente", variant: "warning" },
  unpaid: { label: "Sin pagar", variant: "danger" },
  canceled: { label: "Cancelado", variant: "danger" },
  cancelled: { label: "Cancelado", variant: "danger" },
  incomplete: { label: "Pago incompleto", variant: "warning" },
  none: { label: "Sin suscripción", variant: "default" },
};

function billingStatus(s?: string | null) {
  if (!s) return { label: "Sin suscripción", variant: "default" as const };
  return BILLING_STATUS[s.toLowerCase()] ?? { label: humanize(s), variant: "default" as const };
}

function humanize(key: string): string {
  const s = key.replace(/[._-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--foreground)",
  minHeight: 40,
  boxSizing: "border-box",
};

export default function BillingSettingsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = Boolean(
    user?.isSuperAdmin ||
      user?.permissions?.includes("console.admin") ||
      user?.permissions?.includes("company.settings.manage"),
  );

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seatLimit, setSeatLimit] = useState(50);
  const [planCode, setPlanCode] = useState("enterprise");
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState<"checkout" | "portal" | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await apiFetch("company/billing", token)) as BillingData | null;
      setData(res);
      setSeatLimit(res?.company?.seatLimit ?? 50);
      setPlanCode(res?.company?.planCode ?? "enterprise");
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la información de facturación."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const savedSeat = data?.company?.seatLimit ?? 50;
  const savedPlan = data?.company?.planCode ?? "enterprise";
  const dirty = !!data && (Number(seatLimit) !== savedSeat || planCode.trim() !== savedPlan);
  const seatsUsed = data?.seats?.used ?? 0;
  const seatError = !Number.isFinite(seatLimit) || seatLimit < 1
    ? "Debe ser al menos 1."
    : seatLimit < seatsUsed
      ? `Hay ${seatsUsed} usuarios activos; el límite no puede ser menor.`
      : null;
  const planError = !planCode.trim() ? "Escribe el código del plan." : null;

  const save = async () => {
    if (seatError || planError) return;
    setSaving(true);
    try {
      await apiFetch("company/billing", token, {
        method: "PATCH",
        body: JSON.stringify({ planCode: planCode.trim(), seatLimit: Number(seatLimit) }),
      });
      toast.success("Plan actualizado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar el plan"));
    } finally {
      setSaving(false);
    }
  };

  const openStripe = async (kind: "checkout" | "portal") => {
    setRedirecting(kind);
    try {
      const res = kind === "checkout"
        ? await apiFetch("company/billing/checkout", token, { method: "POST", body: JSON.stringify({ seats: seatLimit }) })
        : await apiFetch("company/billing/portal", token, { method: "POST", body: "{}" });
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      toast.error("El proveedor de pagos no devolvió un enlace. Intenta de nuevo.");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo abrir el portal de pagos"));
    }
    setRedirecting(null);
  };

  if (!canManage) {
    return (
      <EmptyState
        variant="page"
        icon="🔒"
        title="Sin permiso"
        description="Solo los administradores de la empresa pueden ver el plan y la facturación."
      />
    );
  }

  const seatLimitSaved = data?.seats?.limit ?? 0;
  const seatPct = seatLimitSaved > 0 ? Math.min(100, Math.round((seatsUsed / seatLimitSaved) * 100)) : 0;
  const status = billingStatus(data?.company?.billingStatus);
  const stripeReady = !!data?.stripe?.configured;
  const usage = data?.usage30d ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Configuración"
        title="Plan y facturación"
        subtitle="Plan contratado, usuarios incluidos y consumo de la empresa activa."
        density="ops"
        actions={
          <Button variant="secondary" iconLeft="↻" loading={loading && !!data} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />
      <SettingsModuleRail />

      {error && (
        <InlineAlert
          variant={data ? "warning" : "danger"}
          title={data ? "No se pudo actualizar" : "No se pudo cargar la facturación"}
          message={data ? `${error} Mostramos la última información cargada.` : error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {loading && !data && !error && <SkeletonList rows={4} />}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Plan" value={humanize(data.company?.planCode || "—")} icon="📦" />
            <KpiCard
              label="Usuarios"
              value={<span style={{ fontVariantNumeric: "tabular-nums" }}>{seatsUsed} / {seatLimitSaved}</span>}
              icon="👥"
              variant={seatPct >= 90 ? "warning" : "accent"}
              hint={seatLimitSaved ? `${seatPct}% del límite` : undefined}
            />
            <KpiCard label="Estado del pago" value={status.label} icon="💳" variant={status.variant === "default" ? "default" : status.variant} />
            <KpiCard
              label="Pagos en línea"
              value={stripeReady ? (data.stripe?.hasSubscription ? "Suscrito" : "Disponible") : "No configurado"}
              icon="⚡"
              variant={stripeReady ? "positive" : "default"}
            />
          </div>

          <Section title="Pagos" subtitle="Contrata o administra tu suscripción en el portal seguro del proveedor de pagos.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Button
                variant="primary"
                disabled={!stripeReady || redirecting !== null}
                loading={redirecting === "checkout"}
                onClick={() => void openStripe("checkout")}
              >
                Contratar o ampliar plan
              </Button>
              <Button
                variant="secondary"
                disabled={!stripeReady || redirecting !== null}
                loading={redirecting === "portal"}
                onClick={() => void openStripe("portal")}
              >
                Administrar pagos y facturas
              </Button>
            </div>
            {!stripeReady && (
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, maxWidth: "70ch", lineHeight: 1.5 }}>
                Los pagos en línea aún no están configurados para esta instalación. Pide a soporte técnico que active la conexión con el proveedor de pagos.
              </p>
            )}
          </Section>

          <Section title="Plan contratado" subtitle="Ajusta el plan y el número máximo de usuarios activos.">
            <div style={{ maxWidth: 560 }}>
              {seatLimitSaved > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 }}>
                    <span>Usuarios activos</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{seatsUsed} de {seatLimitSaved}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Usuarios activos respecto al límite"
                    aria-valuenow={seatPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}
                  >
                    <div style={{ height: "100%", width: `${seatPct}%`, background: seatPct >= 90 ? "var(--warning)" : "var(--primary)", borderRadius: 4 }} />
                  </div>
                </div>
              )}
              <FormGrid>
                <FormField label="Código del plan" error={planError} hint="Tal como aparece en tu contrato.">
                  <input style={inp} value={planCode} onChange={(e) => setPlanCode(e.target.value)} autoCapitalize="off" />
                </FormField>
                <FormField label="Límite de usuarios" error={seatError}>
                  <input
                    style={{ ...inp, fontVariantNumeric: "tabular-nums" }}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={Number.isFinite(seatLimit) ? seatLimit : ""}
                    onChange={(e) => setSeatLimit(Number(e.target.value))}
                  />
                </FormField>
              </FormGrid>
            </div>
          </Section>

          <Section title="Consumo de los últimos 30 días">
            {usage.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Aún no hay consumo registrado en este periodo.</p>
            ) : (
              <dl style={{ display: "grid", gap: 0, maxWidth: 480, margin: 0 }}>
                {usage.map((u) => (
                  <div
                    key={u.metric}
                    style={{ fontSize: 13.5, display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <dt style={{ color: "var(--text-secondary)" }}>{humanize(u.metric)}</dt>
                    <dd style={{ margin: 0, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{u.quantity.toLocaleString("es-MX")}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          {dirty && (
            <div
              role="region"
              aria-label="Cambios sin guardar"
              style={{
                position: "sticky", bottom: 12, zIndex: 20, marginTop: 8,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                padding: "10px 14px", borderRadius: 12, background: "var(--surface)",
                border: "1px solid var(--border)", boxShadow: "0 10px 30px color-mix(in srgb, var(--shadow, #000) 18%, transparent)",
              }}
            >
              <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>Tienes cambios sin guardar en el plan.</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="ghost" onClick={() => { setSeatLimit(savedSeat); setPlanCode(savedPlan); }}>Descartar</Button>
                <Button variant="primary" loading={saving} disabled={!!seatError || !!planError} onClick={() => void save()}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
