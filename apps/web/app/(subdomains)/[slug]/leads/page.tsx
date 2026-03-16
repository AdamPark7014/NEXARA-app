"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import styles from "./page.module.css";

type SalesLead = {
  id: number;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status: string;
  score: number;
  notes?: string | null;
};

export default function VentasLeadsPage() {
  const { user } = useUser();
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    return base.replace(/[/.]+$/, "");
  }, []);

  const fetchLeads = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/ventas/leads`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error("No se pudieron cargar los leads");
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
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
      const res = await fetch(`${apiUrl}/ventas/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("No se pudo crear el lead");
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

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <h2>Nuevo lead</h2>
        <div className={styles.formGrid}>
          <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="Contacto" />
          <input className={styles.input} name="company" value={form.company} onChange={handleChange} placeholder="Empresa" />
          <input className={styles.input} name="email" value={form.email} onChange={handleChange} placeholder="Correo" />
          <input className={styles.input} name="phone" value={form.phone} onChange={handleChange} placeholder="Teléfono" />
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
      </div>

      <div className={styles.list}>
        {loading && <p>cargando...</p>}
        {leads.map((lead) => (
          <div key={lead.id} className={styles.card}>
            <div className={styles.leadRow}>
              <strong>{lead.company || lead.name || "Lead"}</strong>
              <span className={styles.meta}>{lead.status}</span>
            </div>
            <div className={styles.meta}>{lead.email || ""}</div>
            <div className={styles.meta}>{lead.phone || ""}</div>
            <div className={styles.meta}>Score: {lead.score ?? 0}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
