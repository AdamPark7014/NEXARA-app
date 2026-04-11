"use client";

import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import HelpTab from "@/components/HelpTab";
import { PERMISSIONS } from "@/lib/permissions";

export default function DocumentsPage() {
  const { user } = useUser();
  const [documents, setDocuments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"docs" | "categories">("docs");
  const [showDocForm, setShowDocForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [docForm, setDocForm] = useState({ code: "", title: "", categoryId: "", description: "" });
  const [catForm, setCatForm] = useState({ code: "", name: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    if (!user?.token) return;

    const headers = { Authorization: `Bearer ${user.token}` };

    Promise.all([
      fetch(buildApiUrl(`documents`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`documents/categories`), { headers }).then((r) => r.json()),
    ])
      .then(([docs, cats]) => {
        setDocuments(Array.isArray(docs) ? docs : docs?.data || []);
        setCategories(Array.isArray(cats) ? cats : cats?.data || []);
      })
      .catch(() => {
        setDocuments([]);
        setCategories([]);
      })
      .finally(() => setLoading(false));
  }, [user?.token]);

  const approved = documents.filter((d: any) => d.status === "APPROVED").length;
  const pending = documents.filter((d: any) => d.status === "DRAFT" || d.status === "PENDING").length;

  const handleCreateDocument = async () => {
    if (!user?.token || !docForm.title) return;
    setSavingDoc(true);
    try {
      const res = await fetch(buildApiUrl(`documents`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...docForm, status: "DRAFT" }),
      });
      if (res.ok) {
        const newDoc = await res.json();
        setDocuments([newDoc, ...documents]);
        setDocForm({ code: "", title: "", categoryId: "", description: "" });
        setShowDocForm(false);
      }
    } catch (e) { console.error(e); }
    finally { setSavingDoc(false); }
  };

  const handleCreateCategory = async () => {
    if (!user?.token || !catForm.name) return;
    setSavingCat(true);
    try {
      const res = await fetch(buildApiUrl(`documents/categories`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(catForm),
      });
      if (res.ok) {
        const newCat = await res.json();
        setCategories([newCat, ...categories]);
        setCatForm({ code: "", name: "" });
        setShowCatForm(false);
      }
    } catch (e) { console.error(e); }
    finally { setSavingCat(false); }
  };

  const tabStyle = (t: "docs" | "categories") => ({
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
        <HelpTab module="documents" user={user} />

        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>Gestion Documental</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Control de documentos, versionamiento y flujos de aprobacion documental.
          </p>
        </div>

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
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Categorias</p>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{categories.length}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("docs")} style={tabStyle("docs")}>Documentos</button>
          <button onClick={() => setTab("categories")} style={tabStyle("categories")}>Categorias</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "docs" ? (
          <>
            {showDocForm && (
              <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--primary)' }}>
                <h3 style={{ marginBottom: 12 }}>Nuevo Documento</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <input type="text" placeholder="Código (ej: POL-001)" value={docForm.code} onChange={(e) => setDocForm({ ...docForm, code: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <input type="text" placeholder="Título del documento" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <select value={docForm.categoryId} onChange={(e) => setDocForm({ ...docForm, categoryId: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, gridColumn: '1/-1' }}>
                    <option value="">Selecciona categoría</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <textarea placeholder="Descripción o contenido del documento" value={docForm.description} onChange={(e) => setDocForm({ ...docForm, description: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, minHeight: 80, marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateDocument} disabled={savingDoc} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                    {savingDoc ? 'Guardando...' : 'Crear Documento'}
                  </button>
                  <button onClick={() => setShowDocForm(false)} style={{ padding: '8px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Cancelar</button>
                </div>
              </div>
            )}
            {!showDocForm && (
              <button onClick={() => setShowDocForm(true)} style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>+ Nuevo Documento</button>
            )}
            {documents.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p style={{ color: "var(--text-secondary)" }}>No hay documentos registrados.</p>
              </div>
            ) : (
              <div className="card" style={{ overflow: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Codigo</th>
                      <th>Titulo</th>
                      <th>Categoria</th>
                      <th>Version</th>
                      <th>Estado</th>
                      <th>Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d: any) => (
                      <tr key={d.id}>
                        <td>
                          <strong>{d.code || `DOC-${d.id}`}</strong>
                        </td>
                        <td>{d.title}</td>
                        <td>{d.category?.name || "-"}</td>
                        <td>v{d.currentVersion || 1}</td>
                        <td>
                          <span
                            className={
                              d.status === "APPROVED"
                                ? "status-active"
                                : d.status === "ARCHIVED"
                                  ? "status-inactive"
                                  : "status-pending"
                            }
                          >
                            {d.status}
                          </span>
                        </td>
                        <td>{new Date(d.updatedAt || d.createdAt).toLocaleDateString("es-MX")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            {showCatForm && (
              <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--success)' }}>
                <h3 style={{ marginBottom: 12 }}>Nueva Categoría</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <input type="text" placeholder="Código categoría" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <input type="text" placeholder="Nombre de la categoría" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateCategory} disabled={savingCat} style={{ padding: '8px 16px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                    {savingCat ? 'Guardando...' : 'Crear Categoría'}
                  </button>
                  <button onClick={() => setShowCatForm(false)} style={{ padding: '8px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Cancelar</button>
                </div>
              </div>
            )}
            {!showCatForm && (
              <button onClick={() => setShowCatForm(true)} style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>+ Nueva Categoría</button>
            )}
            {categories.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p style={{ color: "var(--text-secondary)" }}>No hay categorias de documentos.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {categories.map((c: any) => (
                  <div key={c.id} className="card" style={{ padding: 16 }}>
                    <h3 style={{ marginBottom: 8 }}>{c.name}</h3>
                    <p style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                      Codigo: {c.code || "-"}
                    </p>
                    <p style={{ color: "var(--text-secondary)" }}>
                      Documentos: {typeof c.documentsCount === "number" ? c.documentsCount : "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
