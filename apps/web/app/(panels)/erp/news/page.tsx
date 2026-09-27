"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import MetricStrip from "@/components/ui/MetricStrip";
import PanelTabs from "@/components/ui/PanelTabs";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { FormField, FormGrid } from "@/components/ui/FormField";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { toast } from "@/components/Toast";
import s from "./news.module.css";

type Tab = "comunicados" | "newsletter";

interface Comunicado {
  id: number;
  titulo: string;
  cuerpo?: string;
  audiencia: string;
  prioridad: string;
  estado: string;
  lecturas: number;
  totalDestinatarios: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  autor?: { id: number; nombre: string };
}

interface NewsletterSubscriber {
  id: number;
  email: string;
  name?: string | null;
  source?: string | null;
  subscribedAt: string;
}

const ESTADOS = ["Borrador", "Programado", "Enviado"] as const;
const PRIORIDADES = ["Normal", "Alta", "Crítica"] as const;
const AUDIENCIAS = ["Todo NEXARA", "Comercial", "Operaciones", "Ingeniería", "NOC", "Administración", "Dirección"];

const ESTADO_VARIANT: Record<string, "neutral" | "warning" | "positive"> = {
  Borrador: "neutral", Programado: "warning", Enviado: "positive",
};
const PRIORIDAD_VARIANT: Record<string, "neutral" | "warning" | "danger"> = {
  Normal: "neutral", Alta: "warning", Crítica: "danger",
};

const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmt = (f: Intl.DateTimeFormat, iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : f.format(d);
};

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const EMPTY_FORM = { titulo: "", cuerpo: "", audiencia: "Todo NEXARA", prioridad: "Normal", estado: "Borrador", scheduledAt: "" };
type FormState = typeof EMPTY_FORM;

