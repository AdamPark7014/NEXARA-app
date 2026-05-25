"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Category = { id: number; slug: string; name: string; icon?: string | null; visibility: string; _count?: { articles: number } };
type Article = {
  id: number; slug: string; title: string; excerpt?: string | null; content: string;
  visibility: "PUBLIC" | "CLIENT_ONLY" | "INTERNAL"; status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  tags?: string | null; viewCount: number; helpfulCount: number;
  category?: { id: number; name: string; icon?: string | null } | null;
  publishedAt?: string | null; createdAt: string;
};

const VISIBILITY_COLOR: Record<string, string> = {
  PUBLIC: "#16a34a",
  CLIENT_ONLY: "#3b82f6",
  INTERNAL: "#f59e0b",
};

export default function KbAdminPage() {
  const { user } = useUser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"articles" | "categories">("articles");
  const [editing, setEditing] = useState<Partial<Article> | null>(null);
  const [newCategory, setNewCategory] = useState({ name: "", description: "", icon: "📘", visibility: "PUBLIC" });

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const [cRes, aRes] = await Promise.all([
        fetch(buildApiUrl("kb/categories"), { headers: { Authorization: `Bearer ${user.token}` } }),
        fetch(buildApiUrl("kb/articles"), { headers: { Authorization: `Bearer ${user.token}` } }),
      ]);
      if (cRes.ok) setCategories(await cRes.json());
      if (aRes.ok) setArticles(await aRes.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveArticle = async () => {
    if (!editing?.title || !editing.content) {
      setMsg("Título y contenido son obligatorios");
      return;
    }
    try {
      const isUpdate = !!editing.id;
      const res = await fetch(buildApiUrl(`kb/articles${isUpdate ? `/${editing.id}` : ""}`), {
        method: isUpdate ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg(isUpdate ? "Artículo actualizado" : "Artículo creado");
      setEditing(null);
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const deleteArticle = async (id: number) => {
    if (!confirm("¿Eliminar artículo?")) return;
    try {
      await fetch(buildApiUrl(`kb/articles/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${user?.token}` } });
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const createCategory = async () => {
    if (!newCategory.name) return;
    try {
      await fetch(buildApiUrl(`kb/categories`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(newCategory),
      });
      setNewCategory({ name: "", description: "", icon: "📘", visibility: "PUBLIC" });
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: 0 }}>📚 Knowledge Base</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Centro de conocimiento: FAQ, manuales y documentación técnica para clientes y staff.
      </p>

      {msg && <div style={{ padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 8, marginTop: 12 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Pill active={tab === "articles"} onClick={() => setTab("articles")}>Artículos ({articles.length})</Pill>
        <Pill active={tab === "categories"} onClick={() => setTab("categories")}>Categorías ({categories.length})</Pill>
        <button type="button" className="button-primary" onClick={() => setEditing({ status: "DRAFT", visibility: "PUBLIC" })} style={{ marginLeft: "auto" }}>
          + Nuevo artículo
        </button>
      </div>

      {editing && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>{editing.id ? "Editar artículo" : "Nuevo artículo"}</h3>
          <Field label="Título *">
            <input style={inputStyle} value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </Field>
          <Field label="Extracto">
            <input style={inputStyle} value={editing.excerpt || ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
          </Field>
          <Field label="Contenido (Markdown) *">
            <textarea style={{ ...inputStyle, minHeight: 200, fontFamily: "monospace" }} value={editing.content || ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Field label="Categoría">
              <select style={inputStyle} value={editing.category?.id || ""} onChange={(e) => setEditing({ ...editing, category: { id: +e.target.value, name: "" } as any })}>
                <option value="">— Sin categoría —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Visibilidad">
              <select style={inputStyle} value={editing.visibility || "PUBLIC"} onChange={(e) => setEditing({ ...editing, visibility: e.target.value as any })}>
                <option value="PUBLIC">Público</option>
                <option value="CLIENT_ONLY">Solo clientes</option>
                <option value="INTERNAL">Interno</option>
              </select>
            </Field>
            <Field label="Estado">
              <select style={inputStyle} value={editing.status || "DRAFT"} onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}>
                <option value="DRAFT">Borrador</option>
                <option value="PUBLISHED">Publicado</option>
                <option value="ARCHIVED">Archivado</option>
              </select>
            </Field>
          </div>
          <Field label="Tags (separados por coma)">
            <input style={inputStyle} value={editing.tags || ""} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="button-primary" onClick={saveArticle}>Guardar</button>
            <button type="button" onClick={() => setEditing(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}

      {tab === "articles" && (
        <div style={{ marginTop: 16 }}>
          {loading ? <p>Cargando…</p> : articles.length === 0 ? <p style={{ color: "var(--text-secondary)" }}>Sin artículos. Crea el primero.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr><Th>Título</Th><Th>Categoría</Th><Th>Visibilidad</Th><Th>Estado</Th><Th align="right">Vistas</Th><Th>Acciones</Th></tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td><strong>{a.title}</strong><div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.slug}</div></Td>
                    <Td>{a.category?.name || "—"}</Td>
                    <Td><Badge color={VISIBILITY_COLOR[a.visibility]}>{a.visibility}</Badge></Td>
                    <Td><Badge color={a.status === "PUBLISHED" ? "#16a34a" : a.status === "DRAFT" ? "#f59e0b" : "#6b7280"}>{a.status}</Badge></Td>
                    <Td align="right">👁️ {a.viewCount} · 👍 {a.helpfulCount}</Td>
                    <Td>
                      <button type="button" onClick={() => setEditing(a)} style={btnSmall}>✏️ Editar</button>
                      <button type="button" onClick={() => deleteArticle(a.id)} style={{ ...btnSmall, background: "#dc2626", marginLeft: 4 }}>🗑️</button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "categories" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
            <h3 style={{ marginTop: 0 }}>Nueva categoría</h3>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
              <Field label="Icono"><input style={inputStyle} value={newCategory.icon} onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })} /></Field>
              <Field label="Nombre"><input style={inputStyle} value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} /></Field>
              <Field label="Descripción"><input style={inputStyle} value={newCategory.description} onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })} /></Field>
              <Field label="Visibilidad">
                <select style={inputStyle} value={newCategory.visibility} onChange={(e) => setNewCategory({ ...newCategory, visibility: e.target.value })}>
                  <option value="PUBLIC">Público</option>
                  <option value="CLIENT_ONLY">Solo clientes</option>
                  <option value="INTERNAL">Interno</option>
                </select>
              </Field>
              <button type="button" className="button-primary" onClick={createCategory}>+ Crear</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
            {categories.map((c) => (
              <div key={c.id} style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${VISIBILITY_COLOR[c.visibility]}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{c.icon} {c.name}</strong>
                  <Badge color={VISIBILITY_COLOR[c.visibility]}>{c.visibility}</Badge>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                  {c._count?.articles || 0} artículo(s) publicado(s)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>{label}{children}</label>;
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: active ? "var(--primary)" : "var(--bg-secondary)", color: active ? "#fff" : "var(--text-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{children}</button>;
}
function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 10, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <td style={{ padding: 10, textAlign: align || "left", fontSize: 13 }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 };
