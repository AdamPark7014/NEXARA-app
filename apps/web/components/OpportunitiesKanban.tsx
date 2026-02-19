import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './OpportunitiesKanban.module.css';

interface KanbanOpportunity {
  id: number;
  title: string;
  description?: string;
  stage: string;
  value: number;
  probability: number;
  expectedCloseDate?: string;
  clientId?: number;
  clientName?: string;
}

interface OpportunitiesKanbanProps {
  apiUrl: string;
  onUpdateStage?: (opportunityId: number, newStage: string) => Promise<void>;
  onSelectOpportunity?: (opportunity: KanbanOpportunity) => void;
}

const STAGES = [
  { id: 'DISCOVERY', label: '🔍 Descubrimiento', color: '#6c757d' },
  { id: 'QUALIFICATION', label: '✅ Calificación', color: '#0dcaf0' },
  { id: 'PROPOSAL', label: '📋 Propuesta', color: '#0d6efd' },
  { id: 'NEGOTIATION', label: '💬 Negociación', color: '#ffc107' },
  { id: 'CLOSING', label: '🎯 Cierre', color: '#198754' },
  { id: 'WON', label: '🏆 Ganada', color: '#20c997' },
  { id: 'LOST', label: '❌ Perdida', color: '#dc3545' },
];

export default function OpportunitiesKanban({
  apiUrl,
  onUpdateStage,
  onSelectOpportunity,
}: OpportunitiesKanbanProps) {
  const { user } = useUser();
  const [opportunities, setOpportunities] = useState<{ [key: string]: KanbanOpportunity[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedOpportunity, setDraggedOpportunity] = useState<{
    opportunity: KanbanOpportunity;
    sourceStage: string;
  } | null>(null);

  // Initialize stage columns
  useEffect(() => {
    const initialStages: { [key: string]: KanbanOpportunity[] } = {};
    STAGES.forEach((stage) => {
      initialStages[stage.id] = [];
    });
    setOpportunities(initialStages);
  }, []);

  // Fetch opportunities
  const fetchOpportunities = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/ventas/oportunidades`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error('Error al cargar oportunidades');
      const data = await res.json();

      const organized: { [key: string]: KanbanOpportunity[] } = {};
      STAGES.forEach((stage) => {
        organized[stage.id] = [];
      });

      (Array.isArray(data) ? data : []).forEach((opp: any) => {
        const stage = opp.stage || 'DISCOVERY';
        if (!organized[stage]) {
          organized[stage] = [];
        }
        organized[stage].push(opp);
      });

      setOpportunities(organized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [user?.token, apiUrl]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleDragStart = (e: React.DragEvent, opp: KanbanOpportunity, stage: string) => {
    setDraggedOpportunity({ opportunity: opp, sourceStage: stage });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnStage = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (!draggedOpportunity) return;

    const { opportunity, sourceStage } = draggedOpportunity;

    if (sourceStage === targetStage) {
      setDraggedOpportunity(null);
      return;
    }

    try {
      if (onUpdateStage) {
        await onUpdateStage(opportunity.id, targetStage);
      } else {
        // Default API call
        const res = await fetch(
          `${apiUrl}/ventas/oportunidades/${opportunity.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user?.token}`,
            },
            body: JSON.stringify({ stage: targetStage }),
          }
        );
        if (!res.ok) throw new Error('Error al actualizar etapa');
      }

      // Update local state
      setOpportunities((prev) => {
        const newState = { ...prev };
        newState[sourceStage] = newState[sourceStage].filter((o) => o.id !== opportunity.id);
        if (!newState[targetStage]) newState[targetStage] = [];
        newState[targetStage].push({ ...opportunity, stage: targetStage });
        return newState;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    }

    setDraggedOpportunity(null);
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(value || 0);

  const getTotalByStage = (stage: string) =>
    opportunities[stage]?.reduce((sum, opp) => sum + (opp.value || 0), 0) || 0;

  if (loading) return <div className={styles.loading}>Cargando oportunidades...</div>;

  return (
    <div className={styles.kanbanContainer}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.board}>
        {STAGES.map((stage) => (
          <div
            key={stage.id}
            className={styles.column}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnStage(e, stage.id)}
          >
            <div className={styles.columnHeader} style={{ borderColor: stage.color }}>
              <h3 className={styles.columnTitle}>{stage.label}</h3>
              <div className={styles.columnMeta}>
                <span className={styles.cardCount}>{opportunities[stage.id]?.length || 0}</span>
                <span className={styles.columnTotal}>{formatMoney(getTotalByStage(stage.id))}</span>
              </div>
            </div>

            <div className={styles.columnCards}>
              {(opportunities[stage.id] || []).map((opp) => (
                <div
                  key={opp.id}
                  className={styles.card}
                  draggable
                  onDragStart={(e) => handleDragStart(e, opp, stage.id)}
                  onClick={() => onSelectOpportunity?.(opp)}
                  style={{ borderLeftColor: stage.color }}
                >
                  <div className={styles.cardHeader}>
                    <h4 className={styles.cardTitle}>{opp.title}</h4>
                    <span className={styles.probability}>{opp.probability}%</span>
                  </div>

                  {opp.description && <p className={styles.cardDesc}>{opp.description}</p>}

                  <div className={styles.cardFooter}>
                    <strong className={styles.cardValue}>{formatMoney(opp.value)}</strong>
                    {opp.expectedCloseDate && (
                      <span className={styles.cardDate}>
                        {new Date(opp.expectedCloseDate).toLocaleDateString('es-MX')}
                      </span>
                    )}
                  </div>

                  {opp.clientName && <p className={styles.cardClient}>👤 {opp.clientName}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span>Total Pipeline:</span>
          <strong>
            {formatMoney(
              STAGES.reduce((sum, stage) => sum + getTotalByStage(stage.id), 0)
            )}
          </strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Oportunidades:</span>
          <strong>{Object.values(opportunities).flat().length}</strong>
        </div>
      </div>
    </div>
  );
}
