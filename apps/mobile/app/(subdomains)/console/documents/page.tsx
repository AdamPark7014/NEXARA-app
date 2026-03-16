"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function DocumentsPage() {
  const { user } = useUser();
  const [documents, setDocuments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"docs" | "categories">("docs");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/documents`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/documents/categories`, { headers }).then((r) => r.json()),
    ])
      .then(([docs, cats]) => {
        setDocuments(Array.isArray(docs) ? docs : docs.data || []);
        setCategories(Array.isArray(cats) ? cats : cats.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const approved = documents.filter((d: any) => d.status === "APPROVED").length;
  const pending = documents.filter((d: any) => d.status === "DRAFT" || d.status === "PENDING").length;

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
  });

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📁 Gestión Documental</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Control de documentos, versionamiento y flujos de aprobación documental.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (documents.length > 0 || categories.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total documentos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{documents.length}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Aprobados</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{approved}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Pendientes</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{pending}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Categorías</p>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{categories.length}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("docs")} style={tabStyle("docs")}>📄 Documentos</button>
          <button onClick={() => setTab("categories")} style={tabStyle("categories")}>🏷️ Categorías</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "docs" ? (
          documents.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay documentos registrados.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Título</th>
                    <th>Categoría</th>
                    <th>Versión</th>
                    <th>Estado</th>
                    <th>Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d: any) => (
                    <tr key={d.id}>
                      <td><strong>{d.code || `DOC-${d.id}`}</strong></td>
                      <td>{d.title}</td>
                      <td>{d.category?.name || "—"}</td>
                      <td>v{d.currentVersion || 1}</td>
                      <td>
                        <span className={d.status === "APPROVED" ? "status-active" : d.status === "ARCHIVED" ? "status-inactive" : "status-pending"}>
                          {d.status}
                        </span>
                      </td>
                      <td>{new Date(d.updatedAt || d.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          categories.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay categorías de documentos.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {categories.map((c: any) => (
                <div key={c.id} className="card" style={{ padding: 16 }}>
                  <h3 style={{ color: "var(--primary)", marginBottom: 4 }}>{c.name}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>{c.description || "Sin descripción"}</p>
                  <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                    {c._count?.documents ?? 0} documentos
                  </p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </RoleGuard>
  );
}
