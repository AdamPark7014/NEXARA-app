"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import Link from "next/link";
import styles from "./page.module.css";

type DashboardData = {
  leads: { id: number; name: string; company: string; score: number }[];
  opportunities: { id: number; title: string; stage: string; value: number }[];
  projects: { id: number; name: string; status: string; margin: number }[];
  stats: { pipelineValue: number; opportunityCount: number; projectCount: number; clientCount: number };
};

const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(value || 0);

export default function VentasDashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    return base.replace(/[\/\.]+$/, "");
  }, []);

  useEffect(() => {
    if (!user?.token) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [leadsRes, oppsRes, projectsRes] = await Promise.all([
          fetch(`${apiUrl}/ventas/leads`, { headers: { Authorization: `Bearer ${user.token}` } }),
          fetch(`${apiUrl}/ventas/oportunidades`, { headers: { Authorization: `Bearer ${user.token}` } }),
          fetch(`${apiUrl}/ventas/proyectos`, { headers: { Authorization: `Bearer ${user.token}` } }),
        ]);

        const leads = await leadsRes.json().catch(() => []);
        const opportunities = await oppsRes.json().catch(() => []);
        const projects = await projectsRes.json().catch(() => []);

        const pipelineValue = opportunities.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
        const clientCount = new Set(opportunities.map((o: any) => o.clientId)).size;
        const avgMargin = projects.length ? projects.reduce((sum: number, p: any) => sum + Number(p.margin || 0), 0) / projects.length : 0;

        setData({
          leads: leads.slice(0, 5),
          opportunities: opportunities.slice(0, 5),
          projects: projects.slice(0, 5),
          stats: {
            pipelineValue,
            opportunityCount: opportunities.length,
            projectCount: projects.length,
            clientCount,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.token, apiUrl]);

  if (loading) return <div className={styles.loading}>cargando...</div>;

  return (
    <section className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel de ventas</p>
          <h1 className={styles.title}>Panorama comercial</h1>
          <p className={styles.subtitle}>
            Visualiza oportunidades, avances y rentabilidad por cliente. Todo en una sola vista.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/panel/ventas/oportunidades">
            <button className={styles.primaryButton} type="button">Nueva oportunidad</button>
          </Link>
          <Link href="/panel/ventas/reportes">
            <button className={styles.ghostButton} type="button">Generar reporte</button>
          </Link>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.metricGrid}>
        <article className={styles.metricCard}>
          <p>Pipeline activo</p>
          <h2>{data ? money(data.stats.pipelineValue) : "-"}</h2>
        </article>
        <article className={styles.metricCard}>
          <p>Oportunidades</p>
          <h2>{data?.stats.opportunityCount || 0}</h2>
          <span>oportunidades abiertas</span>
        </article>
        <article className={styles.metricCard}>
          <p>Proyectos activos</p>
          <h2>{data?.stats.projectCount || 0}</h2>
          <span>en seguimiento</span>
        </article>
        <article className={styles.metricCard}>
          <p>Clientes únicos</p>
          <h2>{data?.stats.clientCount || 0}</h2>
          <span>en cartera</span>
        </article>
      </div>

      <div className={styles.boardGrid}>
        <div className={styles.boardCard}>
          <h3>Leads recientes</h3>
          <ul>
            {data?.leads.map((lead) => (
              <li key={lead.id}>
                <span>{lead.name}</span>
                <span className={styles.tag}>{lead.company}</span>
              </li>
            ))}
            {!data?.leads.length && <li><span>Sin leads</span></li>}
          </ul>
        </div>
        <div className={styles.boardCard}>
          <h3>Oportunidades activas</h3>
          <ul>
            {data?.opportunities.map((opp) => (
              <li key={opp.id}>
                <span>{opp.title}</span>
                <span>{opp.stage}</span>
              </li>
            ))}
            {!data?.opportunities.length && <li><span>Sin oportunidades</span></li>}
          </ul>
        </div>
        <div className={styles.boardCard}>
          <h3>Proyectos en curso</h3>
          <ul>
            {data?.projects.map((proj) => (
              <li key={proj.id}>
                <span>{proj.name}</span>
                <span>{proj.status}</span>
              </li>
            ))}
            {!data?.projects.length && <li><span>Sin proyectos</span></li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
