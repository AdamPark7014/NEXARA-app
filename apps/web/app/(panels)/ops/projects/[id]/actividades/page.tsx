"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { DetailError } from "@/components/detail/DetailFrame";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { useOpsProjectDetail } from "@/components/ops/OpsProjectDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";

interface AssignableUser { id: number; nombre: string; roleKey?: string | null; }

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

const STATUS_VARIANT: Record<string, "accent" | "positive" | "warning" | "neutral" | "danger"> = {
  COMPLETADA: "positive", EN_CURSO: "accent", PROGRAMADA: "neutral", REPROGRAMAR: "warning", CANCELADA: "danger",
};

export default function OpsProjectActivitiesPage() {
  const { id, project, error, reload } = useOpsProjectDetail();
  const { user } = useUser();
  const token = user?.token ?? "";

  const [showForm, setShowForm] = useState(false);
  const [engineers, setEngineers] = useState<AssignableUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState({ titulo: "", descripcion: "", responsableId: "", branchName: "" });

  const [engineerError, setEngineerError] = useState<string | null>(null);

  const loadEngineers = useCallback(async () => {
    if (!token) return;
    setEngineerError(null);
    try {
      const res = await fetch(buildApiUrl("users/assignable"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setEngineers(await res.json());
    } catch (e) {
      setEngineers([]);
      setEngineerError(e instanceof Error ? e.message : "No se pudieron cargar ingenieros");
    }
  }, [token]);

  useEffect(() => { if (showForm) void loadEngineers(); }, [showForm, loadEngineers]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!project) return null;

  const activities = project.activities ?? [];

  const visibleActivities = useMemo(() => {
    let rows = activities;
    if (filterStatus) rows = rows.filter((a) => a.estatus === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((a) =>
        (a.anNumber ?? "").toLowerCase().includes(q) ||
        (a.titulo ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [activities, searchQ, filterStatus]);

  const submit = async () => {
    if (!token || !form.titulo.trim() || !form.responsableId) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`operational-projects/${id}/activities`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim() || undefined,
          responsableId: Number(form.responsableId),
          branchName: form.branchName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setShowForm(false);
      setForm({ titulo: "", descripcion: "", responsableId: "", branchName: "" });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear actividad");
    } finally { setSaving(false); }
  };

  const completadas = activities.filter((a) => a.estatus === "COMPLETADA" || a.estatus === "COMPLETED" || a.estatus === "DONE").length;
  const enCurso = activities.filter((a) => a.estatus === "EN_CURSO").length;
  const otPct = activities.length > 0 ? Math.round((completadas / activities.length) * 100) : 0;

  return (
    <>
      {activities.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
            <KpiCard label="Completadas" value={completadas} variant={completadas === activities.length ? "positive" : "default"} icon="✅" hint={`${otPct}% del total`} />
            <KpiCard label="En curso" value={enCurso} variant={enCurso > 0 ? "accent" : "default"} icon="⚙️" />
            <KpiCard label="Pendientes" value={activities.filter((a) => a.estatus === "PROGRAMADA").length} icon="📋" />
            <KpiCard label="Total OTs" value={activities.length} icon="📊" />
          </div>
          <div style={{ marginBottom: 16, padding: "8px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avance</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: otPct >= 80 ? "var(--success)" : "var(--primary)" }}>{otPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${otPct}%`, background: otPct >= 100 ? "var(--success)" : "var(--primary)", borderRadius: 3, transition: "width .4s" }} />
            </div>
          </div>
        </>
      )}
    <Section
      title={`${activities.length} actividades vinculadas`}
      actions={
        <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowForm((v) => !v)}>
          Nueva OT
        </Button>
      }
    >
      {/* Create form */}
      {showForm && (
        <div
          style={{
            marginBottom: 20,
            padding: 18,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14 }}>Nueva orden de trabajo</div>
          {engineerError && (
            <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>
              {engineerError}{" "}
              <button type="button" onClick={() => void loadEngineers()} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>
                Reintentar
              </button>
            </p>
          )}
          <label style={{ fontSize: 13 }}>
            Titulo *
            <input
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Instalacion CCTV sucursal norte…"
              style={{ ...inp, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Responsable *
            <select
              value={form.responsableId}
              onChange={(e) => setForm((f) => ({ ...f, responsableId: e.target.value }))}
              style={{ ...inp, marginTop: 4 }}
            >
              <option value="">Seleccionar ingeniero…</option>
              {engineers.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Sucursal (opcional)
            <input
              value={form.branchName}
              onChange={(e) => setForm((f) => ({ ...f, branchName: e.target.value }))}
              placeholder="Sucursal / ubicacion"
              style={{ ...inp, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Descripcion (opcional)
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              placeholder="Detalles de la actividad…"
              style={{ ...inp, marginTop: 4, resize: "vertical" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void submit()}
              disabled={saving || !form.titulo.trim() || !form.responsableId}
            >
              {saving ? "Creando…" : "Crear OT"}
            </Button>
          </div>
        </div>
      )}

      {/* Activities list */}
      {activities.length > 0 && (
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por OT# o título…" }}
          selects={[{
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: Object.entries(STATUS_VARIANT).map(([v]) => ({ value: v, label: v.replace(/_/g, " ") })),
            allowAll: true,
          }]}
          onClear={() => { setSearchQ(""); setFilterStatus(""); }}
          resultCount={visibleActivities.length}
          rightActions={
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleActivities, [
              { key: "anNumber", label: "OT#" },
              { key: "titulo", label: "Título" },
              { key: "estatus", label: "Estado" },
            ], "actividades-proyecto")}>Excel</Button>
          }
        />
      )}
      {activities.length === 0 ? (
        <EmptyState
          icon="🧰"
          title="Sin actividades"
          description="Crea la primera orden de trabajo para este proyecto."
          action={<Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>Nueva OT</Button>}
        />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {visibleActivities.length === 0 && <EmptyState icon="🔍" title="Sin resultados" description="Ajusta los filtros." />}
          {visibleActivities.map((a) => (
            <li
              key={a.id}
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Link
                  href={`/ops/activities/${a.id}`}
                  style={{ color: "var(--primary)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                >
                  {a.anNumber} · {a.titulo}
                </Link>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{a.estatus}</div>
              </div>
              <Tag variant={STATUS_VARIANT[a.estatus] ?? "neutral"}>{a.estatus.replace(/_/g, " ")}</Tag>
            </li>
          ))}
        </ul>
      )}
    </Section>
    </>
  );
}
