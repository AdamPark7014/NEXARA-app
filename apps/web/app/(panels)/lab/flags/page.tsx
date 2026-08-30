"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getLabSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  scope?: string | null;
  description?: string | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function LabFlagsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getLabSectionConfig(user, "flags"), [user]);
  const token = user?.token ?? "";

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("lab/flags", token);
      setFlags(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar flags");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    if (!token) return;
    setBusyKey(key);
    try {
      await apiFetch(`lab/flags/${encodeURIComponent(key)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
      toast.success(enabled ? `${key} activado` : `${key} desactivado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="LAB · Ops"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <Button variant="ghost" iconLeft="🔄" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando flags…" description="Consultando lab/flags." />}
      {!loading && error && (
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar"
          description={error}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      )}

      {!loading && !error && (
        <Section
          eyebrow="Plataforma"
          title={`${flags.length} flags`}
          subtitle="Cambios aplican de inmediato al resolver feature flags en API."
        >
          {flags.length === 0 ? (
            <EmptyState icon="🚩" title="Sin flags" description="Aún no hay feature flags de plataforma." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flags.map((f) => (
                <div
                  key={f.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 14px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{f.key}</span>
                      <Tag variant={f.enabled ? "positive" : "neutral"}>
                        {f.enabled ? "ON" : "OFF"}
                      </Tag>
                      {f.scope && <Tag variant="accent">{f.scope}</Tag>}
                    </div>
                    {f.description && (
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                        {f.description}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={f.enabled ? "secondary" : "primary"}
                    disabled={busyKey === f.key}
                    onClick={() => void toggle(f.key, !f.enabled)}
                  >
                    {busyKey === f.key ? "…" : f.enabled ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}
