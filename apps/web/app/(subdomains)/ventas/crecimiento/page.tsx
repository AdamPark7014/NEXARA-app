"use client";

import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Pie, PieChart } from "recharts";
import styles from "./page.module.css";

type GrowthMetrics = {
  totalClients: number;
  totalLead: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  totalMargin: number;
  averageMargin: number;
  marginByStatus: Array<{ status: string; margin: number }>;
  opportunitiesByStage: Array<{ stage: string; count: number }>;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(value || 0);

export default function VentasCrecimientoPage() {
  const { user } = useUser();
  const [metrics, setMetrics] = useState<GrowthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.token) return;
    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = `?start=${new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString()}&end=${new Date().toISOString()}`;
        const res = await fetch(buildApiUrl(`ventas/reportes/resumen${query}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) throw new Error("No se pudo cargar los datos");
        const summary = await res.json();

        const projectsRes = await fetch(buildApiUrl("ventas/proyectos"), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const projects = await projectsRes.json().catch(() => []);

        const marginByStatus = projects
          .reduce((acc: any[], p: any) => {
            const status = p.status || "Sin estado";
            const existing = acc.find((m) => m.status === status);
            if (existing) {
              existing.margin += Number(p.margin || 0);
            } else {
              acc.push({ status, margin: Number(p.margin || 0) });
            }
            return acc;
          }, [])
          .sort((a: any, b: any) => b.margin - a.margin);

        const totalMargin = projects.reduce((sum: number, p: any) => sum + Number(p.margin || 0), 0);
        const avgMargin = projects.length ? totalMargin / projects.length : 0;

        setMetrics({
          totalClients: summary.totals.clients || 0,
          totalLead: summary.totals.leads || 0,
          opportunitiesWon: summary.totals.won || 0,
          opportunitiesLost: summary.totals.lost || 0,
          totalMargin,
          averageMargin: avgMargin,
          marginByStatus,
          opportunitiesByStage: summary.byStage || [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, [user?.token]);

  const palette = ["#1F6BBA", "#19B36B", "#FF9F40", "#EF5350", "#8E7CF7"];

  if (loading) return <div className={styles.loading}>cargando...</div>;

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Mi crecimiento comercial</h1>
        <p className={styles.heroSubtitle}>
          Seguimiento de metas, margen libre, cartera de clientes y proyectos. Vista integral de tu desempeño como vendedor.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.cardsGrid}>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Margen total</p>
          <div className={styles.cardValue}>{money(metrics?.totalMargin || 0)}</div>
          <p className={styles.cardMeta}>Margen promedio: {money(metrics?.averageMargin || 0)}</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Oportunidades ganadas</p>
          <div className={styles.cardValue}>{metrics?.opportunitiesWon || 0}</div>
          <p className={styles.cardMeta}>Tasa: {metrics?.opportunitiesWon}W/{metrics?.opportunitiesLost}L</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Cartera de clientes</p>
          <div className={styles.cardValue}>{metrics?.totalClients || 0}</div>
          <p className={styles.cardMeta}>Clientes únicos activos</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Leads identificados</p>
          <div className={styles.cardValue}>{metrics?.totalLead || 0}</div>
          <p className={styles.cardMeta}>En el último período</p>
        </article>
      </div>

      <div className={styles.chartGrid}>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Margen de ganancia por estado</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={metrics?.marginByStatus || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="margin" fill="#19B36B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Pipeline por etapa</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={metrics?.opportunitiesByStage || []} dataKey="count" nameKey="stage" outerRadius={90}>
                {(metrics?.opportunitiesByStage || []).map((_, index) => (
                  <Cell key={index} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
