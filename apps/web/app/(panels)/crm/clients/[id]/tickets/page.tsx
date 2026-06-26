"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface TicketRequest {
  id: number;
  description: string;
  status: string;
  urgency?: string | null;
  requestType?: string | null;
  createdAt: string;
  dueAt?: string | null;
  branch?: { id: number; name: string } | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function ClientTicketsPage() {
  const { client, error: clientError, reload: reloadClient } = useClientDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const scId = client?.serviceClient?.id;

  const [tickets, setTickets] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !scId) return;
    setLoading(true); setError(null);
    try {
      // Use snapshot which returns ticketRequests scoped to the service client
      const data = await apiFetch(`service-clients/${scId}/snapshot`, token);
      setTickets(Array.isArray(data?.ticketRequests) ? data.ticketRequests : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tickets");
    } finally { setLoading(false); }
  }, [token, scId]);

  useEffect(() => { void load(); }, [load]);

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  if (!client.serviceClient) {
    return (
      <EmptyState
        icon="🎫"
        title="Portal de tickets no disponible"
        description="Provisiona el cliente en operaciones para habilitar tickets de sucursal."
      />
    );
  }

  const urgencyVariant = (u?: string | null): "danger" | "warning" | "default" =>
    u === "HIGH" ? "danger" : u === "MEDIUM" ? "warning" : "default";

  const statusVariant = (s: string): "positive" | "accent" | "warning" | "danger" | "default" => {
    if (s === "CLOSED" || s === "APPROVED") return "positive";
    if (s === "REJECTED") return "danger";
    if (s === "ASSIGNED") return "accent";
    return "warning";
  };

  return (
    <DetailSection title="Tickets de soporte">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {tickets.filter((t) => t.status === "NEW").length} nuevo(s) · {tickets.length} total
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
          <Link href="/ops/support" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">Bandeja de soporte →</Button>
          </Link>
        </div>
      </div>

      {loading && <EmptyState icon="⏳" title="Cargando tickets…" description="" />}
      {!loading && error && (
        <EmptyState icon="⚠️" title="Error al cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
      )}

      {!loading && !error && tickets.length === 0 && (
        <EmptyState icon="🎫" title="Sin tickets" description="Este cliente no ha levantado solicitudes de soporte." />
      )}

      {!loading && !error && tickets.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {tickets.map((t) => (
            <li key={t.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <Tag variant="accent" size="sm">T-{t.id}</Tag>
                    {t.branch?.name ?? "Sin sucursal"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                    {t.description?.slice(0, 80)}{t.description?.length > 80 ? "…" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {t.urgency && <Tag variant={urgencyVariant(t.urgency)}>{t.urgency}</Tag>}
                  <Tag variant={statusVariant(t.status)}>{t.status}</Tag>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6, display: "flex", gap: 12 }}>
                <span>Abierto: {new Date(t.createdAt).toLocaleDateString("es-MX")}</span>
                {t.dueAt && (
                  <span style={{ color: new Date(t.dueAt) < new Date() && t.status !== "CLOSED" ? "var(--danger)" : undefined }}>
                    Vence: {new Date(t.dueAt).toLocaleDateString("es-MX")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
