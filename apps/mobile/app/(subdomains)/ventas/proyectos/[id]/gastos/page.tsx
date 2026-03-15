'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/components/UserContext';
import styles from './page.module.css';

interface ProjectExpense {
  projectId: number;
  projectName: string;
  budget: number;
  costs: {
    products: number;
    viaticos: number;
    operativo: number;
    total: number;
  };
  viaticosCount: number;
  margin: number;
  status: string;
}

interface Viatico {
  id: number;
  usuarioId: number;
  montoSolicitado: number;
  motivo?: string;
  estatus: string;
  fechaSolicitud: string;
  User: {
    nombre: string;
    email: string;
  };
}

interface AvailableViatico {
  id: number;
  usuarioId: number;
  montoSolicitado: number;
  motivo?: string;
  estatus: string;
  fechaSolicitud: string;
  usuario?: {
    nombre: string;
  };
  User?: {
    nombre: string;
  };
}

export default function ProjectExpensesPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const projectId = Number(params?.id);

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    return base.replace(/[/.]+$/, '');
  }, []);

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ProjectExpense | null>(null);
  const [viaticos, setViaticos] = useState<Viatico[]>([]);
  const [availableViaticos, setAvailableViaticos] = useState<AvailableViatico[]>([]);
  const [selectedViaticos, setSelectedViaticos] = useState<number[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    if (!user?.token || !projectId) return;
    fetchProjectExpenses();
  }, [projectId, user]);

  const fetchProjectExpenses = async () => {
    try {
      setLoading(true);
      const [expensesRes, viaticosRes] = await Promise.all([
        fetch(`${apiUrl}/ventas/proyectos/${projectId}/expenses`, {
          headers: { Authorization: `Bearer ${user?.token}` },
        }),
        fetch(`${apiUrl}/ventas/proyectos/${projectId}/viaticos`, {
          headers: { Authorization: `Bearer ${user?.token}` },
        }),
      ]);

      if (expensesRes.ok) {
        setExpenses(await expensesRes.json());
      }
      if (viaticosRes.ok) {
        setViaticos(await viaticosRes.json());
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableViaticos = async () => {
    try {
      const res = await fetch(`${apiUrl}/viaticos?projectId=null`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        setAvailableViaticos(await res.json());
      }
    } catch (error) {
      console.error('Error fetching available viaticos:', error);
    }
  };

  const handleAssignViaticos = async () => {
    if (selectedViaticos.length === 0) return;
    try {
      setAssignLoading(true);
      const res = await fetch(`${apiUrl}/ventas/proyectos/${projectId}/viaticos/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ viaticIds: selectedViaticos }),
      });
      if (res.ok) {
        setSelectedViaticos([]);
        setShowAssignModal(false);
        fetchProjectExpenses();
      }
    } catch (error) {
      console.error('Error assigning viaticos:', error);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveViatico = async (viaticId: number) => {
    try {
      const res = await fetch(`${apiUrl}/ventas/proyectos/viaticos/${viaticId}/unassign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        fetchProjectExpenses();
      }
    } catch (error) {
      console.error('Error removing viatico:', error);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Cargando gastos del proyecto...</div>;
  }

  if (!expenses) {
    return <div className={styles.error}>Proyecto no encontrado</div>;
  }

  const costPercentage = (cost: number) => {
    if (expenses.budget === 0) return 0;
    return ((cost / expenses.budget) * 100).toFixed(1);
  };

  const remainingBudget = expenses.budget - expenses.costs.total;
  const remainingPercentage = ((remainingBudget / expenses.budget) * 100).toFixed(1);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{expenses.projectName}</h1>
          <p className={styles.status}>Estado: {expenses.status}</p>
        </div>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ← Volver
        </button>
      </div>

      {/* Budget Overview */}
      <div className={styles.budgetOverview}>
        <div className={styles.budgetTotal}>
          <h2>Presupuesto Total</h2>
          <p className={styles.amount}>${expenses.budget.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>

        <div className={styles.budgetBar}>
          <div className={styles.barContainer}>
            <div
              className={styles.barSegment + ' ' + styles.products}
              style={{ width: `${costPercentage(expenses.costs.products)}%` }}
              title="Productos"
            />
            <div
              className={styles.barSegment + ' ' + styles.viaticos}
              style={{ width: `${costPercentage(expenses.costs.viaticos)}%` }}
              title="Viáticos"
            />
            <div
              className={styles.barSegment + ' ' + styles.operativo}
              style={{ width: `${costPercentage(expenses.costs.operativo)}%` }}
              title="Operativo"
            />
            <div
              className={styles.barSegment + ' ' + styles.remaining}
              style={{ width: `${remainingPercentage}%` }}
              title="Disponible"
            />
          </div>
        </div>
      </div>

      {/* Costs Breakdown */}
      <div className={styles.costsGrid}>
        <div className={styles.costCard}>
          <div className={styles.costHeader}>
            <span className={styles.costIcon}>📦</span>
            <h3>Productos</h3>
          </div>
          <div className={styles.costAmount}>${expenses.costs.products.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          <div className={styles.costPercent}>{costPercentage(expenses.costs.products)}% del presupuesto</div>
        </div>

        <div className={styles.costCard}>
          <div className={styles.costHeader}>
            <span className={styles.costIcon}>✈️</span>
            <h3>Viáticos</h3>
          </div>
          <div className={styles.costAmount}>${expenses.costs.viaticos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          <div className={styles.costPercent}>{costPercentage(expenses.costs.viaticos)}% del presupuesto</div>
          <span className={styles.viaticsBadge}>{expenses.viaticosCount} registros</span>
        </div>

        <div className={styles.costCard}>
          <div className={styles.costHeader}>
            <span className={styles.costIcon}>⚙️</span>
            <h3>Operativo</h3>
          </div>
          <div className={styles.costAmount}>${expenses.costs.operativo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          <div className={styles.costPercent}>{costPercentage(expenses.costs.operativo)}% del presupuesto</div>
        </div>

        <div className={styles.costCard + ' ' + styles.highlight}>
          <div className={styles.costHeader}>
            <span className={styles.costIcon}>💰</span>
            <h3>Margen</h3>
          </div>
          <div className={styles.costAmount + ' ' + (expenses.margin > 0 ? styles.positive : styles.negative)}>
            ${expenses.margin.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <div className={styles.costPercent}>
            {((expenses.margin / expenses.budget) * 100).toFixed(1)}% margen
          </div>
        </div>
      </div>

      {/* Viaticos Section */}
      <div className={styles.viaticosSection}>
        <div className={styles.sectionHeader}>
          <h2>Viáticos Asignados ({viaticos.length})</h2>
          <button
            className={styles.addBtn}
            onClick={() => {
              fetchAvailableViaticos();
              setShowAssignModal(true);
            }}
          >
            + Agregar Viático
          </button>
        </div>

        {viaticos.length === 0 ? (
          <div className={styles.empty}>
            <p>No hay viáticos asignados a este proyecto</p>
          </div>
        ) : (
          <div className={styles.viaticsList}>
            {viaticos.map(viatico => (
              <div key={viatico.id} className={styles.viaticItem}>
                <div className={styles.viaticInfo}>
                  <div className={styles.viaticUser}>{viatico.User.nombre}</div>
                  <div className={styles.viaticDetail}>
                    {viatico.motivo && <span className={styles.motivo}>{viatico.motivo}</span>}
                    <span className={styles.date}>
                      {new Date(viatico.fechaSolicitud).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                </div>
                <div className={styles.viaticAmount}>
                  ${viatico.montoSolicitado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
                <div className={styles.viaticStatus}>
                  <span className={styles.badge + ' ' + styles[`status${viatico.estatus}`]}>
                    {viatico.estatus}
                  </span>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={() => {
                    if (confirm('¿Remover este viático del proyecto?')) {
                      handleRemoveViatico(viatico.id);
                    }
                  }}
                  title="Remover viático"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Agregar Viáticos al Proyecto</h3>
              <button className={styles.closeBtn} onClick={() => setShowAssignModal(false)}>
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {availableViaticos.length === 0 ? (
                <p className={styles.noData}>No hay viáticos disponibles para asignar</p>
              ) : (
                <div className={styles.checkboxList}>
                  {availableViaticos.map(v => (
                    <label key={v.id} className={styles.checkboxItem}>
                      <input
                        type="checkbox"
                        checked={selectedViaticos.includes(v.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedViaticos([...selectedViaticos, v.id]);
                          } else {
                            setSelectedViaticos(selectedViaticos.filter(id => id !== v.id));
                          }
                        }}
                      />
                      <span className={styles.checkboxLabel}>
                        <strong>{v.usuario?.nombre || v.User?.nombre || 'Sin usuario'}</strong> -{' '}
                        ${v.montoSolicitado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        {v.motivo && <em> • {v.motivo}</em>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowAssignModal(false)}>
                Cancelar
              </button>
              <button
                className={styles.confirmBtn}
                onClick={handleAssignViaticos}
                disabled={selectedViaticos.length === 0 || assignLoading}
              >
                {assignLoading ? 'Asignando...' : `Asignar (${selectedViaticos.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
