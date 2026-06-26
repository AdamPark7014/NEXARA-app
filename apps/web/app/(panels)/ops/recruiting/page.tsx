"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
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
  const res = await fetch(buildApiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> ?? {}) } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const STAGES = ["INBOX", "RECRUITER_SHORTLIST", "ADMIN_SHORTLIST", "SUPERADMIN_SHORTLIST", "APPROVED"];
const STAGE_LABEL: Record<string, string> = {
  INBOX: "Postulado", RECRUITER_SHORTLIST: "Entrevista técnica", RECRUITER_REJECTED: "Rechazado (técnico)",
  ADMIN_SHORTLIST: "Entrevista admin", ADMIN_REJECTED: "Rechazado (admin)",
  SUPERADMIN_SHORTLIST: "Oferta", SUPERADMIN_REJECTED: "Rechazado (dirección)", APPROVED: "Contratado",
};

export default function RecruitingPage() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "recruiting"), [user]);
  const token = user?.token ?? "";

  // Only RH, HR managers, and OPS directors have access to recruiting
  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    const p = user.permissions ?? [];
    return (
      p.includes("cvs.manage") ||
      p.includes("cvs.admin.review") ||
      p.includes("console.admin")
    );
  }, [user]);

  useEffect(() => {
    if (user && !hasAccess) {
      router.replace("/ops/dashboard");
    }
  }, [user, hasAccess, router]);

  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("Ingeniero de Campo");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

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

  const counts = STAGES.reduce((acc, s) => ({ ...acc, [s]: items.filter((c) => c.stage === s).length }), {} as Record<string, number>);

  const move = async (c: Candidate, stage: string) => {
    if (!token) return;
    try {
      await apiFetch(`cvs/${c.id}/move`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
      setItems((prev) => prev.map((i) => (i.id === c.id ? { ...i, stage } : i)));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
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
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const stageVariant = (s: string): "positive" | "warning" | "danger" | "accent" | "default" => {
    if (s === "APPROVED") return "positive";
    if (s.endsWith("REJECTED")) return "danger";
    if (s === "INBOX") return "default";
    return "accent";
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<Candidate>[] = [
    {
      key: "fullName", label: "Candidato",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.fullName}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.category} · {c.email ?? c.whatsapp ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "stage", label: "Etapa",
      render: (c) => !c.stage.endsWith("REJECTED") ? (
        <select value={c.stage} onChange={(e) => void move(c, e.target.value)} style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)" }}>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      ) : <Tag variant="danger">{STAGE_LABEL[c.stage]}</Tag>,
      width: 180,
    },
    {
      key: "acciones" as keyof Candidate, label: "",
      render: (c) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); window.open(buildApiUrl(`cvs/${c.id}/preview`), "_blank"); }}>Ver CV</Button>
          {cfg.canEdit && !c.stage.endsWith("REJECTED") && c.stage !== "APPROVED" && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void move(c, `${c.stage.split("_")[0]}_REJECTED`.replace("INBOX_REJECTED", "RECRUITER_REJECTED")); }}>Rechazar</Button>
          )}
        </div>
      ),
      width: 180,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Reclutamiento técnico"
        title="Reclutamiento técnico"
        subtitle="Pipeline de candidatos: postulado → entrevista técnica → entrevista admin → oferta → contratado."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo candidato</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {STAGES.map((s) => <KpiCard key={s} label={STAGE_LABEL[s]} value={counts[s] ?? 0} />)}
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} candidatos`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando banco de CVs." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(c) => c.id} emptyTitle="Sin candidatos" emptyDescription="Sube el primer CV al banco de candidatos." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nuevo candidato</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre completo</span>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vacante / categoría</span>
                <input value={category} onChange={(e) => setCategory(e.target.value)} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>CV (PDF o imagen)</span>
                <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !name || !file}>{saving ? "Subiendo…" : "Agregar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
