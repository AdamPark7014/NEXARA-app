'use client';

import { toast } from "@/components/Toast";
import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './ProjectCostTracker.module.css';
import { Socket } from 'socket.io-client';
import { buildApiUrl, getSocketBaseUrl } from '@/lib/api-base';
import { createRealtimeSocket } from '@/lib/realtime-socket';

interface ProjectCosts {
  costProducts: number;
  costViáticos: number;
  costOperativo: number;
  totalCost: number;
  budget: number;
  margin: number;
  marginPercent: number;
  isOverBudget: boolean;
  actual?: {
    hasOperationalLink: boolean;
    operationalProjectId?: number | null;
    activityCount: number;
    completedActivities: number;
    actualViaticos: number;
    actualOperativo: number;
    actualTotal: number;
    actualTotalWithProducts: number;
    marginActual: number;
    marginActualPercent: number;
    isOverBudgetActual: boolean;
  };
}

interface ProjectCostTrackerProps {
  projectId: number;
  budget: number;
  onCostsUpdated?: () => void | Promise<void>;
}

export default function ProjectCostTracker({
  projectId,
  budget,
  onCostsUpdated,
}: ProjectCostTrackerProps) {
  const { user } = useUser();
  const token = user?.token;
  const [costs, setCosts] = useState<ProjectCosts | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    costProducts: '0',
    costViáticos: '0',
    costOperativo: '0',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingViáticos, setSyncingViáticos] = useState(false);
  const [syncingActual, setSyncingActual] = useState(false);

  const apiFetch = (path: string, init?: RequestInit) =>
    fetch(buildApiUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });

  const loadCosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`ventas/proyectos/${projectId}/costos`);

      if (!response.ok) {
        throw new Error('Failed to load costs');
      }

      const data = await response.json();
      setCosts(data);
      setEditValues({
        costProducts: String(data.costProducts),
        costViáticos: String(data.costViáticos),
        costOperativo: String(data.costOperativo),
      });
      await onCostsUpdated?.();
    } catch (err) {
      setError('Error loading costs: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setLoading(false);
    }
  }, [token, projectId, onCostsUpdated]);

  useEffect(() => {
    if (!token) return;
    loadCosts();
  }, [token, loadCosts]);

  useEffect(() => {
    if (!token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        loadCosts();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ProyectoVenta', 'Project', 'Viatico', 'CotizacionVenta'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [token, loadCosts]);

  const handleSaveCosts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`ventas/proyectos/${projectId}/costos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          costProducts: Number(editValues.costProducts),
          costViáticos: Number(editValues.costViáticos),
          costOperativo: Number(editValues.costOperativo),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update costs');
      }

      const data = await response.json();
      setCosts(data);
      setIsEditing(false);
      await onCostsUpdated?.();
    } catch (err) {
      setError('Error saving costs: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setLoading(false);
    }
  };

  const handleSyncViáticos = async () => {
    try {
      setSyncingViáticos(true);
      setError(null);

      const response = await apiFetch(`ventas/proyectos/${projectId}/sync-viaticos`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync viaticos');
      }

      const data = await response.json();
      setCosts(data);
      setEditValues({
        costProducts: String(data.costProducts),
        costViáticos: String(data.costViáticos),
        costOperativo: String(data.costOperativo),
      });
      await onCostsUpdated?.();
    } catch (err) {
      setError('Error syncing viaticos: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSyncingViáticos(false);
    }
  };

  const handleSyncActualCosts = async () => {
    try {
      setSyncingActual(true);
      setError(null);
      const response = await apiFetch(`ventas/proyectos/${projectId}/sync-actual-costs`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to sync actual costs');
      const data = await response.json();
      setCosts(data);
      setEditValues({
        costProducts: String(data.costProducts),
        costViáticos: String(data.costViáticos),
        costOperativo: String(data.costOperativo),
      });
      await onCostsUpdated?.();
    } catch (err) {
      setError('Error syncing actual costs: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSyncingActual(false);
    }
  };

  const validateBudget = async () => {
    try {
      const response = await apiFetch(`ventas/proyectos/${projectId}/validar-presupuesto`);

      if (!response.ok) {
        throw new Error('Failed to validate budget');
      }

      const data = await response.json();
      toast.error(data.message ?? "Error del servidor");
    } catch (err) {
      setError('Error validating budget: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  if (loading && !costs) {
    return (
      <div className={styles.container}>
        <div className={styles.spinner}>Cargando costos...</div>
      </div>
    );
  }

  if (!costs) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>Error al cargar costos del proyecto</div>
      </div>
    );
  }

  const budgetUsagePercentage = costs.budget > 0 ? Math.min(100, (costs.totalCost / costs.budget) * 100) : 0;
  const budgetUsageRaw = costs.budget > 0 ? (costs.totalCost / costs.budget) * 100 : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>💰 Gestión de Costos</h3>
        <div className={styles.description}>
          Controla tu presupuesto y márgenes en tiempo real
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {!isEditing ? (
        <div className={styles.displayMode}>
          {/* COSTOS */}
          <div className={styles.costsGrid}>
            <div className={styles.costCard}>
              <div className={styles.costLabel}>Productos</div>
              <div className={styles.costValue}>${costs.costProducts.toFixed(2)}</div>
            </div>
            <div className={styles.costCard}>
              <div className={styles.costLabel}>Viáticos</div>
              <div className={styles.costValue}>${costs.costViáticos.toFixed(2)}</div>
            </div>
            <div className={styles.costCard}>
              <div className={styles.costLabel}>Operativo</div>
              <div className={styles.costValue}>${costs.costOperativo.toFixed(2)}</div>
            </div>
            <div className={styles.costCard + ' ' + styles.totalCost}>
              <div className={styles.costLabel}>Total Costos</div>
              <div className={styles.costValue}>${costs.totalCost.toFixed(2)}</div>
            </div>
          </div>

          {/* PRESUPUESTO Y MARGEN */}
          <div className={styles.budgetSection}>
            <div className={styles.budgetBar}>
              <div className={styles.barLabel}>
                <span>Presupuesto Disponible</span>
                <span>${costs.budget.toFixed(2)}</span>
              </div>
              <div className={styles.bar}>
                <progress
                  className={`${styles.progressBar} ${costs.isOverBudget ? styles.overBudget : ''}`}
                  value={budgetUsagePercentage}
                  max={100}
                />
                {budgetUsageRaw > 20 && (
                  <span className={styles.fillText}>
                    {budgetUsageRaw.toFixed(0)}%
                  </span>
                )}
              </div>
              <div className={styles.barCaption}>
                Usado: ${costs.totalCost.toFixed(2)} de ${costs.budget.toFixed(2)}
              </div>
            </div>

            <div className={styles.marginBox + (costs.isOverBudget ? ' ' + styles.marginBoxWarning : ' ' + styles.marginBoxSuccess)}>
              <div className={styles.marginLabel}>Margen</div>
              <div className={styles.marginValue}>
                ${costs.margin.toFixed(2)}
              </div>
              <div className={styles.marginPercent}>
                {costs.marginPercent.toFixed(1)}% del presupuesto
              </div>
              {costs.isOverBudget && (
                <div className={styles.overBudgetWarning}>
                  ⚠️ ¡Exceso de presupuesto!
                </div>
              )}
            </div>
          </div>

          {costs.actual?.hasOperationalLink && (
            <div className={styles.budgetSection} style={{ marginTop: 12 }}>
              <h4 style={{ margin: '0 0 8px' }}>📡 Costos reales (operación / campo)</h4>
              <div className={styles.costsGrid}>
                <div className={styles.costCard}>
                  <div className={styles.costLabel}>Viáticos reales</div>
                  <div className={styles.costValue}>${costs.actual.actualViaticos.toFixed(2)}</div>
                </div>
                <div className={styles.costCard}>
                  <div className={styles.costLabel}>Gastos OT</div>
                  <div className={styles.costValue}>${costs.actual.actualOperativo.toFixed(2)}</div>
                </div>
                <div className={styles.costCard}>
                  <div className={styles.costLabel}>OT completadas</div>
                  <div className={styles.costValue}>
                    {costs.actual.completedActivities}/{costs.actual.activityCount}
                  </div>
                </div>
                <div className={styles.costCard + ' ' + styles.totalCost}>
                  <div className={styles.costLabel}>Total real</div>
                  <div className={styles.costValue}>${costs.actual.actualTotalWithProducts.toFixed(2)}</div>
                </div>
              </div>
              <div className={styles.marginBox + (costs.actual.isOverBudgetActual ? ' ' + styles.marginBoxWarning : ' ' + styles.marginBoxSuccess)} style={{ marginTop: 10 }}>
                <div className={styles.marginLabel}>Margen real</div>
                <div className={styles.marginValue}>${costs.actual.marginActual.toFixed(2)}</div>
                <div className={styles.marginPercent}>{costs.actual.marginActualPercent.toFixed(1)}% del presupuesto</div>
              </div>
            </div>
          )}

          {/* ACTIONS */}
          <div className={styles.actions}>
            <button
              onClick={() => {
                setIsEditing(true);
                setError(null);
              }}
              className={styles.editButton}
            >
              ✏️ Editar Costos
            </button>
            <button
              onClick={handleSyncViáticos}
              className={styles.syncButton}
              disabled={syncingViáticos}
            >
              {syncingViáticos ? '⏳ Sincronizando...' : '🔄 Sincronizar Viáticos'}
            </button>
            <button
              onClick={handleSyncActualCosts}
              className={styles.syncButton}
              disabled={syncingActual || !costs.actual?.hasOperationalLink}
            >
              {syncingActual ? '⏳ Sincronizando...' : '📡 Sincronizar costos reales'}
            </button>
            <button
              onClick={validateBudget}
              className={styles.validateButton}
            >
              ✓ Validar Presupuesto
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.editMode}>
          <div className={styles.editForm}>
            <div className={styles.formGroup}>
              <label>Costo de Productos</label>
              <div className={styles.inputWrapper}>
                <span className={styles.prefix}>$</span>
                <input
                  type="number"
                  value={editValues.costProducts}
                  onChange={(e) =>
                    setEditValues({ ...editValues, costProducts: e.target.value })
                  }
                  min="0"
                  disabled={loading}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Costo de Viáticos</label>
              <div className={styles.inputWrapper}>
                <span className={styles.prefix}>$</span>
                <input
                  type="number"
                  value={editValues.costViáticos}
                  onChange={(e) =>
                    setEditValues({ ...editValues, costViáticos: e.target.value })
                  }
                  min="0"
                  disabled={loading}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Costo Operativo</label>
              <div className={styles.inputWrapper}>
                <span className={styles.prefix}>$</span>
                <input
                  type="number"
                  value={editValues.costOperativo}
                  onChange={(e) =>
                    setEditValues({ ...editValues, costOperativo: e.target.value })
                  }
                  min="0"
                  disabled={loading}
                  className={styles.input}
                />
              </div>
            </div>

            {/* PREVIEW MARGEN */}
            <div className={styles.marginPreview}>
              <div className={styles.row}>
                <span>Presupuesto:</span>
                <strong>${budget.toFixed(2)}</strong>
              </div>
              <div className={styles.row}>
                <span>Total Costos:</span>
                <strong>
                  ${(
                    Number(editValues.costProducts) +
                    Number(editValues.costViáticos) +
                    Number(editValues.costOperativo)
                  ).toFixed(2)}
                </strong>
              </div>
              <div
                className={`${styles.row} ${
                  Number(editValues.costProducts) +
                    Number(editValues.costViáticos) +
                    Number(editValues.costOperativo) >
                  budget
                    ? styles.rowWarning
                    : styles.rowSuccess
                }`}
              >
                <span>Margen Estimado:</span>
                <strong>
                  ${(
                    budget -
                    (Number(editValues.costProducts) +
                      Number(editValues.costViáticos) +
                      Number(editValues.costOperativo))
                  ).toFixed(2)}
                </strong>
              </div>
            </div>
          </div>

          <div className={styles.editActions}>
            <button
              onClick={handleSaveCosts}
              disabled={loading}
              className={styles.saveButton}
            >
              {loading ? '💾 Guardando...' : '💾 Guardar Costos'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                loadCosts();
              }}
              disabled={loading}
              className={styles.cancelButton}
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
