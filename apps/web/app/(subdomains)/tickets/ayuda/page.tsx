"use client";

import { useCallback, useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";

type Article = {
  id: number;
  slug: string;
  title: string;
  excerpt?: string | null;
  content: string;
  category?: { id: number; name: string; icon?: string | null } | null;
  tags?: string | null;
  viewCount: number;
  helpfulCount: number;
  publishedAt?: string | null;
};

export default function HelpCenterPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filtered, setFiltered] = useState<Article[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchArticles = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q
        ? `kb-public/articles?q=${encodeURIComponent(q)}`
        : `kb-public/articles`;
      const res = await fetch(buildApiUrl(url));
      if (res.ok) {
        const data = await res.json();
        setArticles(data);
        setFiltered(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search) fetchArticles(search);
      else setFiltered(articles);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, articles, fetchArticles]);

  const markHelpful = async (id: number) => {
    try {
      await fetch(buildApiUrl(`kb-public/articles/${id}/helpful`), { method: "POST" });
      fetchArticles(search || undefined);
    } catch {
      // silent
    }
  };

  return (
    <div style={{ padding: "24px max(16px, 4vw)", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>🆘 Centro de ayuda</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
          Encuentra respuestas a las preguntas más frecuentes sobre nuestros servicios.
        </p>
        <input
          type="text"
          placeholder="🔍 Buscar artículos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 600,
            padding: "12px 18px",
            fontSize: 15,
            borderRadius: 999,
            border: "2px solid var(--border)",
            background: "var(--bg-primary)",
            marginTop: 12,
          }}
        />
      </div>

      {selected ? (
        <div>
          <button type="button" onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", marginBottom: 12 }}>
            ← Volver al listado
          </button>
          <article style={{ padding: 24, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
            {selected.category && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{selected.category.icon} {selected.category.name}</div>}
            <h1 style={{ marginTop: 8 }}>{selected.title}</h1>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
              {selected.publishedAt && new Date(selected.publishedAt).toLocaleDateString("es-MX")}
              · 👁️ {selected.viewCount}
              · 👍 {selected.helpfulCount}
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.7 }}>{selected.content}</div>
            <div style={{ marginTop: 24, padding: 16, background: "var(--bg-secondary)", borderRadius: 8, textAlign: "center" }}>
              <p style={{ margin: 0, marginBottom: 8 }}>¿Te fue útil este artículo?</p>
              <button type="button" onClick={() => markHelpful(selected.id)} style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
                👍 Sí, gracias
              </button>
            </div>
          </article>
        </div>
      ) : (
        <>
          {loading ? (
            <p style={{ textAlign: "center" }}>Cargando…</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center" }}>
              No se encontraron artículos {search && `para "${search}"`}.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a)}
                  style={{
                    textAlign: "left",
                    padding: 16,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
                >
                  {a.category && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{a.category.icon} {a.category.name}</div>}
                  <h3 style={{ marginTop: 8, marginBottom: 6 }}>{a.title}</h3>
                  {a.excerpt && <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>{a.excerpt}</p>}
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                    👁️ {a.viewCount} · 👍 {a.helpfulCount}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
