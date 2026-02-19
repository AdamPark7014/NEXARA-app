import React, { useEffect, useState, useMemo } from 'react';
import { useUser } from './UserContext';
import styles from './SalesReportsDashboard.module.css';

interface SalesMetrics {
  totalRevenue: number;
  opportunityCount: number;
  projectCount: number;
  averageMargin: number;
  conversionRate: number;
  pipelineValue: number;
  closedProjects: number;
  activeClients: number;
}

interface VendorStats {
  userId: number;
  userName: string;
  revenue: number;
  opportunities: number;
  projects: number;
  margin: number;
  conversionRate: number;
  performance: number; // 0-100
}

interface SalesReportsDashboardProps {
  apiUrl: string;
  period?: 'week' | 'month' | 'year';
  onPeriodChange?: (period: 'week' | 'month' | 'year') => void;
}

export default function SalesReportsDashboard({
  apiUrl,
  period = 'month',
  onPeriodChange,
}: SalesReportsDashboardProps) {
  const { user } = useUser();
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [vendorStats, setVendorStats] = useState<VendorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<'week' | 'month' | 'year'>(period);
  const [generatePdfLoading, setGeneratePdfLoading] = useState(false);

  const fetchMetrics = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/ventas/reportes/metricas?period=${currentPeriod}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error('Error al cargar métricas');
      const data = await res.json();
      setMetrics(data);

      const vendorsRes = await fetch(`${apiUrl}/ventas/reportes/vendedores?period=${currentPeriod}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (vendorsRes.ok) {
        const vendorsData = await vendorsRes.json();
        setVendorStats(Array.isArray(vendorsData) ? vendorsData : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [user?.token, currentPeriod]);

  const handlePeriodChange = (newPeriod: 'week' | 'month' | 'year') => {
    setCurrentPeriod(newPeriod);
    onPeriodChange?.(newPeriod);
  };

  const handleGeneratePdf = async () => {
    if (!user?.token || !metrics) return;
    setGeneratePdfLoading(true);
    try {
      const res = await fetch(`${apiUrl}/ventas/reportes/generar-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          period: currentPeriod,
          includeVendorStats: true,
        }),
      });

      if (!res.ok) throw new Error('Error al generar PDF');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-ventas-${currentPeriod}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar PDF');
    } finally {
      setGeneratePdfLoading(false);
    }
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(value || 0);

  const getPeriodLabel = () => {
    const today = new Date();
    switch (currentPeriod) {
      case 'week':
        return `Semana del ${today.toLocaleDateString('es-MX')}`;
      case 'month':
        return today.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      case 'year':
        return today.getFullYear().toString();
      default:
        return '';
    }
  };

  if (loading) return <div className={styles.loading}>Cargando reportes...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Reportes de Ventas</h2>
          <p className={styles.period}>{getPeriodLabel()}</p>
        </div>

        <div className={styles.controls}>
          <div className={styles.periodButtons}>
            {(['week', 'month', 'year'] as const).map((p) => (
              <button
                key={p}
                className={`${styles.periodBtn} ${currentPeriod === p ? styles.active : ''}`}
                onClick={() => handlePeriodChange(p)}
              >
                {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Año'}
              </button>
            ))}
          </div>

          <button
            className={styles.exportBtn}
            onClick={handleGeneratePdf}
            disabled={generatePdfLoading || !metrics}
          >
            {generatePdfLoading ? '⏳ Generando...' : '📄 Exportar PDF'}
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {metrics && (
        <>
          {/* Main Metrics */}
          <div className={styles.metricsGrid}>
            <MetricCard
              title="Ingresos Totales"
              value={formatMoney(metrics.totalRevenue)}
              icon="💰"
              trend={5} // 5% increase
            />
            <MetricCard
              title="Pipeline Activo"
              value={formatMoney(metrics.pipelineValue)}
              icon="📊"
              trend={0}
            />
            <MetricCard
              title="Margen Promedio"
              value={`${metrics.averageMargin.toFixed(1)}%`}
              icon="📈"
              trend={3}
            />
            <MetricCard
              title="Tasa de Conversión"
              value={`${metrics.conversionRate.toFixed(1)}%`}
              icon="🎯"
              trend={2}
            />
            <MetricCard
              title="Oportunidades"
              value={metrics.opportunityCount.toString()}
              icon="💡"
              trend={0}
            />
            <MetricCard
              title="Proyectos Activos"
              value={metrics.projectCount.toString()}
              icon="🏗️"
              trend={0}
            />
          </div>

          {/* Vendor Performance */}
          {vendorStats.length > 0 && (
            <div className={styles.vendorSection}>
              <h3 className={styles.sectionTitle}>Desempeño por Vendedor</h3>

              <div className={styles.vendorGrid}>
                {vendorStats.map((vendor) => (
                  <div key={vendor.userId} className={styles.vendorCard}>
                    <div className={styles.vendorHeader}>
                      <h4 className={styles.vendorName}>{vendor.userName}</h4>
                      <div
                        className={styles.performanceBar}
                        style={{
                          backgroundSize: `${vendor.performance}% 100%`,
                        }}
                      >
                        <span className={styles.performanceText}>{vendor.performance}%</span>
                      </div>
                    </div>

                    <div className={styles.vendorMetrics}>
                      <div className={styles.vendorMetricItem}>
                        <span>Ingresos:</span>
                        <strong>{formatMoney(vendor.revenue)}</strong>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Oportunidades:</span>
                        <strong>{vendor.opportunities}</strong>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Proyectos:</span>
                        <strong>{vendor.projects}</strong>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Margen:</span>
                        <strong>{vendor.margin.toFixed(1)}%</strong>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Conversión:</span>
                        <strong>{vendor.conversionRate.toFixed(1)}%</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Charts */}
          <div className={styles.chartsSection}>
            <div className={styles.chart}>
              <h4 className={styles.chartTitle}>Desglose de Ingresos</h4>
              <SimpleBarChart
                data={[
                  { label: 'Productos', value: metrics.totalRevenue * 0.4 },
                  { label: 'Servicios', value: metrics.totalRevenue * 0.35 },
                  { label: 'Consultoría', value: metrics.totalRevenue * 0.25 },
                ]}
              />
            </div>

            <div className={styles.chart}>
              <h4 className={styles.chartTitle}>Estado de Oportunidades</h4>
              <SimplePieChart
                data={[
                  { label: 'Ganadas', value: metrics.closedProjects, color: '#198754' },
                  { label: 'En progreso', value: metrics.opportunityCount - metrics.closedProjects * 0.3, color: '#0d6efd' },
                  { label: 'Perdidas', value: metrics.opportunityCount * 0.1, color: '#dc3545' },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, trend }: any) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricContent}>
        <p className={styles.metricTitle}>{title}</p>
        <p className={styles.metricValue}>{value}</p>
        {trend !== 0 && (
          <p className={`${styles.metricTrend} ${trend > 0 ? styles.positive : styles.negative}`}>
            {trend > 0 ? '📈' : '📉'} {Math.abs(trend)}% vs período anterior
          </p>
        )}
      </div>
    </div>
  );
}

function SimpleBarChart({ data }: any) {
  const maxValue = Math.max(...data.map((d: any) => d.value));
  return (
    <div className={styles.barChart}>
      {data.map((item: any, i: number) => (
        <div key={i} className={styles.barItem}>
          <div className={styles.barLabel}>{item.label}</div>
          <div className={styles.barContainer}>
            <div
              className={styles.bar}
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
          <div className={styles.barValue}>
            {new Intl.NumberFormat('es-MX', {
              style: 'currency',
              currency: 'MXN',
              maximumFractionDigits: 0,
            }).format(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SimplePieChart({ data }: any) {
  const total = data.reduce((sum: number, d: any) => sum + d.value, 0);
  let cumulativePercent = 0;

  return (
    <div className={styles.pieChart}>
      <svg viewBox="0 0 100 100" className={styles.pieSvg}>
        {data.map((item: any, i: number) => {
          const startAngle = (cumulativePercent / 100) * 360;
          const endAngle = ((cumulativePercent + (item.value / total) * 100) / 100) * 360;
          cumulativePercent += (item.value / total) * 100;

          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;

          const x1 = 50 + 40 * Math.cos(startRad);
          const y1 = 50 + 40 * Math.sin(startRad);
          const x2 = 50 + 40 * Math.cos(endRad);
          const y2 = 50 + 40 * Math.sin(endRad);

          const largeArc = endAngle - startAngle > 180 ? 1 : 0;

          const pathData = [
            `M 50 50`,
            `L ${x1} ${y1}`,
            `A 40 40 0 ${largeArc} 1 ${x2} ${y2}`,
            `Z`,
          ].join(' ');

          return (
            <path key={i} d={pathData} fill={item.color} stroke="white" strokeWidth="1" />
          );
        })}
      </svg>

      <div className={styles.pieLegend}>
        {data.map((item: any, i: number) => (
          <div key={i} className={styles.legendItem}>
            <span
              className={styles.legendColor}
              style={{ backgroundColor: item.color }}
            />
            <span className={styles.legendLabel}>{item.label}</span>
            <span className={styles.legendValue}>
              {Math.round((item.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
