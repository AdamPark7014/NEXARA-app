"use client";

import { useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import HelpTab from "@/components/HelpTab";
import { PERMISSIONS } from "@/lib/permissions";

type UserItem = { id: number; nombre: string; email?: string; role?: { nombre?: string } };
type ClientItem = { id: number; name: string };
type ProjectItem = {
  id: number;
  title: string;
  description?: string | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  startDate: string;
  endDate?: string | null;
  actualEndDate?: string | null;
  vendor?: { id: number; nombre: string; email?: string };
  client: { id: number; name: string };
  engineers?: Array<{ id: number; engineer: { id: number; nombre: string; email?: string } }>;
  activities?: Array<{ id: number }>;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;

export default function ConsoleProjectsPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [selectedEngineerByProject, setSelectedEngineerByProject] = useState<Record<number, string>>({});
  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    vendorId: "",
    clientId: "",
    startDate: "",
    endDate: "",
  });

  const vendorOptions = useMemo(
    () => users.filter((u) => (u.role?.nombre || "").toLowerCase().includes("vended")),
    [users],
  );

  const engineerOptions = useMemo(
    () => users.filter((u) => {
      const role = (u.role?.nombre || "").toLowerCase();
      return role.includes("ingenier") || role.includes("engineer");
    }),
    [users],
  );

  const token = user?.token;

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [projectsRes, clientsRes, usersRes] = await Promise.all([
        fetch(buildApiUrl("operational-projects"), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildApiUrl("service-clients"), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildApiUrl("users/assignable"), { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const projectsData = projectsRes.ok ? await projectsRes.json() : [];
      const clientsData = clientsRes.ok ? await clientsRes.json() : [];
      const usersData = usersRes.ok ? await usersRes.json() : [];

      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setClients(Array.isArray(clientsData) ? clientsData : (Array.isArray(clientsData?.data) ? clientsData.data : []));
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch {
      setProjects([]);
      setClients([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const createProject = async () => {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!newProject.title || !newProject.vendorId || !newProject.clientId || !newProject.startDate) {
      setFormError("Completa titulo, vendedor, cliente y fecha de inicio.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl("operational-projects"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newProject.title,
          description: newProject.description || undefined,
          vendorId: Number(newProject.vendorId),
          clientId: Number(newProject.clientId),
          startDate: new Date(newProject.startDate).toISOString(),
          endDate: newProject.endDate ? new Date(newProject.endDate).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data?.message || "No se pudo crear el proyecto.");
        return;
      }

      setFormSuccess("Proyecto creado correctamente.");
      setNewProject({ title: "", description: "", vendorId: "", clientId: "", startDate: "", endDate: "" });
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (projectId: number, status: "ACTIVE" | "ON_HOLD" | "COMPLETED") => {
    if (!token) return;
    await fetch(buildApiUrl(`operational-projects/${projectId}/status`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    await loadData();
  };

  const assignEngineer = async (projectId: number) => {
    const engineerId = Number(selectedEngineerByProject[projectId] || 0);
    if (!token || !engineerId) return;

    await fetch(buildApiUrl(`operational-projects/${projectId}/engineers`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ engineerId }),
    });

    setSelectedEngineerByProject((prev) => ({ ...prev, [projectId]: "" }));
    await loadData();
  };

  const removeEngineer = async (projectId: number, engineerId: number) => {
    if (!token) return;
    await fetch(buildApiUrl(`operational-projects/${projectId}/engineers/${engineerId}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadData();
  };

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="projects" user={user} />

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Crear proyecto operacional</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <input className="input" placeholder="Titulo" value={newProject.title} onChange={(e) => setNewProject((p) => ({ ...p, title: e.target.value }))} />
            <input className="input" placeholder="Descripcion" value={newProject.description} onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))} />
            <select className="input" value={newProject.vendorId} onChange={(e) => setNewProject((p) => ({ ...p, vendorId: e.target.value }))}>
              <option value="">Selecciona vendedor</option>
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            <select className="input" value={newProject.clientId} onChange={(e) => setNewProject((p) => ({ ...p, clientId: e.target.value }))}>
              <option value="">Selecciona cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input className="input" type="date" value={newProject.startDate} onChange={(e) => setNewProject((p) => ({ ...p, startDate: e.target.value }))} />
            <input className="input" type="date" value={newProject.endDate} onChange={(e) => setNewProject((p) => ({ ...p, endDate: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button className="button-primary" onClick={createProject} disabled={saving}>{saving ? "Guardando..." : "Crear proyecto"}</button>
            {formError && <span style={{ color: "#ef4444" }}>{formError}</span>}
            {formSuccess && <span style={{ color: "#22c55e" }}>{formSuccess}</span>}
          </div>
        </div>

        <div className="card" style={{ padding: 16, overflowX: "auto" }}>
          <h3 style={{ marginBottom: 12 }}>Proyectos</h3>
          {loading ? (
            <p>Cargando proyectos...</p>
          ) : projects.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>No hay proyectos registrados.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>Proyecto</th>
                  <th style={{ padding: "8px 6px" }}>Cliente</th>
                  <th style={{ padding: "8px 6px" }}>Vendedor</th>
                  <th style={{ padding: "8px 6px" }}>Estado</th>
                  <th style={{ padding: "8px 6px" }}>Ingenieros</th>
                  <th style={{ padding: "8px 6px" }}>Actividades</th>
                  <th style={{ padding: "8px 6px" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: "8px 6px" }}>
                      <strong>{project.title}</strong>
                      <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{project.description || "Sin descripcion"}</div>
                    </td>
                    <td style={{ padding: "8px 6px" }}>{project.client?.name || "-"}</td>
                    <td style={{ padding: "8px 6px" }}>{project.vendor?.nombre || "-"}</td>
                    <td style={{ padding: "8px 6px" }}>{project.status}</td>
                    <td style={{ padding: "8px 6px", minWidth: 240 }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(project.engineers || []).map((assignment) => (
                          <div key={assignment.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{assignment.engineer.nombre}</span>
                            <button className="button-secondary" onClick={() => removeEngineer(project.id, assignment.engineer.id)}>Quitar</button>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 6 }}>
                          <select className="input" value={selectedEngineerByProject[project.id] || ""} onChange={(e) => setSelectedEngineerByProject((prev) => ({ ...prev, [project.id]: e.target.value }))}>
                            <option value="">Asignar ingeniero</option>
                            {engineerOptions.map((e) => (
                              <option key={e.id} value={e.id}>{e.nombre}</option>
                            ))}
                          </select>
                          <button className="button-primary" onClick={() => assignEngineer(project.id)}>Agregar</button>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "8px 6px" }}>{project.activities?.length || 0}</td>
                    <td style={{ padding: "8px 6px", minWidth: 220 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="button-secondary" onClick={() => changeStatus(project.id, "ACTIVE")}>Reactivar</button>
                        <button className="button-secondary" onClick={() => changeStatus(project.id, "ON_HOLD")}>Pausar</button>
                        <button className="button-primary" onClick={() => changeStatus(project.id, "COMPLETED")}>Cerrar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
