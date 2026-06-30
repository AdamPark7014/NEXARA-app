"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";

interface ContactMsg {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
  source?: string;
  status: string;
  category: string;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "accent" | "warning" | "neutral" | "danger"> = {
  NEW:              "warning",
  ASSIGNED:         "accent",
  IN_PROGRESS:      "accent",
  RESOLVED:         "neutral",
  DISCARDED:        "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  NEW:         "Sin atender",
  ASSIGNED:    "Asignado a ventas",
  IN_PROGRESS: "En seguimiento",
  RESOLVED:    "Resuelto",
  DISCARDED:   "Descartado",
};

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 3600000;
  if (diff < 24) return `Hoy ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
  if (diff < 48) return `Ayer ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export default function StudioContactsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "contacts"), [user]);
  const token = user?.token ?? "";

  const [items, setItems]     = useState<ContactMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("contact-messages?limit=50", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: string) => {
    if (!token) return;
    try {
      await apiFetch(`contact-messages/${id}`, token, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      setItems(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el estado");
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Eliminar este mensaje?", fn: async () => {
    try {
      await apiFetch(`contact-messages/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  } });
  };

  const columns: Column<ContactMsg>[] = [
    {
      key: "name", label: "Contacto",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.company || c.email}</div>
        </div>
      ),
    },
    {
      key: "message", label: "Mensaje",
      render: (c) => (
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {c.message.length > 90 ? c.message.slice(0, 90) + "…" : c.message}
        </span>
      ),
    },
    {
      key: "source", label: "Canal",
      render: (c) => <Tag variant="neutral">{c.source ?? c.category}</Tag>,
      width: 140,
    },
    {
      key: "createdAt", label: "Recibido",
      accessor: (c) => fmtDate(c.createdAt),
      width: 110,
    },
    {
      key: "status", label: "Estado",
      render: (c) => (
        <select
          value={c.status}
          onChange={e => setStatus(c.id, e.target.value)}
          style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)", cursor: "pointer" }}
        >
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ),
      width: 160,
    },
    {
      key: "id", label: "",
      render: (c) => (
        cfg.canDelete ? (
        <button
          onClick={() => remove(c.id)}
          title="Eliminar"
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}
        >
          ✕
        </button>
        ) : null
      ),
      width: 40,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Captación"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <Button variant="primary" iconLeft="→" onClick={() => {
            const news = items.filter(c => c.status === "NEW");
            if (news.length === 0) { setActionErr("No hay mensajes sin atender."); return; }
            news.forEach(c => setStatus(c.id, "ASSIGNED"));
          }}>
            Asignar lote a CRM ({items.filter(c => c.status === "NEW").length})
          </Button>
        }
      />

      {error && (
        <div style={{ padding: 14, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Total mensajes" value={items.length} icon="📥" />
          <KpiCard label="Sin atender" value={items.filter(c => c.status === "NEW").length} variant={items.filter(c => c.status === "NEW").length > 0 ? "warning" : "positive"} icon="⚡" hint="Pendientes de respuesta" />
          <KpiCard label="En proceso" value={items.filter(c => c.status === "ASSIGNED" || c.status === "IN_PROGRESS").length} variant="accent" icon="🔄" />
          <KpiCard label="Resueltos" value={items.filter(c => c.status === "RESOLVED" || c.status === "CLOSED").length} variant="positive" icon="✅" />
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} mensajes`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            rowKey={c => c.id}
            emptyTitle="Sin mensajes"
            emptyDescription="No hay mensajes de contacto aún."
          />
        )}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
