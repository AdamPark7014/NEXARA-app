"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { useUser } from "@/components/UserContext";
import { getAvatarSrc, getRoleLabel } from "@/lib/panel-user";
import { getSalesVendorStats, type SalesVendorStats } from "@/lib/sales-api";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function VentasMyProfilePage() {
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
          <img src={avatarSrc} alt={user.nombre} loading="lazy" decoding="async" />
        </div>
        <div>
          <h2 className={styles.name}>{user.nombre}</h2>
          <div className={styles.metaRow}>
            <span className={styles.pill}>{roleLabel}</span>
            <span className={styles.pill}>{user.department || "Ventas"}</span>
            <span className={styles.pill}>{user.email}</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.span8}`} aria-label="Indicadores">
          <p className={styles.cardTitle}>Indicadores</p>
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
            <Link className={styles.actionLink} href="/oportunidades">
              <span>Pipeline de oportunidades</span>
              <span className={styles.actionHint}>Ver</span>
            </Link>
            <Link className={styles.actionLink} href="/leads">
              <span>Leads</span>
              <span className={styles.actionHint}>Gestionar</span>
            </Link>
            <Link className={styles.actionLink} href="/clientes">
              <span>Clientes</span>
              <span className={styles.actionHint}>Abrir</span>
            </Link>
            <Link className={styles.actionLink} href="/cotizaciones">
              <span>Cotizaciones</span>
              <span className={styles.actionHint}>Crear</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