export default function ComunicacionesInternasPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "news"), [user]);
  const token = user?.token ?? "";

  const [tab, setTab] = useState<Tab>("comunicados");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [items, setItems] = useState<Comunicado[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Comunicado | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formDirty, setFormDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [subs, setSubs] = useState<NewsletterSubscriber[] | null>(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [comSearch, setComSearch] = useState("");
  const [comEstado, setComEstado] = useState("");
  const [comPrioridad, setComPrioridad] = useState("");

  const loadSubs = useCallback(async (q: string) => {
    if (!token) return;
    setSubsLoading(true);
    setSubsErr(null);
    try {
      const qs = q ? `?search=${encodeURIComponent(q)}` : "";
      const data = await apiFetch(`newsletter${qs}`, token);
      setSubs(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setSubsErr(formatApiError(e, "No pudimos cargar la lista de suscriptores."));
    } finally {
      setSubsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab !== "newsletter") return;
    const t = window.setTimeout(() => void loadSubs(subSearch.trim()), subSearch ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [tab, subSearch, loadSubs]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("internal-comunicados?limit=50", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(formatApiError(e, "No pudimos cargar los comunicados."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (next: FormState, target: Comunicado | null) => {
    setEditing(target);
    setForm(next);
    setFormDirty(false);
    setFormError(null);
    setShowForm(true);
  };

  const openNew = () => openForm({ ...EMPTY_FORM }, null);

  const openEdit = async (c: Comunicado) => {
    openForm(
      { titulo: c.titulo, cuerpo: "", audiencia: c.audiencia, prioridad: c.prioridad, estado: c.estado, scheduledAt: c.scheduledAt?.slice(0, 16) ?? "" },
      c,
    );
    try {
      const full = (await apiFetch(`internal-comunicados/${c.id}`, token)) as Comunicado & { cuerpo?: string };
      setForm({
        titulo: full.titulo ?? c.titulo,
        cuerpo: full.cuerpo ?? "",
        audiencia: full.audiencia ?? c.audiencia,
        prioridad: full.prioridad ?? c.prioridad,
        estado: full.estado ?? c.estado,
        scheduledAt: full.scheduledAt?.slice(0, 16) ?? "",
      });
    } catch (e) {
      setFormError(`No pudimos cargar el texto completo. ${formatApiError(e, "")}`.trim());
    }
  };

  const save = async () => {
    if (!form.titulo.trim() || !form.audiencia) {
      setFormError("Escribe un título y elige a quién va dirigido.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.scheduledAt) delete body.scheduledAt;
      else body.scheduledAt = new Date(form.scheduledAt).toISOString();
      if (editing) {
        const updated = await apiFetch(`internal-comunicados/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        setItems((prev) => prev?.map((c) => (c.id === editing.id ? { ...c, ...updated } : c)) ?? prev);
        toast.success("Comunicado actualizado.");
      } else {
        const created = await apiFetch("internal-comunicados", token, { method: "POST", body: JSON.stringify(body) });
        setItems((prev) => [created, ...(prev ?? [])]);
        toast.success("Comunicado creado.");
      }
      setShowForm(false);
    } catch (e: unknown) {
      setFormError(formatApiError(e, "No se pudo guardar. Intenta de nuevo."));
    } finally {
      setSaving(false);
    }
  };

  const enviar = (c: Comunicado) => {
    setConfirmState({
      message: `¿Enviar «${c.titulo}» ahora a ${c.audiencia}?`,
      confirmLabel: "Enviar ahora",
      fn: async () => {
        try {
          const updated = await apiFetch(`internal-comunicados/${c.id}/enviar`, token, { method: "PATCH" });
          setItems((prev) => prev?.map((x) => (x.id === c.id ? { ...x, ...updated } : x)) ?? prev);
          toast.success("Comunicado enviado.");
        } catch (e: unknown) {
          toast.error(`No se pudo enviar. ${formatApiError(e, "")}`.trim());
        }
      },
    });
  };

  const remove = (c: Comunicado) => {
    setConfirmState({
      message: `¿Eliminar «${c.titulo}»? Esta acción no se puede deshacer.`,
      fn: async () => {
        try {
          await apiFetch(`internal-comunicados/${c.id}`, token, { method: "DELETE" });
          setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
        } catch (e: unknown) {
          toast.error(`No se pudo eliminar. ${formatApiError(e, "")}`.trim());
        }
      },
    });
  };

  const field = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFormDirty(true);
  };

  const rows = useMemo(() => items ?? [], [items]);

  const visibleComunicados = useMemo(() => {
    const q = comSearch.trim().toLowerCase();
    return rows.filter((c) =>
      (!q || c.titulo.toLowerCase().includes(q) || (c.audiencia ?? "").toLowerCase().includes(q) || (c.autor?.nombre ?? "").toLowerCase().includes(q)) &&
      (!comEstado || c.estado === comEstado) &&
      (!comPrioridad || c.prioridad === comPrioridad),
    );
  }, [rows, comSearch, comEstado, comPrioridad]);

  const stats = useMemo(() => {
    const out = { enviados: 0, programados: 0, borradores: 0, lecturas: 0 };
    for (const c of rows) {
      if (c.estado === "Enviado") out.enviados++;
      else if (c.estado === "Programado") out.programados++;
      else if (c.estado === "Borrador") out.borradores++;
      out.lecturas += c.lecturas;
    }
    return out;
  }, [rows]);

  const columns: Column<Comunicado>[] = [
    { key: "titulo", label: "Título", render: (c) => <span className={s.title}>{c.titulo}</span> },
    { key: "audiencia", label: "Para", render: (c) => <Tag variant="neutral">{c.audiencia}</Tag>, width: 150 },
    { key: "autor", label: "Autor", accessor: (c) => c.autor?.nombre ?? "—", width: 140 },
    { key: "prioridad", label: "Prioridad", render: (c) => <Tag variant={PRIORIDAD_VARIANT[c.prioridad] ?? "neutral"}>{c.prioridad}</Tag>, width: 100 },
    { key: "estado", label: "Estado", render: (c) => <Tag variant={ESTADO_VARIANT[c.estado] ?? "neutral"}>{c.estado}</Tag>, width: 110 },
    {
      key: "sentAt",
      label: "Fecha",
      width: 140,
      render: (c) => (
        <span className={s.muted}>
          {c.estado === "Enviado" ? fmt(dateFmt, c.sentAt ?? c.createdAt) : c.scheduledAt ? `Sale ${fmt(dateTimeFmt, c.scheduledAt)}` : fmt(dateFmt, c.createdAt)}
        </span>
      ),
    },
    {
      key: "lecturas",
      label: "Leído por",
      width: 100,
      align: "right" as const,
      render: (c) => (
        <span className={s.muted}>
          {c.estado === "Enviado" ? `${c.lecturas.toLocaleString("es-MX")} de ${c.totalDestinatarios.toLocaleString("es-MX")}` : "—"}
        </span>
      ),
    },
    {
      key: "id",
      label: "",
      width: 150,
      render: (c) => (
        <div className={s.rowActions}>
          {c.estado !== "Enviado" && cfg.canApprove && (
            <Button size="sm" variant="secondary" onClick={() => enviar(c)}>Enviar</Button>
          )}
          {cfg.canEdit && (
            <button type="button" className={s.iconBtn} onClick={() => void openEdit(c)} title="Editar" aria-label={`Editar ${c.titulo}`}>
              <span aria-hidden="true">✎</span>
            </button>
          )}
          {cfg.canDelete && (
            <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} onClick={() => remove(c)} title="Eliminar" aria-label={`Eliminar ${c.titulo}`}>
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  const subColumns = useMemo<Column<NewsletterSubscriber>[]>(() => [
    { key: "email", label: "Correo", width: 240 },
    { key: "name", label: "Nombre", accessor: (x) => x.name ?? "—" },
    { key: "source", label: "Origen", render: (x) => <Tag variant="neutral">{x.source ?? "Sitio web"}</Tag>, width: 130 },
    { key: "subscribedAt", label: "Desde", render: (x) => <span className={s.muted}>{fmt(dateFmt, x.subscribedAt)}</span>, width: 130 },
  ], []);

  return (
    <>
      <PageHeader
        eyebrow="Hoy"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="📣" onClick={openNew}>Nuevo comunicado</Button> : undefined}
      />

      {items !== null && (
        <div className={s.metrics}>
          <MetricStrip
            ariaLabel="Resumen de comunicados"
            metrics={[
              { label: "enviados", value: stats.enviados, tone: "success", onClick: () => { setTab("comunicados"); setComEstado("Enviado"); } },
              { label: "programados", value: stats.programados, hint: "por salir", onClick: () => { setTab("comunicados"); setComEstado("Programado"); } },
              { label: "borradores", value: stats.borradores, hint: "en edición", onClick: () => { setTab("comunicados"); setComEstado("Borrador"); } },
              { label: "lecturas", value: stats.lecturas.toLocaleString("es-MX"), hint: "de todos los comunicados" },
            ]}
          />
        </div>
      )}

      <PanelTabs
        ariaLabel="Secciones de comunicación"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "comunicados", label: "📣 Comunicados", badge: items?.length || undefined },
          { key: "newsletter", label: "📰 Boletín", badge: subs?.length || undefined },
        ]}
      />

      {tab === "comunicados" ? (
        <Section title="Comunicados internos" subtitle="Avisos para el equipo. Usa «Enviar» para mandarlos al momento.">
          {error && (
            <InlineAlert
              variant={items ? "warning" : "danger"}
              message={items ? `No pudimos actualizar; mostramos la última versión. ${error}` : error}
              action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
            />
          )}
          <FilterToolbar
            search={{ value: comSearch, onChange: setComSearch, placeholder: "Buscar por título, destinatarios o autor…" }}
            selects={[
              { label: "Estado", value: comEstado, onChange: setComEstado, options: ESTADOS.map((v) => ({ value: v, label: v })), allowAll: true, allLabel: "Todos los estados" },
              { label: "Prioridad", value: comPrioridad, onChange: setComPrioridad, options: PRIORIDADES.map((v) => ({ value: v, label: v })), allowAll: true, allLabel: "Todas las prioridades" },
            ]}
            onClear={() => { setComSearch(""); setComEstado(""); setComPrioridad(""); }}
            resultCount={items === null ? null : visibleComunicados.length}
            rightActions={rows.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleComunicados, [
                { key: "titulo", label: "Título" },
                { key: "audiencia", label: "Para" },
                { key: "prioridad", label: "Prioridad" },
                { key: "estado", label: "Estado" },
                { key: "lecturas", label: "Lecturas" },
                { key: "autor", label: "Autor", format: (v) => (v as Comunicado["autor"])?.nombre ?? "—" },
                { key: "sentAt", label: "Enviado", format: (v) => (v ? fmt(dateFmt, String(v)) : "—") },
              ], "comunicados-internos")}>Excel</Button>
            ) : undefined}
          />
          {items === null && loading ? (
            <div className={s.skeleton} aria-busy="true" aria-label="Cargando comunicados" />
          ) : (
            <DataTable
              columns={columns}
              rows={visibleComunicados}
              rowKey={(c) => c.id}
              emptyTitle={rows.length > 0 ? "Sin coincidencias" : "Aún no hay comunicados"}
              emptyDescription={rows.length > 0 ? "Prueba con otra búsqueda o quita los filtros." : cfg.canCreate ? "Crea el primero con «Nuevo comunicado»." : "Cuando haya avisos para el equipo aparecerán aquí."}
            />
          )}
        </Section>
      ) : (
        <Section title="Suscriptores del boletín" subtitle="Personas registradas desde el formulario del sitio web. Exporta la lista para tu próximo envío.">
          <FilterToolbar
            search={{ value: subSearch, onChange: setSubSearch, placeholder: "Buscar por correo o nombre…" }}
            onClear={() => setSubSearch("")}
            resultCount={subs === null ? null : subs.length}
            rightActions={subs && subs.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(subs, [
                { key: "email", label: "Correo" },
                { key: "name", label: "Nombre", format: (v) => (v ? String(v) : "—") },
                { key: "source", label: "Origen", format: (v) => (v ? String(v) : "Sitio web") },
                { key: "subscribedAt", label: "Desde", format: (v) => fmt(dateFmt, String(v)) },
              ], "suscriptores-boletin")}>Excel</Button>
            ) : undefined}
          />
          {subsErr && (
            <InlineAlert
              variant="danger"
              message={subsErr}
              action={<Button size="sm" variant="secondary" onClick={() => void loadSubs(subSearch.trim())}>Reintentar</Button>}
            />
          )}
          {subs === null && subsLoading ? (
            <div className={s.skeleton} aria-busy="true" aria-label="Cargando suscriptores" />
          ) : (
            <DataTable
              columns={subColumns}
              rows={subs ?? []}
              rowKey={(x) => x.id}
              emptyTitle={subSearch ? "Sin coincidencias" : "Sin suscriptores"}
              emptyDescription={subSearch ? "Nadie coincide con esa búsqueda." : "Aún nadie se ha registrado desde el sitio web."}
            />
          )}
        </Section>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar comunicado" : "Nuevo comunicado"}
        dirty={formDirty && !saving}
        maxWidth={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving}>
              {editing ? "Guardar cambios" : "Crear comunicado"}
            </Button>
          </>
        }
      >
        {formError && <InlineAlert variant="danger" message={formError} />}
        <FormGrid>
          <FormField label="Título" fullWidth>
            <input className={s.input} value={form.titulo} onChange={field("titulo")} placeholder="Ej. Nueva política de viáticos" required />
          </FormField>
          <FormField label="Para">
            <select className={s.input} value={form.audiencia} onChange={field("audiencia")}>
              {AUDIENCIAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </FormField>
          <FormField label="Prioridad">
            <select className={s.input} value={form.prioridad} onChange={field("prioridad")}>
              {PRIORIDADES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </FormField>
          <FormField label="Programar envío" optional hint="Déjalo vacío para enviarlo manualmente." fullWidth>
            <input type="datetime-local" className={s.input} value={form.scheduledAt} onChange={field("scheduledAt")} />
          </FormField>
          <FormField label="Mensaje" fullWidth>
            <textarea className={`${s.input} ${s.textarea}`} value={form.cuerpo} onChange={field("cuerpo")} placeholder="Escribe el comunicado…" />
          </FormField>
        </FormGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
