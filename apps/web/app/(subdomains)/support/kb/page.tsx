"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Article = {
  id: number;
  slug: string;
  title: string;
  excerpt?: string | null;
  content: string;
  category?: { id: number; name: string; icon?: string | null } | null;
  visibility: string;
  publishedAt?: string | null;
};

export default function SupportKbPage() {
  const { user } = useUser();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Article | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: "PUBLISHED" });
      if (search) qs.set("q", search);
      const res = await fetch(buildApiUrl(`kb/articles?${qs.toString()}`), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setArticles(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token, search]);

  useEffect(() => {
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📚 Base de conocimiento interna</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Procedimientos y soluciones rápidas para el equipo.</p>

      <input
        type="text"
        placeholder="🔍 Buscar artículos…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", marginTop: 16, padding: "12px 18px", fontSize: 15, borderRadius: 999, border: "2px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
      />

      {selected ? (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", marginBottom: 12 }}>← Volver</button>
          <article style={{ padding: 24, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
            {selected.category && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{selected.category.icon} {selected.category.name}</div>}
            <h2 style={{ marginTop: 8 }}>{selected.title}</h2>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{selected.content}</div>
          </article>
        </div>
      ) : (
        <>
          {loading ? <p>Cargando…</p> : articles.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center", marginTop: 32 }}>No hay artículos disponibles.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 16 }}>
              {articles.map((a) => (
                <button key={a.id} type="button" onClick={() => setSelected(a)} style={{ textAlign: "left", padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer" }}>
                  {a.category && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.category.icon} {a.category.name}</div>}
                  <strong style={{ fontSize: 14, marginTop: 6, display: "block" }}>{a.title}</strong>
                  {a.excerpt && <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0 }}>{a.excerpt}</p>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
