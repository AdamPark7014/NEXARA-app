"use client";

/**
 * ERP · Company API Keys — auth machine-to-machine por tenant
 */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getActiveCompanyId } from "@/lib/tenant";
import { toast } from "@/components/Toast";

type ApiKeyRow = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
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

export default function ApiKeysSettingsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = Boolean(
    user?.isSuperAdmin ||
      user?.permissions?.includes("console.admin") ||
      user?.permissions?.includes("company.settings.manage"),
  );

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", scopes: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, cat] = await Promise.all([
        apiFetch("company/api-keys", token),
        apiFetch("company/api-keys/catalog", token).catch(() => ({ scopes: [] })),
      ]);
      setKeys(Array.isArray(list) ? list : []);
      setCatalog(Array.isArray(cat?.scopes) ? cat.scopes : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar API keys");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleScope = (scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((x) => x !== scope) : [...f.scopes, scope],
    }));
  };

  const create = async () => {
    if (!form.name.trim() || !form.scopes.length) {
      toast.error("Nombre y al menos un scope son requeridos");
      return;
    }
    setSaving(true);
    try {
      const created = await apiFetch("company/api-keys", token, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", scopes: [] });
      if (created?.apiKey) {
        setRevealed(created.apiKey);
        toast.success("API key creada — cópiala ahora; no se vuelve a mostrar");
      } else {
        toast.success("API key creada");
      }
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: number) => {
    try {
      await apiFetch(`company/api-keys/${id}`, token, { method: "DELETE" });
      toast.success("API key revocada");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revocar");
    }
  };

  if (!canManage) {
    return <EmptyState title="Sin permiso" description="Solo administradores pueden gestionar API keys." />;
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
        title="API keys por empresa"
        subtitle="Autenticación machine-to-machine scoped al tenant activo (header X-Api-Key)."
        actions={<Button variant="ghost" onClick={() => void load()}>Actualizar</Button>}
      />

      {revealed && (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 10,
            border: "1px solid var(--state-warning-border)",
            background: "var(--state-warning-bg)",
            color: "var(--state-warning-text)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Secreto (única vez)</div>
          <code style={{ wordBreak: "break-all" }}>{revealed}</code>
          <div style={{ marginTop: 8 }}>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(revealed);
                toast.success("Copiado");
              }}
            >
              Copiar
            </Button>{" "}
            <Button variant="ghost" onClick={() => setRevealed(null)}>
              Ocultar
            </Button>
          </div>
        </div>
      )}

      <Section title="Nueva API key">
        <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
          <input
            style={inp}
            placeholder="Nombre (ej. Integración Power BI)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {catalog.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleScope(s)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: form.scopes.includes(s) ? "var(--accent)" : "var(--surface)",
                  color: form.scopes.includes(s) ? "#fff" : "var(--foreground)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <Button variant="primary" disabled={saving || loading} onClick={() => void create()}>
            Crear API key
          </Button>
        </div>
      </Section>

      <Section title="Keys activas">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{k.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {k.keyPrefix}… · {k.scopes.join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Tag variant={k.isActive ? "positive" : "warning"}>{k.isActive ? "Activa" : "Revocada"}</Tag>
                {k.isActive && (
                  <Button variant="ghost" onClick={() => void revoke(k.id)}>
                    Revocar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!loading && !keys.length && (
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin API keys</span>
          )}
        </div>
      </Section>
    </>
  );
}
