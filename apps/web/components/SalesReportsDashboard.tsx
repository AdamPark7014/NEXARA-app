import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import PDFViewer from './PDFViewer';
import { io, Socket } from 'socket.io-client';
import {
  getSalesAuditEvents,
  getSalesExecutiveInsights,
  getSalesManagerCockpit,
  getSalesMetrics,
  getSalesQuotaProgress,
  setSalesQuota,
  type SalesQuotaPayload,
  type SalesAuditEvent,
  type SalesExecutiveInsights,
  type SalesManagerCockpit,
  type SalesMetrics,
  type SalesVendorStats,
} from '@/lib/sales-api';
import styles from './SalesReportsDashboard.module.css';
import { triggerBlobDownload, triggerFileDownload } from '@/lib/file-download';
import { buildApiUrl, getSocketBaseUrl } from '@/lib/api-base';

interface SalesReportsDashboardProps {
  period?: 'week' | 'month' | 'year';
  onPeriodChange?: (period: 'week' | 'month' | 'year') => void;
}

export default function SalesReportsDashboard({
  period = 'month',
  onPeriodChange,
}: SalesReportsDashboardProps) {
  const { user } = useUser();
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [vendorStats, setVendorStats] = useState<SalesVendorStats[]>([]);
  const [insights, setInsights] = useState<SalesExecutiveInsights | null>(null);
  const [cockpit, setCockpit] = useState<SalesManagerCockpit | null>(null);
  const [auditEvents, setAuditEvents] = useState<SalesAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<'week' | 'month' | 'year'>(period);
  const [periodLabel, setPeriodLabel] = useState('');
  const [generatePdfLoading, setGeneratePdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const pdfModalRef = useRef<HTMLDivElement | null>(null);
  const [quotaForm, setQuotaForm] = useState<SalesQuotaPayload>({
    period,
    ownerId: undefined,
    targetRevenue: 0,
    targetOpportunities: 0,
  });

  const getStatusBadgeClass = (status?: 'on-track' | 'risk' | 'off-track') => {
    if (status === 'on-track') return `${styles.statusBadge} ${styles.statusOnTrack}`;
    if (status === 'risk') return `${styles.statusBadge} ${styles.statusRisk}`;
    return `${styles.statusBadge} ${styles.statusOffTrack}`;
  };

  const fetchMetrics = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const [metricsData, vendorData, insightsData, cockpitData, auditData] = await Promise.all([
        getSalesMetrics(user.token, currentPeriod),
        getSalesQuotaProgress(user.token, currentPeriod),
        getSalesExecutiveInsights(user.token, currentPeriod),
        getSalesManagerCockpit(user.token, currentPeriod),
        getSalesAuditEvents(user.token, currentPeriod, 20),
      ]);

      setMetrics(metricsData);
      setVendorStats(vendorData);
      setInsights(insightsData);
      setCockpit(cockpitData);
      setAuditEvents(auditData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [user?.token, currentPeriod]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchMetrics();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['OportunidadVenta', 'Opportunity', 'CotizacionVenta', 'ProyectoVenta'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, fetchMetrics]);

  const handlePeriodChange = (newPeriod: 'week' | 'month' | 'year') => {
    setCurrentPeriod(newPeriod);
    setQuotaForm((prev) => ({ ...prev, period: newPeriod }));
    onPeriodChange?.(newPeriod);
  };

  const handleSaveQuota = async () => {
    if (!user?.token) return;
    if (quotaForm.targetRevenue <= 0) {
      setError('Define una meta de ingresos mayor a 0');
      return;
    }

    try {
      await setSalesQuota(user.token, quotaForm);
      await fetchMetrics();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar cuota');
    }
  };

  const handleGeneratePdf = async () => {
    if (!user?.token || !metrics) return;
    setGeneratePdfLoading(true);
    try {
      // Build logo URL with nexara.com.mx domain
      const logoUrl = 'https://nexara.com.mx/logo-nexara.png';

      const res = await fetch(buildApiUrl("ventas/reportes/generar-pdf"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          period: currentPeriod,
          includeVendorStats: true,
          logoUrl,
        }),
      });

      if (!res.ok) throw new Error('Error al generar PDF');

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      setPdfData(new Uint8Array(arrayBuffer));

      if (pdfUrl) {
        window.URL.revokeObjectURL(pdfUrl);
      }
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      setShowPdfViewer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar PDF');
    } finally {
      setGeneratePdfLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    const name = `reporte-ventas-${currentPeriod}-${new Date().toISOString().slice(0, 10)}.pdf`;
    if (pdfData?.length) {
      void triggerBlobDownload(new Blob([new Uint8Array(pdfData)], { type: 'application/pdf' }), name, {
        mimeType: 'application/pdf',
      });
      return;
    }
    if (!pdfUrl) return;
    void triggerFileDownload(pdfUrl, name, { preferOpenOnMobile: true, mimeType: 'application/pdf' });
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(value || 0);

  useEffect(() => {
    const today = new Date();
    switch (currentPeriod) {
      case 'week':
        setPeriodLabel(`Semana del ${today.toLocaleDateString('es-MX')}`);
        break;
      case 'month':
        setPeriodLabel(today.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
        break;
      case 'year':
        setPeriodLabel(today.getFullYear().toString());
        break;
      default:
        setPeriodLabel('');
        break;
    }
  }, [currentPeriod]);

  useEffect(() => {
    if (!showPdfViewer) return;

    const modal = pdfModalRef.current;
    if (!modal) return;

    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);

    const initialFocusable = getFocusable();
    initialFocusable[0]?.focus();

    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowPdfViewer(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !modal.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last || !modal.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener('keydown', handleModalKeyDown);
    return () => modal.removeEventListener('keydown', handleModalKeyDown);
  }, [showPdfViewer]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        window.URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  if (loading) return <div className={styles.loading}>Cargando reportes...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Reportes de Ventas</h2>
          <p className={styles.period}>{periodLabel}</p>
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
                      <span className={getStatusBadgeClass(vendor.status)}>
                        {vendor.status === 'on-track' ? 'On-track' : vendor.status === 'risk' ? 'Risk' : 'Off-track'}
                      </span>
                      <div className={styles.performanceBar}>
                        <progress className={styles.performanceProgress} max={100} value={Math.max(0, Math.min(100, Number(vendor.performance) || 0))} />
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
                      <div className={styles.vendorMetricItem}>
                        <span>Meta ingresos:</span>
                        <strong>{formatMoney(vendor.targetRevenue || 0)}</strong>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Cumplimiento:</span>
                        <strong>{Number(vendor.attainmentRevenue || 0).toFixed(1)}%</strong>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Gap:</span>
                        <strong>{formatMoney(Number(vendor.revenueGap || 0))}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {user?.isSuperAdmin && vendorStats.length > 0 && (
                <div className={`${styles.vendorGrid} ${styles.spacingTop}`}> 
                  <div className={`${styles.vendorCard} ${styles.fullWidthCard}`}>
                    <div className={styles.vendorHeader}>
                      <h4 className={styles.vendorName}>Configurar cuota</h4>
                    </div>
                    <div className={styles.vendorMetrics}>
                      <div className={styles.vendorMetricItem}>
                        <span>Vendedor:</span>
                        <select
                          value={quotaForm.ownerId || ''}
                          onChange={(event) => setQuotaForm((prev) => ({ ...prev, ownerId: Number(event.target.value) || undefined }))}
                        >
                          <option value="">Selecciona</option>
                          {vendorStats.map((vendor) => (
                            <option key={vendor.userId} value={vendor.userId}>{vendor.userName}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Meta ingresos:</span>
                        <input
                          type="number"
                          min={0}
                          value={quotaForm.targetRevenue}
                          onChange={(event) => setQuotaForm((prev) => ({ ...prev, targetRevenue: Number(event.target.value || 0) }))}
                        />
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span>Meta oportunidades:</span>
                        <input
                          type="number"
                          min={0}
                          value={quotaForm.targetOpportunities || 0}
                          onChange={(event) => setQuotaForm((prev) => ({ ...prev, targetOpportunities: Number(event.target.value || 0) }))}
                        />
                      </div>
                      <div className={styles.vendorMetricItem}>
                        <span></span>
                        <button className={styles.exportBtn} onClick={handleSaveQuota}>Guardar cuota</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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

          {/* Executive Insights */}
          {insights && (
            <div className={styles.vendorSection}>
              <h3 className={styles.sectionTitle}>Insights Ejecutivos</h3>
              <div className={styles.vendorGrid}>
                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Forecast ponderado</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    <div className={styles.vendorMetricItem}>
                      <span>Forecast:</span>
                      <strong>{formatMoney(insights.forecast.weightedForecast)}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Cobertura:</span>
                      <strong>{insights.forecast.forecastCoverage.toFixed(1)}%</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Ciclo promedio:</span>
                      <strong>{insights.efficiency.avgCycleDays.toFixed(1)} días</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Commit:</span>
                      <strong>{formatMoney(insights.forecast.commitForecast)}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Best case:</span>
                      <strong>{formatMoney(insights.forecast.bestCaseForecast)}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Worst case:</span>
                      <strong>{formatMoney(insights.forecast.worstCaseForecast)}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Distribución por etapa</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    {Object.entries(insights.stageDistribution)
                      .sort(([, a], [, b]) => Number(b) - Number(a))
                      .map(([stage, count]) => (
                        <div key={stage} className={styles.vendorMetricItem}>
                          <span>{stage}:</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Aging de pipeline</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    {insights.pipelineAging.byStage.map((item) => (
                      <div key={item.stage} className={styles.vendorMetricItem}>
                        <span>{item.stage} ({item.count}):</span>
                        <strong>{item.avgDays.toFixed(1)} días</strong>
                      </div>
                    ))}
                    <div className={styles.vendorMetricItem}>
                      <span>0-7 días:</span>
                      <strong>{insights.pipelineAging.buckets.bucket0to7}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>8-30 días:</span>
                      <strong>{insights.pipelineAging.buckets.bucket8to30}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>31-60 días:</span>
                      <strong>{insights.pipelineAging.buckets.bucket31to60}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>+60 días:</span>
                      <strong>{insights.pipelineAging.buckets.bucket60plus}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Próxima acción</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    <div className={styles.vendorMetricItem}>
                      <span>Oportunidades activas:</span>
                      <strong>{insights.nextActionCompliance.activeOpportunities}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Con plan de acción:</span>
                      <strong>{insights.nextActionCompliance.opportunitiesWithActionPlan}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Cobertura:</span>
                      <strong>{insights.nextActionCompliance.actionPlanCoverage.toFixed(1)}%</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Acciones vencidas:</span>
                      <strong>{insights.nextActionCompliance.overdueNextActions}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Higiene de pipeline</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    <div className={styles.vendorMetricItem}>
                      <span>Score:</span>
                      <strong>{insights.pipelineHygiene.score}/100</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Stale +14d:</span>
                      <strong>{insights.pipelineHygiene.staleOpportunities14d}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Stale +30d:</span>
                      <strong>{insights.pipelineHygiene.staleOpportunities30d}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Sin actividad reciente:</span>
                      <strong>{insights.pipelineHygiene.opportunitiesWithoutRecentActivity}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Alto valor/baja prob.:</span>
                      <strong>{insights.pipelineHygiene.highValueLowProbability}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Ejecución comercial</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    <div className={styles.vendorMetricItem}>
                      <span>Promedio touches:</span>
                      <strong>{insights.cadenceExecution.avgTouchesPerOpportunity.toFixed(2)}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Sin touchpoint 7d:</span>
                      <strong>{insights.cadenceExecution.opportunitiesWithoutRecentActivity}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Vendedores on-track:</span>
                      <strong>{insights.repRiskSummary.onTrack}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Vendedores en riesgo:</span>
                      <strong>{insights.repRiskSummary.risk}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Vendedores off-track:</span>
                      <strong>{insights.repRiskSummary.offTrack}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {insights.riskAlerts.length > 0 && (
                <div className={`${styles.vendorGrid} ${styles.spacingTop}`}>
                  <div className={`${styles.vendorCard} ${styles.fullWidthCard}`}>
                    <div className={styles.vendorHeader}>
                      <h4 className={styles.vendorName}>Alertas comerciales</h4>
                    </div>
                    <div className={styles.vendorMetrics}>
                      {insights.riskAlerts.map((alert, index) => (
                        <div key={`${alert.level}-${index}`} className={styles.vendorMetricItem}>
                          <span>
                            {alert.level === 'high' ? '🔴' : alert.level === 'medium' ? '🟠' : '🟡'} {alert.message}
                          </span>
                          <strong>{alert.level.toUpperCase()}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {cockpit && (
            <div className={styles.vendorSection}>
              <h3 className={styles.sectionTitle}>Cockpit de Manager</h3>
              <div className={styles.vendorGrid}>
                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Resumen operativo</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    <div className={styles.vendorMetricItem}>
                      <span>Oportunidades activas:</span>
                      <strong>{cockpit.summary.activeOpportunities}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Queue de coaching:</span>
                      <strong>{cockpit.summary.coachingQueue}</strong>
                    </div>
                    <div className={styles.vendorMetricItem}>
                      <span>Acciones vencidas:</span>
                      <strong>{cockpit.summary.overdueActions}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Capacidad por vendedor</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    {cockpit.capacityBySeller.slice(0, 8).map((row) => (
                      <div key={row.ownerId} className={styles.vendorMetricItem}>
                        <span>{row.ownerName}: {row.activePipeline}/{row.targetCapacity}</span>
                        <strong>{row.utilization.toFixed(1)}%</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.vendorCard}>
                  <div className={styles.vendorHeader}>
                    <h4 className={styles.vendorName}>Leaderboard</h4>
                  </div>
                  <div className={styles.vendorMetrics}>
                    {cockpit.leaderboard.map((row) => (
                      <div key={row.userId} className={styles.vendorMetricItem}>
                        <span>{row.userName} · {formatMoney(row.revenue)}</span>
                        <strong>{row.performance}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {cockpit.coachingPriorities.length > 0 && (
                <div className={`${styles.vendorGrid} ${styles.spacingTop}`}>
                  <div className={`${styles.vendorCard} ${styles.fullWidthCard}`}>
                    <div className={styles.vendorHeader}>
                      <h4 className={styles.vendorName}>Prioridades de coaching</h4>
                    </div>
                    <div className={styles.vendorMetrics}>
                      {cockpit.coachingPriorities.slice(0, 10).map((item) => (
                        <div key={item.opportunityId} className={styles.vendorMetricItem}>
                          <span>
                            [{item.riskScore}] {item.title} · {item.ownerName} · {item.stage}
                          </span>
                          <strong>{item.recommendation}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Audit Feed */}
          {auditEvents.length > 0 && (
            <div className={styles.vendorSection}>
              <h3 className={styles.sectionTitle}>Auditoría Comercial Reciente</h3>
              <div className={styles.vendorGrid}>
                <div className={`${styles.vendorCard} ${styles.fullWidthCard}`}>
                  <div className={styles.vendorMetrics}>
                    {auditEvents.slice(0, 12).map((event) => (
                      <div key={event.id} className={styles.vendorMetricItem}>
                        <span>
                          {new Date(event.createdAt).toLocaleString('es-MX')} · {event.action}
                        </span>
                        <strong>{event.actor?.nombre || 'Sistema'}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* PDF Viewer Modal */}
      {showPdfViewer && pdfUrl && (
        <div className={styles.pdfModal} onClick={() => setShowPdfViewer(false)} aria-hidden="true">
          <div ref={pdfModalRef} className={styles.pdfModalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Visor de reporte PDF de ventas">
            <div className={styles.pdfModalHeader}>
              <h3>Reporte de Ventas - {periodLabel}</h3>
              <div className={styles.pdfModalActions}>
                <button type="button" className={styles.pdfDownloadBtn} onClick={handleDownloadPdf}>
                  📥 Descargar
                </button>
                <button type="button" className={styles.pdfCloseBtn} onClick={() => setShowPdfViewer(false)}>
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <div className={styles.pdfViewerContainer}>
              <PDFViewer
                pdfUrl={pdfUrl}
                pdfData={pdfData}
                fileName={`reporte-ventas-${currentPeriod}.pdf`}
                height="600px"
                fillParent
              />
            </div>
          </div>
        </div>
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
  const normalizedData = Array.isArray(data)
    ? data.map((item: any) => ({
        ...item,
        value: Number.isFinite(Number(item?.value)) ? Number(item.value) : 0,
      }))
    : [];
  const maxValue = Math.max(0, ...normalizedData.map((d: any) => d.value));
  return (
    <div className={styles.barChart}>
      {normalizedData.map((item: any, i: number) => (
        <div key={i} className={styles.barItem}>
          <div className={styles.barLabel}>{item.label}</div>
          <div className={styles.barContainer}>
            <progress className={styles.bar} max={Math.max(1, maxValue)} value={item.value} />
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
  const normalizedData = Array.isArray(data)
    ? data.map((item: any) => ({
        ...item,
        value: Number.isFinite(Number(item?.value)) ? Number(item.value) : 0,
      }))
    : [];
  const total = normalizedData.reduce((sum: number, d: any) => sum + d.value, 0);
  let cumulativePercent = 0;

  if (total <= 0) {
    return (
      <div className={styles.pieChart}>
        <svg viewBox="0 0 100 100" className={styles.pieSvg}>
          <circle cx="50" cy="50" r="40" fill="#e9ecef" />
        </svg>
        <div className={styles.pieLegend}>
          {normalizedData.map((item: any, i: number) => (
            <div key={i} className={styles.legendItem}>
              <span
                className={`${styles.legendColor} ${styles[`legendColor${i % 6}`] || ''}`}
              />
              <span className={styles.legendLabel}>{item.label}</span>
              <span className={styles.legendValue}>0%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pieChart}>
      <svg viewBox="0 0 100 100" className={styles.pieSvg}>
        {normalizedData.map((item: any, i: number) => {
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
        {normalizedData.map((item: any, i: number) => (
          <div key={i} className={styles.legendItem}>
            <span
              className={`${styles.legendColor} ${styles[`legendColor${i % 6}`] || ''}`}
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
