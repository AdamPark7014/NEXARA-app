"use client";

import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import { getOperacionUrl, getPanelUrl } from "@/lib/panel-urls";
import { getServiceProjectTypeLabel } from "@/lib/service-project-types";

type ActivityRow = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  ticketType?: string | null;
  branchName?: string | null;
  branchNumber?: string | null;
  responsable?: { id: number; nombre: string; email?: string };
  fechaInicio?: string | null;
  fechaFinalizacion?: string | null;
};

type ProjectDetail = {
  id: number;
  title: string;
  description?: string | null;
  projectType?: string | null;
  scopeSummary?: string | null;
  siteCount?: number | null;
  salesProjectId?: number | null;
  status: string;
  startDate: string;
  endDate?: string | null;
  actualEndDate?: string | null;
  vendor?: { id: number; nombre: string; email?: string };
  client?: { id: number; name: string };
  engineers?: Array<{ id: number; engineer: { id: number; nombre: string; email?: string } }>;
  activities?: ActivityRow[];
};

type DurationInfo = {
  startDate: string;
  endDate: string;
  durationDays: number;
  isActive: boolean;
};

export default function OperacionProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params?.id);
  const { user } = useUser();
  const token = user?.token;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [duration, setDuration] = useState<DurationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !projectId || Number.isNaN(projectId)) return;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch(buildApiUrl(`operational-projects/${projectId}`), { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(buildApiUrl(`operational-projects/${projectId}/activities`), { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(buildApiUrl(`operational-projects/${projectId}/duration`), { headers }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([proj, acts, dur]) => {
        setProject(proj);
        setActivities(Array.isArray(acts) ? acts : []);
        setDuration(dur);
        setError(proj ? null : "Proyecto no encontrado");
      })
      .catch(() => setError("Error al cargar el proyecto"))
      .finally(() => setLoading(false));
  }, [token, projectId]);

  const progress = useMemo(() => {
    if (!activities.length) return 0;
    const done = activities.filter((a) => /finaliz|complet|cerrad/i.test(a.estatus)).length;
    return Math.round((done / activities.length) * 100);
  }, [activities]);

  if (loading) {
    return (
      <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
        <p>Cargando proyecto…</p>
      </RoleGuard>
    );
  }

  if (!project) {
    return (
      <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
        <p>{error || "Proyecto no encontrado"}</p>
        <Link href={getOperacionUrl("/projects")}>← Volver a proyectos</Link>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Link href={getOperacionUrl("/projects")} style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              ← Proyectos operación
            </Link>
            <h1 style={{ margin: "8px 0 4px" }}>{project.title}</h1>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              {getServiceProjectTypeLabel(project.projectType)} · {project.status}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {project.salesProjectId && (
              <a className="button-secondary" href={getPanelUrl("ventas", "/proyectos")} style={{ textDecoration: "none" }}>
                Ventas #{project.salesProjectId}
              </a>
            )}
            <a className="button-primary" href={getOperacionUrl("/activities")} style={{ textDecoration: "none" }}>
              Ver actividades
            </a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Cliente</div>
            <strong>{project.client?.name || "—"}</strong>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Vendedor / PM</div>
            <strong>{project.vendor?.nombre || "—"}</strong>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Avance OT</div>
            <strong>{progress}%</strong>
            <div style={{ fontSize: 12 }}>{activities.length} actividades</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Duración</div>
            <strong>{duration?.durationDays ?? "—"} días</strong>
          </div>
          {project.siteCount != null && project.siteCount > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sitios</div>
              <strong>{project.siteCount}</strong>
            </div>
          )}
        </div>

        {(project.scopeSummary || project.description) && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Alcance</h3>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{project.scopeSummary || project.description}</p>
          </div>
        )}

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Ingenieros asignados</h3>
          {(project.engineers || []).length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Sin ingenieros asignados.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {project.engineers!.map((e) => (
                <li key={e.id}>{e.engineer.nombre}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="card" style={{ padding: 16, overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Timeline de OT / actividades</h3>
          {activities.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Sin actividades vinculadas. Crea OT desde la lista de proyectos.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>AN</th>
                  <th style={{ padding: 8 }}>Título</th>
                  <th style={{ padding: 8 }}>Sucursal</th>
                  <th style={{ padding: 8 }}>Responsable</th>
                  <th style={{ padding: 8 }}>Estado</th>
                  <th style={{ padding: 8 }}>Finalización</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 8 }}>{a.anNumber}</td>
                    <td style={{ padding: 8 }}>{a.titulo}</td>
                    <td style={{ padding: 8 }}>{a.branchName || a.branchNumber || "—"}</td>
                    <td style={{ padding: 8 }}>{a.responsable?.nombre || "—"}</td>
                    <td style={{ padding: 8 }}>{a.estatus}</td>
                    <td style={{ padding: 8 }}>
                      {a.fechaFinalizacion ? new Date(a.fechaFinalizacion).toLocaleDateString("es-MX") : "—"}
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
