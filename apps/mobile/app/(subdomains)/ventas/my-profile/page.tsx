"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getAvatarSrc, getRoleLabel, isSalesManagerUser } from "@/lib/panel-user";
import { getSalesScope } from "@/lib/sales-scope";
import { getSalesVendorStats, type SalesVendorStats } from "@/lib/sales-api";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);

function aggregateTeamStats(rows: SalesVendorStats[]): SalesVendorStats | null {
  if (!rows.length) return null;
  let revenue = 0;
  let opportunities = 0;
  let projects = 0;
  let perfSum = 0;
  for (const r of rows) {
    revenue += r.revenue || 0;
    opportunities += r.opportunities || 0;
    projects += r.projects || 0;
    perfSum += r.performance || 0;
  }
  const n = rows.length;
  return {
    userId: 0,
    userName: "Todos los vendedores",
    revenue,
    opportunities,
    projects,
    margin: 0,
    conversionRate: 0,
    performance: n ? Math.round(perfSum / n) : 0,
  };
}

function sellerAvatarUrl(name: string) {
  const seed = encodeURIComponent(name.trim() || "Vendedor");
  return `https://ui-avatars.com/api/?name=${seed}&background=0D8ABC&color=fff&size=128`;
}

function VentasMyProfileMobileContent() {
  const { user } = useUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() || "";
  const scope = useMemo(() => getSalesScope(user, qs ? `?${qs}` : ""), [user, qs]);

  const inPrefixedVentasPath = Boolean(pathname && pathname.startsWith("/ventas"));
  const resolveVentasHref = (href: string) => {
    if (!href.startsWith("/")) return href;
    if (href === "/paneles" || href === "/login") return href;
    if (href === "/ventas" || href.startsWith("/ventas/")) return href;
    return inPrefixedVentasPath ? `/ventas${href}` : href;
  };

  const [stats, setStats] = useState<SalesVendorStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewKind, setViewKind] = useState<"self" | "team" | "seller">("self");

  const roleLabel = getRoleLabel(user);
  const canManage = isSalesManagerUser(user);
  const myId = user?.id ? Number(user.id) : 0;

  useEffect(() => {
    const load = async () => {
      if (!user?.token) return;
      setLoading(true);
      try {
        const all = await getSalesVendorStats(user.token, "month");
        const sellerRows =
          user?.isSuperAdmin && myId ? all.filter((v) => Number(v.userId) !== myId) : all;

        if (canManage) {
          const oid = scope.ownerId;
          if (oid) {
            const row = sellerRows.find((v) => Number(v.userId) === Number(oid));
            if (row) {
              setStats(row);
              setViewKind("seller");
            } else {
              setStats(aggregateTeamStats(sellerRows));
              setViewKind("team");
            }
          } else {
            setStats(aggregateTeamStats(sellerRows));
            setViewKind("team");
          }
        } else {
          const mine = sellerRows.find((v) => Number(v.userId) === myId) || null;
          setStats(mine);
          setViewKind("self");
        }
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.token, user?.id, user?.isSuperAdmin, canManage, scope.ownerId, myId]);

  const ownerQs = scope.ownerId ? `?ownerId=${scope.ownerId}` : "";

  const displayName =
    viewKind === "team"
      ? "Equipo comercial"
      : viewKind === "seller" && stats?.userName
        ? stats.userName
        : user?.nombre || "Perfil";

  const displayAvatar =
    viewKind === "team"
      ? sellerAvatarUrl("Equipo")
      : viewKind === "seller" && stats?.userName
        ? sellerAvatarUrl(stats.userName)
        : getAvatarSrc(user);

  const kpis = useMemo(() => {
    return [
      { label: "Ingresos (mes)", value: stats ? formatMoney(stats.revenue) : loading ? "…" : "—" },
      { label: "Oportunidades", value: stats ? String(stats.opportunities) : loading ? "…" : "—" },
      { label: "Proyectos", value: stats ? String(stats.projects) : loading ? "…" : "—" },
      { label: "Performance", value: stats ? `${stats.performance}%` : loading ? "…" : "—" },
    ];
  }, [stats, loading]);

  const indicatorsTitle =
    viewKind === "team"
      ? "Indicadores del equipo"
      : viewKind === "seller"
        ? "Indicadores del vendedor"
        : "Indicadores";

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
          <img src={displayAvatar} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", letterSpacing: "-0.02em" }}>{displayName}</h2>
          {canManage && viewKind === "team" && (
            <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              Supervisor: {user.nombre}
            </p>
          )}
          {canManage && viewKind === "seller" && stats?.userName && (
            <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              Vista supervisión · {stats.userName}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {canManage && viewKind === "seller" ? (
              <>
                <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Vendedor
                </span>
                <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Ventas
                </span>
              </>
            ) : canManage && viewKind === "team" ? (
              <>
                <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  {roleLabel}
                </span>
                <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Vista equipo
                </span>
              </>
            ) : (
              <>
                <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  {roleLabel}
                </span>
                <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-clean)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  {user.department || "Ventas"}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <section style={{ padding: 12, borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--elev-1)" }}>
        <p style={{ margin: "0 0 10px", fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          {indicatorsTitle}
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
          <Link href={`${resolveVentasHref("/oportunidades")}${ownerQs}`} style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Pipeline de oportunidades
          </Link>
          <Link href={`${resolveVentasHref("/leads")}${ownerQs}`} style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Leads
          </Link>
          <Link href={`${resolveVentasHref("/clientes")}${ownerQs}`} style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Clientes
          </Link>
          <Link href={`${resolveVentasHref("/cotizaciones")}${ownerQs}`} style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-clean)", textDecoration: "none", color: "var(--foreground)" }}>
            Cotizaciones
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function VentasMyProfileMobilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Cargando perfil…</div>}>
      <VentasMyProfileMobileContent />
    </Suspense>
  );
}
