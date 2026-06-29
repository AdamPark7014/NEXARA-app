"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface Candidate {
  id: number;
  fullName: string;
  email?: string | null;
  whatsapp?: string | null;
  category: string;
  stage: string;
  employmentStatus: string;
  cvFileUrl: string;
  createdAt?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const STAGES = [
  { key: "INBOX",                  label: "Postulado",         color: "#6b7280" },
  { key: "RECRUITER_SHORTLIST",    label: "Entrevista técnica",color: "#3b82f6" },
  { key: "ADMIN_SHORTLIST",        label: "Entrevista admin",  color: "#8b5cf6" },
  { key: "SUPERADMIN_SHORTLIST",   label: "Oferta",            color: "#f59e0b" },
  { key: "APPROVED",               label: "Contratado ✓",      color: "#22c55e" },
];
const REJECT_MAP: Record<string, string> = {
  INBOX: "RECRUITER_REJECTED",
  RECRUITER_SHORTLIST: "RECRUITER_REJECTED",
  ADMIN_SHORTLIST: "ADMIN_REJECTED",
  SUPERADMIN_SHORTLIST: "SUPERADMIN_REJECTED",
};
const STAGE_LABEL: Record<string, string> = {
  INBOX: "Postulado", RECRUITER_SHORTLIST: "Entrevista técnica",
  RECRUITER_REJECTED: "Rechazado (técnico)", ADMIN_SHORTLIST: "Entrevista admin",
  ADMIN_REJECTED: "Rechazado (admin)", SUPERADMIN_SHORTLIST: "Oferta",
  SUPERADMIN_REJECTED: "Rechazado (dir.)", APPROVED: "Contratado",
};

export default function RecruitingPage() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "recruiting"), [user]);
  const token = user?.token ?? "";

  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    const p = user.permissions ?? [];
    return p.includes("cvs.manage") || p.includes("cvs.admin.review") || p.includes("console.admin");
  }, [user]);

  useEffect(() => {
    if (user && !hasAccess) router.replace("/ops/dashboard");
  }, [user, hasAccess, router]);

  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  // drag state
  const dragging = useRef<Candidate | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("Ingeniero de Campo");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("cvs", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar candidatos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const move = async (c: Candidate, stage: string) => {
    if (!token) return;
    setItems(prev => prev.map(i => i.id === c.id ? { ...i, stage } : i));
    try {
      await apiFetch(`cvs/${c.id}/move`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al mover candidato");
      setItems(prev => prev.map(i => i.id === c.id ? { ...i, stage: c.stage } : i)); // rollback
    }
  };

  const submit = async () => {
    if (!token || !name || !category || !file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("fullName", name);
      fd.append("category", category);
      if (email) fd.append("email", email);
      fd.append("file", file);
      await apiFetch("cvs", token, { method: "POST", body: fd });
      setShowForm(false); setName(""); setEmail(""); setFile(null);
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar candidato");
    } finally { setSaving(false); }
  };

  // columns = active stages only; rejected shown separately if toggled
  const rejected = useMemo(() => items.filter(c => c.stage.endsWith("REJECTED")), [items]);
  const byStage = useMemo(() => {
    const m: Record<string, Candidate[]> = {};
    for (const s of STAGES) m[s.key] = [];
    for (const c of items) if (!c.stage.endsWith("REJECTED") && m[c.stage]) m[c.stage].push(c);
    return m;
  }, [items]);

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Reclutamiento técnico"
        title="Pipeline de reclutamiento"
        subtitle={`${items.length - rejected.length} candidatos activos · ${rejected.length} rechazados`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <Button variant="ghost" onClick={() => setShowRejected(v => !v)}>
              {showRejected ? "Ocultar rechazados" : `Ver rechazados (${rejected.length})`}
            </Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>
                Nuevo candidato
              </Button>
            )}
          </div>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando banco de CVs." />}
      {!loading && error && (
        <EmptyState icon="⚠️" title="No se pudo cargar" description={error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
      )}

      {/* ── Kanban board ── */}
      {!loading && !error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))`,
            gap: 12,
            overflowX: "auto",
            paddingBottom: 16,
            minWidth: 0,
          }}
        >
          {STAGES.map(({ key, label, color }) => (
            <div
              key={key}
              onDragOver={e => { e.preventDefault(); setOverCol(key); }}
              onDragLeave={() => setOverCol(null)}
              onDrop={e => {
                e.preventDefault();
                setOverCol(null);
                if (dragging.current && dragging.current.stage !== key) {
                  void move(dragging.current, key);
                }
                dragging.current = null;
              }}
              style={{
                background: overCol === key ? "color-mix(in srgb,var(--surface-2) 80%,transparent)" : "var(--surface-2)",
                border: `2px solid ${overCol === key ? color : "var(--border)"}`,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                minHeight: 400,
                transition: "border-color .15s, background .15s",
              }}
            >
              {/* Column header */}
              <div style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, background: color, color: "#fff",
                  borderRadius: 20, padding: "1px 7px", minWidth: 22, textAlign: "center",
                }}>{byStage[key]?.length ?? 0}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {(byStage[key] ?? []).length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0" }}>
                    Sin candidatos
                  </div>
                )}
                {(byStage[key] ?? []).map(c => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => { dragging.current = c; }}
                    onDragEnd={() => { dragging.current = null; setOverCol(null); }}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      cursor: "grab",
                      userSelect: "none",
                      boxShadow: "0 1px 3px rgba(0,0,0,.08)",
                      transition: "box-shadow .1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.14)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.08)")}
                  >
                    {/* Card content */}
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{c.fullName}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 6 }}>
                      {c.category}
                    </div>
                    {(c.email || c.whatsapp) && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
                        {c.email ?? c.whatsapp}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      <button
                        onClick={() => window.open(buildApiUrl(`cvs/${c.id}/preview`), "_blank")}
                        style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer" }}
                      >
                        Ver CV
                      </button>
                      {cfg.canEdit && REJECT_MAP[c.stage] && (
                        <button
                          onClick={() => void move(c, REJECT_MAP[c.stage])}
                          style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, border: "1px solid var(--danger,#ef4444)", background: "transparent", color: "var(--danger,#ef4444)", cursor: "pointer" }}
                        >
                          Rechazar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Rejected section ── */}
      {showRejected && rejected.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
            Candidatos rechazados ({rejected.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {rejected.map(c => (
              <div key={c.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", opacity: 0.7 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.fullName}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{c.category}</div>
                <span style={{ display: "inline-block", marginTop: 6 }}>
                  <Tag variant="danger">{STAGE_LABEL[c.stage] ?? c.stage}</Tag>
                </span>
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <button
                    onClick={() => void move(c, "INBOX")}
                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
                  >
                    Restablecer
                  </button>
                  <button
                    onClick={() => window.open(buildApiUrl(`cvs/${c.id}/preview`), "_blank")}
                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer" }}
                  >
                    Ver CV
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add candidate modal ── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,.24)", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nuevo candidato</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre completo *</span>
                <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Juan García López" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Email</span>
                <input value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="juan@ejemplo.com" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vacante / categoría *</span>
                <input value={category} onChange={e => setCategory(e.target.value)} style={inp} placeholder="Ingeniero de Campo…" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>CV (PDF o imagen) *</span>
                <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={inp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{saveErr}</p>}
              <Button variant="secondary" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !name || !file}>
                {saving ? "Subiendo…" : "Agregar candidato"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
