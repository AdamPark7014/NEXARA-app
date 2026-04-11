"use client";

import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import styles from "./page.module.css";

type WorkProjectExpense = {
  id: number;
  category: string;
  amount: string | number;
  incurredAt?: string | null;
  note?: string | null;
};

type WorkProjectPayroll = {
  id: number;
  employee: string;
  amount: string | number;
  paidAt?: string | null;
  note?: string | null;
};

type WorkProjectLog = {
  id: number;
  label: string;
  progress?: number | null;
  note?: string | null;
  createdAt?: string | null;
};

type WorkProject = {
  id: number;
  title: string;
  clientName?: string | null;
  managerName?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budgetTotal?: string | number | null;
  budgetUsed?: string | number | null;
  progress?: number | null;
  description?: string | null;
  expenses?: WorkProjectExpense[];
  payroll?: WorkProjectPayroll[];
  logs?: WorkProjectLog[];
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("es-MX") : "";

const formatCurrency = (value: string | number | null | undefined) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number.isNaN(numeric) ? 0 : numeric);
};

const statusColumns = [
  { key: "IN_PROGRESS", label: "En curso" },
  { key: "AT_RISK", label: "En riesgo" },
  { key: "ON_HOLD", label: "Detenido" },
  { key: "COMPLETED", label: "Completado" },
];

