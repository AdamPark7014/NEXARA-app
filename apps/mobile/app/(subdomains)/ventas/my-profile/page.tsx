"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { getAvatarSrc, getRoleLabel } from "@/lib/panel-user";
import { getSalesVendorStats, type SalesVendorStats } from "@/lib/sales-api";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function VentasMyProfileMobilePage() {
  const { user } = useUser();
  const [stats, setStats] = useState<SalesVendorStats | null>(null);
  const [loading, setLoading] = useState(false);

  const roleLabel = getRoleLabel(user);
  const avatarSrc = getAvatarSrc(user);

  useEffect(() => {
    const load = async () => {
      if (!user?.token || !user?.id) return;
      setLoading(true);
      try {
        const all = await getSalesVendorStats(user.token, "month");
        const mine = all.find((v) => Number(v.userId) === Number(user.id)) || null;
        setStats(mine);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.token, user?.id]);

  const kpis = useMemo(() => {
    return [
      { label: "Ingresos (mes)", value: stats ? formatMoney(stats.revenue) : loading ? "…" : "—" },
      { label: "Oportunidades", value: stats ? String(stats.opportunities) : loading ? "…" : "—" },
      { label: "Proyectos", value: stats ? String(stats.projects) : loading ? "…" : "—" },
      { label: "Performance", value: stats ? `${stats.performance}%` : loading ? "…" : "—" },
    ];
  }, [stats, loading]);

  if (!user) return null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "68px minmax(0, 1fr)",
          gap: 12,
          alignItems: "center",
          padding: "12px 12px",
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--elev-1)",
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid color-mix(in srgb, var(--primary) 18%, var(--border))",
            background: "var(--surface-2)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt={user.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", letterSpacing: "-0.02em" }}>{user.nombre}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              {roleLabel}
            </span>
            <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              {user.department || "Ventas"}
            </span>
          </div>
        </div>
      </section>

      <section style={{ padding: 12, borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--elev-1)" }}>
        <p style={{ margin: "0 0 10px", fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Indicadores
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {kpis.map((kpi) => (
            <div key={kpi.label} style={{ padding: 12, borderRadius: 14, border: "1px solid color-mix(in srgb, var(--primary) 14%, var(--border))", background: "color-mix(in srgb, var(--primary) 7%, var(--surface))" }}>
              <strong style={{ display: "block", fontSize: "1rem" }}>{kpi.value}</strong>
              <span style={{ display: "block", marginTop: 4, fontSize: "0.78rem", color: "var(--text-secondary)" }}>{kpi.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: 12, borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--elev-1)" }}>
        <p style={{ margin: "0 0 10px", fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Acciones rápidas
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <Link href="/oportunidades" style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Pipeline de oportunidades
          </Link>
          <Link href="/leads" style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Leads
          </Link>
          <Link href="/clientes" style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Clientes
          </Link>
          <Link href="/cotizaciones" style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Cotizaciones
          </Link>
        </div>
      </section>
    </div>
  );
}

