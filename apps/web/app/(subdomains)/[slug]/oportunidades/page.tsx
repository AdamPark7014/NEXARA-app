"use client";

import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import { useState } from "react";
import { useUser } from "@/components/UserContext";
import OpportunitiesKanban from "@/components/OpportunitiesKanban";
import styles from "./page.module.css";

type Opportunity = {
  id: number;
  title: string;
  description?: string | null;
  stage: string;
  value: number;
  probability: number;
  expectedCloseDate?: string | null;
  clientName?: string | null;
  notes?: OpportunityNote[];
  evidences?: OpportunityEvidence[];
  quotes?: OpportunityQuote[];
};

type OpportunityNote = {
  id: number;
  message: string;
  createdAt: string;
};

type OpportunityEvidence = {
  id: number;
  fileUrl: string;
  fileName?: string | null;
  kind?: string | null;
};

type OpportunityQuote = {
  id: number;
  cotizacionId?: number | null;
  versionLabel?: string | null;
  pdfUrl?: string | null;
  createdAt: string;
};

export default function VentasOportunidadesPage() {
  const { user } = useUser();
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

  const getAssetUrl = (url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = getApiAssetOrigin().replace(/\/+$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const handleAddNote = async (id: number) => {
    if (!user?.token || !noteDraft.trim()) return;
    
    setLoading(true);
    try {
      await fetch(buildApiUrl(`ventas/oportunidades/${id}/notas`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ message: noteDraft }),
      });
      setNoteDraft("");
      // Fetch updated opportunity if detail view
      if (selectedOpportunity && selectedOpportunity.id === id) {
        const res = await fetch(buildApiUrl(`ventas/oportunidades/${id}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSelectedOpportunity(data);
        }
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
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        expectedCloseDate: form.expectedCloseDate || undefined,
      };
      const res = await fetch(buildApiUrl("ventas/oportunidades"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo crear la oportunidad");
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
      const res = await fetch(buildApiUrl(`ventas/oportunidades/${opportunityId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error("Error al actualizar etapa");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const handleSelectOpportunity = async (opp: Opportunity) => {
    if (!user?.token) return;
    
    // Fetch full opportunity details
    try {
      const res = await fetch(buildApiUrl(`ventas/oportunidades/${opp.id}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedOpportunity(data);
      }
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
              />
              <textarea
                className={styles.input}
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Descripción"
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
