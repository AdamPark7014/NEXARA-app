"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import ProjectCostTracker from "@/components/ProjectCostTracker";
import styles from "./page.module.css";

type SalesProject = {
  id: number;
  name: string;
  budget: number;
  costProducts: number;
  costViaticos: number;
  costOperativo: number;
  margin: number;
  status: string;
  opportunity?: { id: number; title: string } | null;
};

type SalesProjectOrder = {
  id: number;
  orderId: string;
  orderPdfUrl: string;
  status: string;
  createdAt: string;
};

export default function VentasProyectosPage() {
  const { user } = useUser();
  const router = useRouter();
  const [projects, setProjects] = useState<SalesProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closeModal, setCloseModal] = useState<number | null>(null);
  const [orders, setOrders] = useState<{ [key: number]: SalesProjectOrder }>({});
  const [expandedCostTracker, setExpandedCostTracker] = useState<number | null>(null);
  const [form, setForm] = useState({
    opportunityId: "",
    name: "",
    budget: 0,
    costProducts: 0,
    costViaticos: 0,
    costOperativo: 0,
    status: "PLANNED",
  });

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    return base.replace(/[/.]+$/, "");
  }, []);

  const fetchProjects = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/ventas/proyectos`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error("No se pudieron cargar los proyectos");
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);

      // Fetch orders for each project
      const newOrders: { [key: number]: SalesProjectOrder } = {};
      for (const project of data) {
        try {
          const orderRes = await fetch(`${apiUrl}/ventas/proyectos/${project.id}/orden`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (orderRes.ok) {
            const order = await orderRes.json();
            if (order && order.id) {
              newOrders[project.id] = order;
            }
          }
        } catch (e) {
          // Order not found, it's okay
        }
      }
      setOrders(newOrders);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user?.token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "opportunityId" ? value : name.includes("cost") || name === "budget" ? Number(value) : value,
    }));
  };

  const handleCreate = async () => {
    if (!user?.token) return;
    if (!form.opportunityId || !form.name.trim()) {
      setError("Oportunidad y nombre son obligatorios");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        opportunityId: Number(form.opportunityId),
        name: form.name,
        budget: form.budget,
        costProducts: form.costProducts,
        costViaticos: form.costViaticos,
        costOperativo: form.costOperativo,
        status: form.status,
      };
      const res = await fetch(`${apiUrl}/ventas/proyectos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo crear el proyecto");
      setForm({
        opportunityId: "",
        name: "",
        budget: 0,
        costProducts: 0,
        costViaticos: 0,
        costOperativo: 0,
        status: "PLANNED",
      });
      await fetchProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseProject = async (projectId: number) => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/ventas/proyectos/${projectId}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      });
      if (!res.ok) throw new Error("No se pudo cerrar el proyecto");
      const order = await res.json();
      setOrders((prev) => ({ ...prev, [projectId]: order }));
      await fetchProjects();
      setCloseModal(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadOrder = async (projectId: number) => {
    const order = orders[projectId];
    if (!order?.orderPdfUrl) {
      setError("No hay orden disponible para descargar");
      return;
    }
    try {
      const link = document.createElement("a");
      link.href = `${apiUrl}${order.orderPdfUrl}`;
      link.download = `orden-${order.orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError("Error al descargar el archivo");
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <h2>Nuevo proyecto</h2>
        <div className={styles.formGrid}>
          <input className={styles.input} name="opportunityId" value={form.opportunityId} onChange={handleChange} placeholder="ID oportunidad" />
          <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="Nombre del proyecto" />
          <input className={styles.input} name="budget" value={form.budget} onChange={handleChange} type="number" placeholder="Presupuesto" />
          <input className={styles.input} name="costProducts" value={form.costProducts} onChange={handleChange} type="number" placeholder="Costo producto" />
          <input className={styles.input} name="costViaticos" value={form.costViaticos} onChange={handleChange} type="number" placeholder="Costo viaticos" />
          <input className={styles.input} name="costOperativo" value={form.costOperativo} onChange={handleChange} type="number" placeholder="Costo operativo" />
          <select className={styles.input} name="status" value={form.status} onChange={handleChange}>
            <option value="PLANNED">Planeado</option>
            <option value="IN_PROGRESS">En curso</option>
            <option value="CLOSED">Cerrado</option>
            <option value="ON_HOLD">Pausado</option>
          </select>
        </div>
        <button className={styles.primaryButton} type="button" onClick={handleCreate} disabled={loading}>Crear proyecto</button>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.list}>
        {loading && <p>cargando...</p>}
        {projects.map((project) => (
          <article key={project.id} className={styles.card}>
            <div onClick={() => setExpandedCostTracker(expandedCostTracker === project.id ? null : project.id)} style={{ cursor: "pointer" }}>
              <h3>{project.name}</h3>
              <div className={styles.meta}>Oportunidad: {project.opportunity?.title || project.opportunity?.id}</div>
              <div className={styles.meta}>Presupuesto: ${project.budget.toLocaleString("es-MX")}</div>
              <div className={styles.meta}>Margen: ${project.margin.toLocaleString("es-MX")}</div>
              <div className={styles.meta}>Estado: {project.status}</div>
            </div>

            {/* Cost Tracker expandible */}
            {expandedCostTracker === project.id && (
              <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid #eee" }}>
                <ProjectCostTracker projectId={project.id} budget={project.budget} onCostsUpdated={fetchProjects} />
              </div>
            )}

            <div className={styles.actions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setExpandedCostTracker(expandedCostTracker === project.id ? null : project.id)}
              >
                {expandedCostTracker === project.id ? "🔽 Ocultar costos" : "🔼 Ver costos"}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => router.push(`/panel/ventas/proyectos/${project.id}/gastos`)}
              >
                Ver gastos
              </button>
              {project.status !== "CLOSED" && !orders[project.id] && (
                <button
                  className={styles.secondaryButton}
                  onClick={() => setCloseModal(project.id)}
                  disabled={loading}
                >
                  Cerrar proyecto
                </button>
              )}
              {orders[project.id] && (
                <button
                  className={styles.primaryButton}
                  onClick={() => handleDownloadOrder(project.id)}
                >
                  Descargar orden
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {closeModal !== null && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Cerrar proyecto</h3>
            <p>¿Está seguro de que desea cerrar este proyecto? Se generará una orden de compra automáticamente.</p>
            <div className={styles.modalActions}>
              <button className={styles.primaryButton} onClick={() => handleCloseProject(closeModal)} disabled={loading}>
                Confirmar closure
              </button>
              <button className={styles.ghostButton} onClick={() => setCloseModal(null)} disabled={loading}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
