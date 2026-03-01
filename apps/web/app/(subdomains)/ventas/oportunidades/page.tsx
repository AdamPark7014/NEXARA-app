"use client";

import { useState } from "react";
import { useUser } from "@/components/UserContext";
import OpportunitiesKanban from "@/components/OpportunitiesKanban";
import { getApiBase } from "@/lib/api-base";
import {
  addSalesOpportunityNote,
  createSalesOpportunity,
  getSalesOpportunity,
  updateSalesOpportunityStage,
  type SalesOpportunity,
  type SalesOpportunityEvidence,
  type SalesOpportunityNote,
  type SalesOpportunityQuote,
} from "@/lib/sales-api";
import styles from "./page.module.css";

type Opportunity = SalesOpportunity;
type OpportunityNote = SalesOpportunityNote;
type OpportunityEvidence = SalesOpportunityEvidence;
type OpportunityQuote = SalesOpportunityQuote;

export default function VentasOportunidadesPage() {
  const { user } = useUser();
  const apiUrl = getApiBase();
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    stage: "DISCOVERY",
    value: 0,
    probability: 0,
    expectedCloseDate: "",
  });
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  const handleAddNote = async (id: number) => {
    if (!user?.token || !noteDraft.trim()) return;
    
    setLoading(true);
    try {
      await addSalesOpportunityNote(user.token, id, noteDraft);
      setNoteDraft("");
      // Fetch updated opportunity if detail view
      if (selectedOpportunity && selectedOpportunity.id === id) {
        const data = await getSalesOpportunity(user.token, id);
        setSelectedOpportunity(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar nota");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpportunity = async () => {
    if (!user?.token) return;
    if (!form.title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 10) {
      setError("Debes definir la próxima acción con al menos 10 caracteres");
      return;
    }
    if (!form.expectedCloseDate) {
      setError("Debes definir la fecha de próxima acción");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        expectedCloseDate: form.expectedCloseDate || undefined,
      };
      await createSalesOpportunity(user.token, payload);
      setForm({ title: "", description: "", stage: "DISCOVERY", value: 0, probability: 0, expectedCloseDate: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "value" || name === "probability" ? Number(value) : value,
    }));
  };

  const handleUpdateStage = async (opportunityId: number, newStage: string) => {
    if (!user?.token) return;
    try {
      await updateSalesOpportunityStage(user.token, opportunityId, newStage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const handleSelectOpportunity = async (opp: Opportunity) => {
    if (!user?.token) return;
    
    // Fetch full opportunity details
    try {
      const data = await getSalesOpportunity(user.token, opp.id);
      setSelectedOpportunity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar detalles");
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Oportunidades</h1>
          <p className={styles.subtitle}>Manage your sales pipeline and opportunities</p>
        </div>

        <div className={styles.controls}>
          <button
            className={`${styles.viewBtn} ${viewMode === 'kanban' ? styles.active : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            📊 Kanban
          </button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'table' ? styles.active : ''}`}
            onClick={() => setViewMode('table')}
          >
            📋 Tabla
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <OpportunitiesKanban 
          apiUrl={apiUrl}
          onUpdateStage={handleUpdateStage}
          onSelectOpportunity={handleSelectOpportunity}
        />
      ) : (
        <div className={styles.tableView}>
          <div className={styles.createCard}>
            <h2>Nueva oportunidad</h2>
            <div className={styles.formGrid}>
              <input
                className={styles.input}
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Título"
              />
              <select className={styles.input} name="stage" value={form.stage} onChange={handleChange}>
                <option value="DISCOVERY">🔍 Discovery</option>
                <option value="QUALIFICATION">✅ Qualification</option>
                <option value="PROPOSAL">📋 Propuesta</option>
                <option value="NEGOTIATION">💬 Negociación</option>
                <option value="CLOSING">🎯 Cierre</option>
                <option value="WON">🏆 Ganada</option>
                <option value="LOST">❌ Perdida</option>
              </select>
              <input
                className={styles.input}
                name="value"
                value={form.value}
                onChange={handleChange}
                placeholder="Valor"
                type="number"
              />
              <input
                className={styles.input}
                name="probability"
                value={form.probability}
                onChange={handleChange}
                placeholder="Probabilidad %"
                type="number"
                max="100"
                min="0"
              />
              <input
                className={styles.input}
                name="expectedCloseDate"
                value={form.expectedCloseDate}
                onChange={handleChange}
                type="date"
                title="Fecha de próxima acción"
              />
              <textarea
                className={styles.input}
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Próxima acción obligatoria (ej: llamar al cliente para validar alcance)"
                rows={2}
              />
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={handleCreateOpportunity}
              disabled={loading}
            >
              {loading ? "Creando..." : "Crear Oportunidad"}
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </div>

          {selectedOpportunity && (
            <div className={styles.detailCard}>
              <button
                className={styles.closeBtn}
                onClick={() => setSelectedOpportunity(null)}
              >
                ✕
              </button>

              <h2>{selectedOpportunity.title}</h2>
              <p className={styles.meta}>Etapa: <strong>{selectedOpportunity.stage}</strong></p>
              <p className={styles.meta}>Valor: <strong>${selectedOpportunity.value.toLocaleString('es-MX')}</strong></p>
              <p className={styles.meta}>Probabilidad: <strong>{selectedOpportunity.probability}%</strong></p>
              <p className={styles.meta}>
                Próxima acción: <strong>{selectedOpportunity.expectedCloseDate ? new Date(selectedOpportunity.expectedCloseDate).toLocaleDateString('es-MX') : 'No definida'}</strong>
              </p>
              
              {selectedOpportunity.description && (
                <p className={styles.description}>{selectedOpportunity.description}</p>
              )}

              <div className={styles.section}>
                <h4>Notas</h4>
                {selectedOpportunity.notes?.map((note) => (
                  <div key={note.id} className={styles.noteItem}>
                    <p>{note.message}</p>
                    <small>{new Date(note.createdAt).toLocaleDateString('es-MX')}</small>
                  </div>
                ))}

                <div className={styles.noteInput}>
                  <textarea
                    className={styles.input}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Agregar nota..."
                    rows={2}
                  />
                  <button
                    className={styles.smallButton}
                    onClick={() => handleAddNote(selectedOpportunity.id)}
                    disabled={loading}
                  >
                    Guardar nota
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
