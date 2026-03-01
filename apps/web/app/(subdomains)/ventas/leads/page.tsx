"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { createSalesLead, listSalesLeads, updateSalesLead, type SalesLead } from "@/lib/sales-api";
import styles from "./page.module.css";

type LeadFilter = "PENDING" | "NURTURING" | "LOST" | "CONVERTED" | "ALL";

const LEAD_FILTER_LABELS: Record<LeadFilter, string> = {
  PENDING: "Activos",
  NURTURING: "Archivados",
  LOST: "Descartados",
  CONVERTED: "Convertidos",
  ALL: "Todos",
};

const matchesFilter = (lead: SalesLead, filter: LeadFilter) => {
  if (filter === "ALL") return true;
  if (filter === "PENDING") {
    return lead.status === "NEW" || lead.status === "QUALIFIED";
  }
  return lead.status === filter;
};

export default function VentasLeadsPage() {
  const { user } = useUser();
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<LeadFilter>("PENDING");
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    source: "",
    status: "NEW",
    score: 0,
    notes: "",
  });

  const fetchLeads = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSalesLeads(user.token);
      setLeads(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [user?.token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === "score" ? Number(value) : value }));
  };

  const handleCreate = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      await createSalesLead(user.token, form);
      setForm({
        name: "",
        company: "",
        email: "",
        phone: "",
        source: "",
        status: "NEW",
        score: 0,
        notes: "",
      });
      await fetchLeads();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleLeadStatus = async (leadId: number, status: "NURTURING" | "LOST") => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await updateSalesLead(user.token, leadId, { status });
      setInfo(status === "NURTURING" ? "Lead archivado en seguimiento" : "Lead descartado correctamente");
      await fetchLeads();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const visibleLeads = leads.filter((lead) => matchesFilter(lead, filter));

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <h2>Nuevo lead</h2>
        <div className={styles.formGrid}>
          <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="Contacto" />
          <input className={styles.input} name="company" value={form.company} onChange={handleChange} placeholder="Empresa" />
          <input className={styles.input} name="email" value={form.email} onChange={handleChange} placeholder="Correo" />
          <input className={styles.input} name="phone" value={form.phone} onChange={handleChange} placeholder="Telefono" />
          <input className={styles.input} name="source" value={form.source} onChange={handleChange} placeholder="Origen" />
          <select className={styles.input} name="status" value={form.status} onChange={handleChange}>
            <option value="NEW">Nuevo</option>
            <option value="QUALIFIED">Calificado</option>
            <option value="NURTURING">Seguimiento</option>
            <option value="LOST">Perdido</option>
            <option value="CONVERTED">Convertido</option>
          </select>
          <input className={styles.input} name="score" value={form.score} onChange={handleChange} placeholder="Score" type="number" />
          <textarea className={styles.input} name="notes" value={form.notes} onChange={handleChange} placeholder="Notas" rows={2} />
        </div>
        <button className={styles.primaryButton} type="button" onClick={handleCreate} disabled={loading}>Crear lead</button>
        {error && <p className={styles.error}>{error}</p>}
        {info && <p className={styles.info}>{info}</p>}
      </div>

      <div className={styles.list}>
        <div className={styles.filters}>
          {(Object.keys(LEAD_FILTER_LABELS) as LeadFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? styles.filterButtonActive : styles.filterButton}
              onClick={() => setFilter(value)}
            >
              {LEAD_FILTER_LABELS[value]}
            </button>
          ))}
        </div>
        {loading && <p>cargando...</p>}
        {!loading && visibleLeads.length === 0 && <p className={styles.meta}>No hay leads en este filtro.</p>}
        {visibleLeads.map((lead) => (
          <div key={lead.id} className={styles.card}>
            <div className={styles.leadRow}>
              <strong>{lead.company || lead.name || "Lead"}</strong>
              <span className={styles.meta}>{lead.status}</span>
            </div>
            <div className={styles.meta}>{lead.email || ""}</div>
            <div className={styles.meta}>{lead.phone || ""}</div>
            <div className={styles.meta}>Score: {lead.score ?? 0}</div>
            <div className={styles.actionsRow}>
              <button
                className={styles.actionButton}
                type="button"
                onClick={() => handleLeadStatus(lead.id, "NURTURING")}
                disabled={loading || lead.status === "NURTURING"}
              >
                Archivar
              </button>
              <button
                className={styles.actionButton}
                type="button"
                onClick={() => handleLeadStatus(lead.id, "LOST")}
                disabled={loading || lead.status === "LOST"}
              >
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
