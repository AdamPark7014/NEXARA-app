'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from './UserContext';
import styles from './ProjectCostTracker.module.css';

interface ProjectCosts {
  costProducts: number;
  costViaticos: number;
  costOperativo: number;
  totalCost: number;
  budget: number;
  margin: number;
  marginPercent: number;
  isOverBudget: boolean;
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
  const { token } = useUser();
  const [costs, setCosts] = useState<ProjectCosts | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    costProducts: '0',
    costViaticos: '0',
    costOperativo: '0',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingViaticos, setSyncingViaticos] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadCosts();
  }, [token, projectId]);

  const loadCosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/ventas/proyectos/${projectId}/costos`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load costs');
      }

      const data = await response.json();
      setCosts(data);
      setEditValues({
        costProducts: String(data.costProducts),
        costViaticos: String(data.costViaticos),
        costOperativo: String(data.costOperativo),
      });
      await onCostsUpdated?.();
    } catch (err) {
      setError('Error loading costs: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCosts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/ventas/proyectos/${projectId}/costos`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          costProducts: Number(editValues.costProducts),
          costViaticos: Number(editValues.costViaticos),
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

  const handleSyncViaticos = async () => {
    try {
      setSyncingViaticos(true);
      setError(null);

      const response = await fetch(`/api/ventas/proyectos/${projectId}/sync-viaticos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to sync viaticos');
      }

      const data = await response.json();
      setCosts(data);
      setEditValues({
        costProducts: String(data.costProducts),
        costViaticos: String(data.costViaticos),
        costOperativo: String(data.costOperativo),
      });
      await onCostsUpdated?.();
    } catch (err) {
      setError('Error syncing viaticos: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSyncingViaticos(false);
    }
  };

  const validateBudget = async () => {
    try {
      const response = await fetch(`/api/ventas/proyectos/${projectId}/validar-presupuesto`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to validate budget');
      }

      const data = await response.json();
      alert(data.message);
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
              <div className={styles.costLabel}>Viaticos</div>
              <div className={styles.costValue}>${costs.costViaticos.toFixed(2)}</div>
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
                <div
                  className={`${styles.fill} ${costs.isOverBudget ? styles.overBudget : ''}`}
                  style={{ width: `${Math.min(100, (costs.totalCost / costs.budget) * 100)}%` }}
                >
                  {(costs.totalCost / costs.budget) * 100 > 20 && (
                    <span className={styles.fillText}>
                      {((costs.totalCost / costs.budget) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
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
              onClick={handleSyncViaticos}
              className={styles.syncButton}
              disabled={syncingViaticos}
            >
              {syncingViaticos ? '⏳ Sincronizando...' : '🔄 Sincronizar Viaticos'}
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
              <label>Costo de Viaticos</label>
              <div className={styles.inputWrapper}>
                <span className={styles.prefix}>$</span>
                <input
                  type="number"
                  value={editValues.costViaticos}
                  onChange={(e) =>
                    setEditValues({ ...editValues, costViaticos: e.target.value })
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
                    Number(editValues.costViaticos) +
                    Number(editValues.costOperativo)
                  ).toFixed(2)}
                </strong>
              </div>
              <div
                className={`${styles.row} ${
                  Number(editValues.costProducts) +
                    Number(editValues.costViaticos) +
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
                      Number(editValues.costViaticos) +
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
