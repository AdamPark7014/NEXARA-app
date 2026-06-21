"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface LocationRecord {
  id: number;
  usuarioId: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
  usuario?: { nombre: string; role?: { nombre?: string } | null; department?: { nombre?: string } | null } | null;
  actividad?: { id: number; titulo?: string | null; folio?: string | null } | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

function minutesAgo(iso?: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Justo ahora";
  if (mins < 60) return `Hace ${mins} min`;
  return `Hace ${Math.round(mins / 60)}h`;
}

export default function GpsPage() {
  const { user } = useUser();
  const { canViewAll } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consentOn, setConsentOn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (canViewAll) {
        const data = await apiFetch("gps/team", token);
        setItems(Array.isArray(data) ? data : []);
      } else {
        const data = await apiFetch("gps/me", token);
        setItems(data ? [data] : []);
        setConsentOn(Boolean(data));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ubicaciones");
    } finally {
      setLoading(false);
    }
  }, [token, canViewAll]);

  useEffect(() => { void load(); }, [load]);

  const toggleConsent = async (enabled: boolean) => {
    if (!token) return;
    try {
      await fetch(buildApiUrl("gps/consent"), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setConsentOn(enabled);
      void load();
    } catch { /* skip */ }
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="GPS y telemetría en vivo"
        subtitle={canViewAll
          ? "Ubicación en tiempo real de tu equipo en campo (solo durante jornada abierta y con consentimiento activo)."
          : "Tu ubicación se comparte mientras tu jornada esté abierta y tengas el consentimiento activo."}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {!canViewAll && (
              <Button variant={consentOn ? "danger" : "primary"} iconLeft="📍" onClick={() => void toggleConsent(!consentOn)}>
                {consentOn ? "Desactivar mi ubicación" : "Activar mi ubicación"}
              </Button>
            )}
          </>
        }
      />

      <Section title={loading ? "Cargando…" : canViewAll ? `${items.length} unidades activas` : "Tu ubicación"}>
        {loading && <EmptyState icon="⏳" title="Cargando telemetría…" description="Consultando ubicaciones desde la API." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && items.length === 0 && (
          <EmptyState icon="📍" title="Sin ubicaciones activas" description="Nadie ha compartido su ubicación en este momento. Requiere jornada abierta y consentimiento." />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {items.map((t) => (
              <article key={t.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>{t.usuario?.nombre ?? "—"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.usuario?.role?.nombre ?? t.usuario?.department?.nombre ?? ""}</div>
                  </div>
                  <Tag variant={t.estaActivo ? "positive" : "default"}>{t.estaActivo ? "Activo" : "Inactivo"}</Tag>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 }}>
                  📍 {t.latitud && t.longitud ? `${Number(t.latitud).toFixed(5)}, ${Number(t.longitud).toFixed(5)}` : "Sin coordenadas"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  <span>📡 {minutesAgo(t.ultimaActualizacion)}</span>
                </div>
                {t.actividad && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
                    <span style={{ color: "var(--text-tertiary)" }}>OT:</span>{" "}
                    <span style={{ fontWeight: 600 }}>{t.actividad.folio ?? t.actividad.titulo ?? `Act-${t.actividad.id}`}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