export default function ContabilidadProyectos() {
  const { user } = useUser();
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newProject, setNewProject] = useState({
    title: "",
    clientName: "",
    managerName: "",
    budgetTotal: "",
    startDate: "",
    endDate: "",
    description: "",
  });

  const [logDraft, setLogDraft] = useState({ label: "", progress: "", note: "" });
  const [expenseDraft, setExpenseDraft] = useState({ category: "", amount: "", note: "" });
  const [payrollDraft, setPayrollDraft] = useState({ employee: "", amount: "", note: "" });
  const [statusDraft, setStatusDraft] = useState<string>("IN_PROGRESS");
  const [progressDraft, setProgressDraft] = useState<string>("");

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) || null,
    [projects, selectedId]
  );

  const fetchProjects = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("work-projects"), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = res.ok ? await res.json() : [];
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      if (!selectedId && list.length) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user]);

  useEffect(() => {
    if (selected) {
      setStatusDraft(selected.status || "IN_PROGRESS");
      setProgressDraft(selected.progress?.toString() || "");
    }
  }, [selected]);

  const handleCreateProject = async () => {
    if (!user?.token) return;
    if (!newProject.title.trim()) {
      setError("El titulo es obligatorio");
      return;
    }
    setError(null);
    const res = await fetch(buildApiUrl("work-projects"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        title: newProject.title,
        clientName: newProject.clientName,
        managerName: newProject.managerName,
        budgetTotal: newProject.budgetTotal,
        startDate: newProject.startDate,
        endDate: newProject.endDate,
        description: newProject.description,
      }),
    });
    if (!res.ok) {
      const message = await res.text();
      setError(message || "No se pudo crear el proyecto");
      return;
    }
    setNewProject({
      title: "",
      clientName: "",
      managerName: "",
      budgetTotal: "",
      startDate: "",
      endDate: "",
      description: "",
    });
    fetchProjects();
  };

  const handleUpdateStatus = async () => {
    if (!user?.token || !selected) return;
    const res = await fetch(buildApiUrl(`work-projects/${selected.id}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        status: statusDraft,
        progress: progressDraft ? Number(progressDraft) : undefined,
      }),
    });
    if (res.ok) fetchProjects();
  };

  const addLog = async () => {
    if (!user?.token || !selected) return;
    if (!logDraft.label.trim()) return;
    await fetch(buildApiUrl(`work-projects/${selected.id}/logs`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        label: logDraft.label,
        progress: logDraft.progress ? Number(logDraft.progress) : undefined,
        note: logDraft.note,
      }),
    });
    setLogDraft({ label: "", progress: "", note: "" });
    fetchProjects();
  };

  const addExpense = async () => {
    if (!user?.token || !selected) return;
    if (!expenseDraft.category.trim() || !expenseDraft.amount.trim()) return;
    await fetch(buildApiUrl(`work-projects/${selected.id}/expenses`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify(expenseDraft),
    });
    setExpenseDraft({ category: "", amount: "", note: "" });
    fetchProjects();
  };

  const addPayroll = async () => {
    if (!user?.token || !selected) return;
    if (!payrollDraft.employee.trim() || !payrollDraft.amount.trim()) return;
    await fetch(buildApiUrl(`work-projects/${selected.id}/payroll`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify(payrollDraft),
    });
    setPayrollDraft({ employee: "", amount: "", note: "" });
    fetchProjects();
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Proyectos en proceso</h1>
          <p className={styles.subtitle}>
            Panel de avance, presupuesto y pagos operativos por proyecto en curso.
          </p>
        </div>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.formCard}>
        <div>
          <h2 className={styles.cardTitle}>Nuevo proyecto operativo</h2>
          <p className={styles.cardSubtitle}>Registra proyectos en ejecucion y su presupuesto base.</p>
        </div>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="Nombre del proyecto"
            value={newProject.title}
            onChange={(event) => setNewProject((prev) => ({ ...prev, title: event.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Cliente"
            value={newProject.clientName}
            onChange={(event) => setNewProject((prev) => ({ ...prev, clientName: event.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Responsable"
            value={newProject.managerName}
            onChange={(event) => setNewProject((prev) => ({ ...prev, managerName: event.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Presupuesto total"
            value={newProject.budgetTotal}
            onChange={(event) => setNewProject((prev) => ({ ...prev, budgetTotal: event.target.value }))}
          />
          <input
            className={styles.input}
            type="date"
            value={newProject.startDate}
            onChange={(event) => setNewProject((prev) => ({ ...prev, startDate: event.target.value }))}
          />
          <input
            className={styles.input}
            type="date"
            value={newProject.endDate}
            onChange={(event) => setNewProject((prev) => ({ ...prev, endDate: event.target.value }))}
          />
          <textarea
            className={styles.textarea}
            placeholder="Descripción y alcance"
            value={newProject.description}
            onChange={(event) => setNewProject((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>
        <button className={styles.primaryButton} type="button" onClick={handleCreateProject}>
          Crear proyecto
        </button>
      </div>

      <div className={styles.boardGrid}>
        {statusColumns.map((column) => (
          <div key={column.key} className={styles.boardColumn}>
            <div className={styles.columnHeader}>
              <span>{column.label}</span>
              <span className={styles.columnCount}>
                {projects.filter((project) => (project.status || "IN_PROGRESS") === column.key).length}
              </span>
            </div>
            <div className={styles.columnBody}>
              {projects
                .filter((project) => (project.status || "IN_PROGRESS") === column.key)
                .map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`${styles.card} ${selectedId === project.id ? styles.cardActive : ""}`}
                    onClick={() => setSelectedId(project.id)}
                  >
                    <div>
                      <p className={styles.cardLabel}>{project.clientName || "Sin cliente"}</p>
                      <h3 className={styles.cardTitle}>{project.title}</h3>
                      <p className={styles.cardMeta}>
                        Responsable: {project.managerName || "Sin asignar"}
                      </p>
                    </div>
                    <div className={styles.cardFooter}>
                      <span>{formatCurrency(project.budgetUsed)}</span>
                      <span>{project.progress || 0}%</span>
                    </div>
                  </button>
                ))}
              {!loading &&
                projects.filter((project) => (project.status || "IN_PROGRESS") === column.key).length === 0 && (
                  <p className={styles.empty}>Sin proyectos</p>
                )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Detalle financiero</h2>
              <p className={styles.sectionSubtitle}>
                Selecciona un proyecto para ver avances, gastos y nómina.
              </p>
            </div>
            {selected && <span className={styles.badge}>{selected.status}</span>}
          </div>

          {selected ? (
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <div>
                  <h3 className={styles.detailTitle}>{selected.title}</h3>
                  <p className={styles.detailMeta}>{selected.description || "Sin descripción"}</p>
                </div>
                <div className={styles.progressBlock}>
                  <div>
                    <span>Avance</span>
                    <strong>{selected.progress || 0}%</strong>
                  </div>
                  <div className={styles.progressBar}>
                    <span style={{ width: `${selected.progress || 0}%` }} />
                  </div>
                </div>
              </div>

              <div className={styles.metricsRow}>
                <div>
                  <span>Presupuesto total</span>
                  <strong>{formatCurrency(selected.budgetTotal)}</strong>
                </div>
                <div>
                  <span>Gastado</span>
                  <strong>{formatCurrency(selected.budgetUsed)}</strong>
                </div>
                <div>
                  <span>Fechas</span>
                  <strong>
                    {formatDate(selected.startDate)} - {formatDate(selected.endDate)}
                  </strong>
                </div>
              </div>

              <div className={styles.inlineForm}>
                <select
                  className={styles.input}
                  value={statusDraft}
                  onChange={(event) => setStatusDraft(event.target.value)}
                >
                  {statusColumns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.input}
                  placeholder="Avance %"
                  value={progressDraft}
                  onChange={(event) => setProgressDraft(event.target.value)}
                />
                <button className={styles.secondaryButton} type="button" onClick={handleUpdateStatus}>
                  Actualizar
                </button>
              </div>

              <div className={styles.splitGrid}>
                <div>
                  <h4 className={styles.subTitle}>Gastos</h4>
                  <div className={styles.list}>
                    {selected.expenses?.slice(0, 5).map((item) => (
                      <div key={item.id} className={styles.listItem}>
                        <div>
                          <strong>{item.category}</strong>
                          <span>{item.note || "Sin notas"}</span>
                        </div>
                        <span>{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                    {!selected.expenses?.length && <p className={styles.empty}>Sin gastos.</p>}
                  </div>
                  <div className={styles.inlineForm}>
                    <input
                      className={styles.input}
                      placeholder="Categoria"
                      value={expenseDraft.category}
                      onChange={(event) =>
                        setExpenseDraft((prev) => ({ ...prev, category: event.target.value }))
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Monto"
                      value={expenseDraft.amount}
                      onChange={(event) =>
                        setExpenseDraft((prev) => ({ ...prev, amount: event.target.value }))
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Nota"
                      value={expenseDraft.note}
                      onChange={(event) =>
                        setExpenseDraft((prev) => ({ ...prev, note: event.target.value }))
                      }
                    />
                    <button className={styles.secondaryButton} type="button" onClick={addExpense}>
                      Agregar
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className={styles.subTitle}>Nómina</h4>
                  <div className={styles.list}>
                    {selected.payroll?.slice(0, 5).map((item) => (
                      <div key={item.id} className={styles.listItem}>
                        <div>
                          <strong>{item.employee}</strong>
                          <span>{item.note || "Pago semanal"}</span>
                        </div>
                        <span>{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                    {!selected.payroll?.length && <p className={styles.empty}>Sin pagos.</p>}
                  </div>
                  <div className={styles.inlineForm}>
                    <input
                      className={styles.input}
                      placeholder="Empleado"
                      value={payrollDraft.employee}
                      onChange={(event) =>
                        setPayrollDraft((prev) => ({ ...prev, employee: event.target.value }))
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Monto"
                      value={payrollDraft.amount}
                      onChange={(event) =>
                        setPayrollDraft((prev) => ({ ...prev, amount: event.target.value }))
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Nota"
                      value={payrollDraft.note}
                      onChange={(event) =>
                        setPayrollDraft((prev) => ({ ...prev, note: event.target.value }))
                      }
                    />
                    <button className={styles.secondaryButton} type="button" onClick={addPayroll}>
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.timeline}>
                <h4 className={styles.subTitle}>Timeline de avance</h4>
                <div className={styles.timelineList}>
                  {selected.logs?.slice(0, 6).map((log) => (
                    <div key={log.id} className={styles.timelineItem}>
                      <div>
                        <strong>{log.label}</strong>
                        <span>{log.note || "Sin notas"}</span>
                      </div>
                      <span>{log.progress || 0}%</span>
                    </div>
                  ))}
                  {!selected.logs?.length && <p className={styles.empty}>Sin avances registrados.</p>}
                </div>
                <div className={styles.inlineForm}>
                  <input
                    className={styles.input}
                    placeholder="Hito"
                    value={logDraft.label}
                    onChange={(event) => setLogDraft((prev) => ({ ...prev, label: event.target.value }))}
                  />
                  <input
                    className={styles.input}
                    placeholder="Avance %"
                    value={logDraft.progress}
                    onChange={(event) =>
                      setLogDraft((prev) => ({ ...prev, progress: event.target.value }))
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Nota"
                    value={logDraft.note}
                    onChange={(event) => setLogDraft((prev) => ({ ...prev, note: event.target.value }))}
                  />
                  <button className={styles.secondaryButton} type="button" onClick={addLog}>
                    Registrar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className={styles.empty}>Selecciona un proyecto para ver el detalle.</p>
          )}
        </div>
      </div>
    </section>
  );
}
