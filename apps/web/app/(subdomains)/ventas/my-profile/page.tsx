"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
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

function VentasMyProfileContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() || "";
  const scope = useMemo(() => getSalesScope(user, qs ? `?${qs}` : ""), [user, qs]);

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

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.cardTitle}>Acceso</p>
          <p className={styles.actionHint}>Inicia sesión para ver tu perfil.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} aria-label="Mi perfil de ventas">
      <header className={styles.profileHeader}>
        <div className={styles.avatar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayAvatar} alt={displayName} loading="lazy" decoding="async" />
        </div>
        <div>
          <h2 className={styles.name}>{displayName}</h2>
          {canManage && viewKind === "team" && (
            <p className={styles.actionHint} style={{ margin: "4px 0 0" }}>
              Supervisor: {user.nombre} · Suma y promedio de vendedores con acceso a Panel Ventas
            </p>
          )}
          {canManage && viewKind === "seller" && stats?.userName && (
            <p className={styles.actionHint} style={{ margin: "4px 0 0" }}>
              Vista supervisión · Métricas de {stats.userName}
            </p>
          )}
          <div className={styles.metaRow}>
            {canManage && viewKind === "seller" ? (
              <>
                <span className={styles.pill}>Vendedor</span>
                <span className={styles.pill}>Ventas</span>
              </>
            ) : canManage && viewKind === "team" ? (
              <>
                <span className={styles.pill}>{roleLabel}</span>
                <span className={styles.pill}>Vista equipo</span>
                <span className={styles.pill}>{user.email}</span>
              </>
            ) : (
              <>
                <span className={styles.pill}>{roleLabel}</span>
                <span className={styles.pill}>{user.department || "Ventas"}</span>
                <span className={styles.pill}>{user.email}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.span8}`} aria-label="Indicadores">
          <p className={styles.cardTitle}>{indicatorsTitle}</p>
          <div className={styles.kpiRow}>
            {kpis.map((kpi) => (
              <div key={kpi.label} className={styles.kpi}>
                <strong>{kpi.value}</strong>
                <span>{kpi.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.span4}`} aria-label="Acciones rápidas">
          <p className={styles.cardTitle}>Acciones rápidas</p>
          <div className={styles.actions}>
            <Link className={styles.actionLink} href={`/oportunidades${ownerQs}`}>
              <span>Pipeline de oportunidades</span>
              <span className={styles.actionHint}>Ver</span>
            </Link>
            <Link className={styles.actionLink} href={`/leads${ownerQs}`}>
              <span>Leads</span>
              <span className={styles.actionHint}>Gestionar</span>
            </Link>
            <Link className={styles.actionLink} href={`/clientes${ownerQs}`}>
              <span>Clientes</span>
              <span className={styles.actionHint}>Abrir</span>
            </Link>
            <Link className={styles.actionLink} href={`/cotizaciones${ownerQs}`}>
              <span>Cotizaciones</span>
              <span className={styles.actionHint}>Crear</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function VentasMyProfilePage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <p className={styles.actionHint}>Cargando perfil…</p>
        </div>
      }
    >
      <VentasMyProfileContent />
    </Suspense>
  );
}
