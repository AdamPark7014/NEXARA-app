"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import ProjectCostTracker from "@/components/ProjectCostTracker";
import { getSalesScope } from "@/lib/sales-scope";
import {
  closeSalesProject,
  createSalesProject,
  getSalesProjectOrder,
  invoiceSalesProject,
  listSalesProjects,
  provisionSalesProjectOperacion,
  type SalesProjectDetail,
  type SalesProjectOrder,
} from "@/lib/sales-api";
import { getOperacionUrl } from "@/lib/panel-urls";
import {
  getServiceProjectTypeLabel,
  SERVICE_PROJECT_TYPE_OPTIONS,
  SERVICE_PROJECT_TYPES,
} from "@/lib/service-project-types";
import { getApiAssetOrigin } from "@/lib/api-base";
import styles from "./page.module.css";

type SalesProject = SalesProjectDetail;

export default function VentasProyectosPage() {
  const { user } = useUser();
  const router = useRouter();
  const scope = getSalesScope(user, typeof window === "undefined" ? "" : window.location.search);
  const [projects, setProjects] = useState<SalesProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closeModal, setCloseModal] = useState<number | null>(null);
  const [orders, setOrders] = useState<{ [key: number]: SalesProjectOrder }>({});
  const [expandedCostTracker, setExpandedCostTracker] = useState<number | null>(null);
  const [form, setForm] = useState({
    opportunityId: "",
    name: "",
    projectType: SERVICE_PROJECT_TYPES.PROYECTO_INTEGRAL,
    scopeSummary: "",
    siteCount: "",
    budget: 0,
    costProducts: 0,
    costViáticos: 0,
    costOperativo: 0,
    status: "PLANNED",
  });
  const [provisioningId, setProvisioningId] = useState<number | null>(null);
  const [invoicingId, setInvoicingId] = useState<number | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const fetchProjects = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSalesProjects(user.token, { ownerId: scope.ownerId });
      setProjects(data);

      // Fetch orders for each project
      const newOrders: { [key: number]: SalesProjectOrder } = {};
      for (const project of data) {
        try {
          const order = await getSalesProjectOrder(user.token, project.id);
          if (order?.id) newOrders[project.id] = order;
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
  }, [scope.ownerId, user?.token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
        projectType: form.projectType,
        scopeSummary: form.scopeSummary.trim() || undefined,
        siteCount: form.siteCount ? Number(form.siteCount) : undefined,
        budget: form.budget,
        costProducts: form.costProducts,
        costViáticos: form.costViáticos,
        costOperativo: form.costOperativo,
        status: form.status,
      };
      await createSalesProject(user.token, payload);
      setForm({
        opportunityId: "",
        name: "",
        projectType: SERVICE_PROJECT_TYPES.PROYECTO_INTEGRAL,
        scopeSummary: "",
        siteCount: "",
        budget: 0,
        costProducts: 0,
        costViáticos: 0,
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
      const order = await closeSalesProject(user.token, projectId);
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
      const assetBase = getApiAssetOrigin().replace(/\/+$/, "");
      link.href = order.orderPdfUrl.startsWith("http")
        ? order.orderPdfUrl
        : `${assetBase}${order.orderPdfUrl.startsWith("/") ? "" : "/"}${order.orderPdfUrl}`;
      link.download = `orden-${order.orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError("Error al descargar el archivo");
    }
  };

  const handleProvisionOperacion = async (projectId: number) => {
    if (!user?.token) return;
    setProvisioningId(projectId);
    setError(null);
    try {
      await provisionSalesProjectOperacion(user.token, projectId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setProvisioningId(null);
    }
  };

  const handleInvoiceProject = async (projectId: number) => {
    if (!user?.token) return;
    setInvoicingId(projectId);
    setError(null);
    try {
      const invoice = await invoiceSalesProject(user.token, projectId);
      const order = await getSalesProjectOrder(user.token, projectId);
      if (order) setOrders((prev) => ({ ...prev, [projectId]: order }));
      setError(null);
      alert(`Factura ${invoice.invoiceNumber} creada (borrador). Revisa en Contabilidad.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setInvoicingId(null);
    }
  };

  const formatLineMoney = (value: number | string) =>
    Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const selectedTypeMeta = SERVICE_PROJECT_TYPE_OPTIONS.find((o) => o.value === form.projectType);

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <h2>Nuevo proyecto de servicio</h2>
        <p className={styles.meta}>
          Instalaciones CCTV, auditorías de sucursales, mantenimiento o proyectos integrales (ej. Polos del Bienestar, Soriana, TOKS).
        </p>
        <div className={styles.formGrid}>
          <input className={styles.input} name="opportunityId" value={form.opportunityId} onChange={handleChange} placeholder="ID oportunidad" />
          <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="Nombre del proyecto" />
          <select className={styles.input} name="projectType" value={form.projectType} onChange={handleChange}>
            {SERVICE_PROJECT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input className={styles.input} name="siteCount" value={form.siteCount} onChange={handleChange} type="number" min={0} placeholder="Sucursales / sitios (opcional)" />
          <textarea className={styles.input} name="scopeSummary" value={form.scopeSummary} onChange={handleChange} placeholder="Alcance: ej. 128 cámaras, cableado, dron, pantallas, control de acceso…" rows={3} style={{ gridColumn: "1 / -1" }} />
          <input className={styles.input} name="budget" value={form.budget} onChange={handleChange} type="number" placeholder="Presupuesto" />
          <input className={styles.input} name="costProducts" value={form.costProducts} onChange={handleChange} type="number" placeholder="Costo producto" />
          <input className={styles.input} name="costViáticos" value={form.costViáticos} onChange={handleChange} type="number" placeholder="Costo viáticos" />
          <input className={styles.input} name="costOperativo" value={form.costOperativo} onChange={handleChange} type="number" placeholder="Costo operativo" />
          <select className={styles.input} name="status" value={form.status} onChange={handleChange}>
            <option value="PLANNED">Planeado</option>
            <option value="IN_PROGRESS">En curso</option>
            <option value="CLOSED">Cerrado</option>
            <option value="ON_HOLD">Pausado</option>
          </select>
        </div>
        {selectedTypeMeta?.example && (
          <p className={styles.meta} style={{ marginTop: 8 }}>Ejemplo: {selectedTypeMeta.example}</p>
        )}
        <button className={styles.primaryButton} type="button" onClick={handleCreate} disabled={loading}>Crear proyecto</button>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.list}>
        {loading && <p>cargando...</p>}
        {projects.map((project) => (
          <article key={project.id} className={styles.card}>
            <div onClick={() => setExpandedCostTracker(expandedCostTracker === project.id ? null : project.id)} style={{ cursor: "pointer" }}>
              <h3>{project.name}</h3>
              <div className={styles.meta}>Tipo: {getServiceProjectTypeLabel(project.projectType)}</div>
              {project.scopeSummary && <div className={styles.meta}>Alcance: {project.scopeSummary}</div>}
              {project.siteCount != null && project.siteCount > 0 && (
                <div className={styles.meta}>Sitios / sucursales: {project.siteCount}</div>
              )}
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
                className={styles.primaryButton}
                onClick={() => router.push(`/proyectos/${project.id}`)}
              >
                📋 Detalle unificado
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => setExpandedCostTracker(expandedCostTracker === project.id ? null : project.id)}
              >
                {expandedCostTracker === project.id ? "🔽 Ocultar costos" : "🔼 Ver costos"}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => router.push(`/proyectos/${project.id}/gastos`)}
              >
                Ver gastos
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => handleProvisionOperacion(project.id)}
                disabled={loading || provisioningId === project.id}
              >
                {provisioningId === project.id ? "Activando…" : "Desplegar en operación"}
              </button>
              <a
                className={styles.secondaryButton}
                href={getOperacionUrl("/projects")}
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Ver en operación
              </a>
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
                <>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setExpandedOrderId(expandedOrderId === project.id ? null : project.id)}
                  >
                    {expandedOrderId === project.id ? "Ocultar orden" : "Ver líneas de orden"}
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => handleDownloadOrder(project.id)}
                  >
                    Descargar orden
                  </button>
                  {!orders[project.id].invoice && (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => handleInvoiceProject(project.id)}
                      disabled={invoicingId === project.id}
                    >
                      {invoicingId === project.id ? "Facturando…" : "Generar factura"}
                    </button>
                  )}
                  {orders[project.id].invoice && (
                    <span className={styles.meta}>
                      Factura: {orders[project.id].invoice?.invoiceNumber} ({orders[project.id].invoice?.status})
                    </span>
                  )}
                </>
              )}
            </div>
            {orders[project.id] && expandedOrderId === project.id && (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
                      <th style={{ padding: 6 }}>Concepto</th>
                      <th style={{ padding: 6 }}>SKU</th>
                      <th style={{ padding: 6 }}>Cant.</th>
                      <th style={{ padding: 6 }}>P. unit.</th>
                      <th style={{ padding: 6 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders[project.id].lines || []).map((line) => (
                      <tr key={line.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: 6 }}>{line.name}</td>
                        <td style={{ padding: 6 }}>{line.sku || "—"}</td>
                        <td style={{ padding: 6 }}>{line.qty}</td>
                        <td style={{ padding: 6 }}>{formatLineMoney(line.unitPrice)}</td>
                        <td style={{ padding: 6 }}>{formatLineMoney(line.lineTotal)}</td>
                      </tr>
                    ))}
                    {!orders[project.id].lines?.length && (
                      <tr><td colSpan={5} style={{ padding: 8, color: "#666" }}>Sin líneas en la orden.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
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


