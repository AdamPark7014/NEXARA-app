"use client";

import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import styles from "./page.module.css";

type SellerMetrics = {
  userId: number;
  userName: string;
  totalClients: number;
  totalLeads: number;
  totalMargin: number;
  averageMargin: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  pipelineValue: number;
};

type TeamComparison = {
  sellers: SellerMetrics[];
  teamTotals: {
    totalClients: number;
    totalLeads: number;
    totalMargin: number;
    opportunitiesWon: number;
    opportunitiesLost: number;
  };
};

const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value || 0);

export default function EquipoComparativaPage() {
  const { user } = useUser();
  const [comparison, setComparison] = useState<TeamComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"team" | "individual">("team");
  const [selectedSeller, setSelectedSeller] = useState<number | null>(null);

  useEffect(() => {
    const fetchComparison = async () => {
      if (!user?.token) return;
      setLoading(true);
      setError(null);
      try {
        // Simulating an endpoint: GET /ventas/analytics/team-comparison
        // This would need to be implemented in backend
        const query = `?start=${new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString()}&end=${new Date().toISOString()}`;
        const res = await fetch(buildApiUrl(`ventas/reportes/resumen${query}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) throw new Error("No se pudo cargar la comparativa");
        const summary = await res.json();

        // Fetch all leads and opportunities to build seller metrics
        const [leadsRes, oppsRes] = await Promise.all([
          fetch(buildApiUrl("ventas/leads"), { headers: { Authorization: `Bearer ${user.token}` } }),
          fetch(buildApiUrl("ventas/oportunidades"), { headers: { Authorization: `Bearer ${user.token}` } }),
        ]);

        const leads = await leadsRes.json().catch(() => []);
        const opps = await oppsRes.json().catch(() => []);

        // Group by owner to get individual metrics
        const byOwner = new Map<number, SellerMetrics>();

        leads.forEach((lead: any) => {
          if (!lead.ownerId) return;
          if (!byOwner.has(lead.ownerId)) {
            byOwner.set(lead.ownerId, {
              userId: lead.ownerId,
              userName: lead.owner?.nombre || `Vendedor ${lead.ownerId}`,
              totalClients: 0,
              totalLeads: 0,
              totalMargin: 0,
              averageMargin: 0,
              opportunitiesWon: 0,
              opportunitiesLost: 0,
              pipelineValue: 0,
            });
          }
          const metrics = byOwner.get(lead.ownerId)!;
          metrics.totalLeads += 1;
        });

        opps.forEach((opp: any) => {
          if (!opp.ownerId) return;
          if (!byOwner.has(opp.ownerId)) {
            byOwner.set(opp.ownerId, {
              userId: opp.ownerId,
              userName: opp.owner?.nombre || `Vendedor ${opp.ownerId}`,
              totalClients: 0,
              totalLeads: 0,
              totalMargin: 0,
              averageMargin: 0,
              opportunitiesWon: 0,
              opportunitiesLost: 0,
              pipelineValue: 0,
            });
          }
          const metrics = byOwner.get(opp.ownerId)!;
          metrics.pipelineValue += Number(opp.value || 0);
          if (opp.stage === "WON") metrics.opportunitiesWon += 1;
          if (opp.stage === "LOST") metrics.opportunitiesLost += 1;
        });

        const sellers = Array.from(byOwner.values()).sort((a, b) => b.pipelineValue - a.pipelineValue);
        const teamTotals = {
          totalClients: summary.totals.clients || 0,
          totalLeads: summary.totals.leads || 0,
          totalMargin: summary.totals.marginByStatus ? Object.values(summary.totals.marginByStatus).reduce((s: number, m: any) => s + Number(m.margin || 0), 0) : 0,
          opportunitiesWon: summary.totals.won || 0,
          opportunitiesLost: summary.totals.lost || 0,
        };

        setComparison({ sellers, teamTotals });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [user?.token]);

  const chartData =
    viewMode === "team"
      ? comparison?.sellers.map((s) => ({ name: s.userName.split(" ")[0], margin: s.totalMargin })) || []
      : selectedSeller && comparison
      ? [comparison.sellers.find((s) => s.userId === selectedSeller)].filter(Boolean).map((s) => ({
          name: s!.userName,
          leads: s!.totalLeads,
          won: s!.opportunitiesWon,
          lost: s!.opportunitiesLost,
          margin: s!.totalMargin,
        })) || []
      : [];

  const palette = ["#1F6BBA", "#19B36B", "#FF9F40", "#EF5350", "#8E7CF7", "#EC4899"];

  if (loading) return <div className={styles.loading}>cargando...</div>;

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Comparativa de Equipo</h1>
        <p className={styles.heroSubtitle}>Análisis comparativo de desempeño comercial por vendedor. Benchmarking interno.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.modeToggle}>
        <button
          className={`${styles.toggleBtn} ${viewMode === "team" ? styles.toggleBtnActive : ""}`}
          onClick={() => setViewMode("team")}
        >
          Vista por Equipo
        </button>
        <button
          className={`${styles.toggleBtn} ${viewMode === "individual" ? styles.toggleBtnActive : ""}`}
          onClick={() => setViewMode("individual")}
        >
          Vista Individual
        </button>
      </div>

      <div className={styles.cardsGrid}>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Miembros del equipo</p>
          <div className={styles.cardValue}>{comparison?.sellers.length || 0}</div>
        </article>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Margen total del equipo</p>
          <div className={styles.cardValue}>{money(comparison?.teamTotals.totalMargin || 0)}</div>
        </article>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Oportunidades ganadas</p>
          <div className={styles.cardValue}>{comparison?.teamTotals.opportunitiesWon || 0}</div>
          <p className={styles.cardMeta}>vs {comparison?.teamTotals.opportunitiesLost} perdidas</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardTitle}>Clientes en cartera</p>
          <div className={styles.cardValue}>{comparison?.teamTotals.totalClients || 0}</div>
        </article>
      </div>

      <div className={styles.tableSection}>
        <h2>Ranking de Vendedores</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Pipeline</th>
                <th>Margen</th>
                <th>Leads</th>
                <th>Ganadas</th>
                <th>Perdidas</th>
                <th>Tasa Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {comparison?.sellers.map((seller, idx) => {
                const total = seller.opportunitiesWon + seller.opportunitiesLost || 1;
                const winRate = ((seller.opportunitiesWon / total) * 100).toFixed(0);
                return (
                  <tr key={seller.userId} onClick={() => viewMode === "individual" && setSelectedSeller(seller.userId)} className={viewMode === "individual" ? styles.clickable : ""}>
                    <td>
                      <span className={styles.rank}>#{idx + 1}</span>
                      {seller.userName}
                    </td>
                    <td>{money(seller.pipelineValue)}</td>
                    <td className={styles.highlight}>{money(seller.totalMargin)}</td>
                    <td>{seller.totalLeads}</td>
                    <td className={styles.positive}>{seller.opportunitiesWon}</td>
                    <td className={styles.negative}>{seller.opportunitiesLost}</td>
                    <td>
                      <span className={`${styles.badge} ${Number(winRate) > 50 ? styles.badgeSuccess : styles.badgeWarning}`}>
                        {winRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {comparison && comparison.sellers.length > 0 && (
        <div className={styles.chartSection}>
          <h2>Margen de Ganancia por Vendedor</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={comparison.sellers.map((s, i) => ({ name: s.userName.split(" ")[0], margin: s.totalMargin }))} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Bar dataKey="margin" fill="#19B36B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {viewMode === "individual" && selectedSeller && (
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <h2>Detalles de {comparison?.sellers.find((s) => s.userId === selectedSeller)?.userName}</h2>
            <button className={styles.closeBtn} onClick={() => setSelectedSeller(null)}>✕</button>
          </div>
          {comparison?.sellers.find((s) => s.userId === selectedSeller) && (
            <div className={styles.detailGrid}>
              {(() => {
                const seller = comparison!.sellers.find((s) => s.userId === selectedSeller)!;
                return (
                  <>
                    <div className={styles.detailItem}>
                      <p>Pipeline Total</p>
                      <p className={styles.detailValue}>{money(seller.pipelineValue)}</p>
                    </div>
                    <div className={styles.detailItem}>
                      <p>Margen Generado</p>
                      <p className={styles.detailValue}>{money(seller.totalMargin)}</p>
                    </div>
                    <div className={styles.detailItem}>
                      <p>Margen Promedio por Oportunidad</p>
                      <p className={styles.detailValue}>{money(seller.averageMargin)}</p>
                    </div>
                    <div className={styles.detailItem}>
                      <p>Leads Identificados</p>
                      <p className={styles.detailValue}>{seller.totalLeads}</p>
                    </div>
                    <div className={styles.detailItem}>
                      <p>Oportunidades Ganadas</p>
                      <p className={`${styles.detailValue} ${styles.positive}`}>{seller.opportunitiesWon}</p>
                    </div>
                    <div className={styles.detailItem}>
                      <p>Oportunidades Perdidas</p>
                      <p className={`${styles.detailValue} ${styles.negative}`}>{seller.opportunitiesLost}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
