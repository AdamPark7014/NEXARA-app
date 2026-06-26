"use client";

/**
 * Studio · Editor de contenido del sitio público (/studio/pages)
 * Permite al diseñador editar: Métricas, Servicios, Proceso, Industrias, CTA
 * Guarda en: PUT /api/studio/page-content/:section
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { toast } from "@/components/Toast";
import {
  getPageSection,
  savePageSection,
  DEFAULT_METRICAS,
  DEFAULT_SERVICIOS,
  DEFAULT_PROCESO,
  DEFAULT_INDUSTRIAS,
  DEFAULT_CTA,
  type MetricaItem,
  type ServicioItem,
  type ProcesoItem,
  type CtaContent,
  type HomeSection,
} from "@/lib/page-content-api";

type ActiveTab = "metricas" | "servicios" | "proceso" | "industrias" | "cta";

const TABS: { id: ActiveTab; label: string; section: HomeSection }[] = [
  { id: "metricas",   label: "Metricas",   section: "home_metricas"   },
  { id: "servicios",  label: "Servicios",  section: "home_servicios"  },
  { id: "proceso",    label: "Proceso",    section: "home_proceso"    },
  { id: "industrias", label: "Industrias", section: "home_industrias" },
  { id: "cta",        label: "CTA Final",  section: "home_cta"        },
];

export default function StudioPagesPage() {
  const { user, isContextReady } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "pages"), [user]);
  const token = user?.token ?? "";
  const [activeTab, setActiveTab] = useState<ActiveTab>("metricas");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const [metricas, setMetricas]     = useState<MetricaItem[]>(DEFAULT_METRICAS);
  const [servicios, setServicios]   = useState<ServicioItem[]>(DEFAULT_SERVICIOS);
  const [proceso, setProceso]       = useState<ProcesoItem[]>(DEFAULT_PROCESO);
  const [industrias, setIndustrias] = useState<string[]>(DEFAULT_INDUSTRIAS);
  const [cta, setCta]               = useState<CtaContent>(DEFAULT_CTA);

  const loadAll = useCallback(async () => {
    if (!token) return;
    const [m, s, p, i, c] = await Promise.allSettled([
      getPageSection("home_metricas",   token),
      getPageSection("home_servicios",  token),
      getPageSection("home_proceso",    token),
      getPageSection("home_industrias", token),
      getPageSection("home_cta",        token),
    ]);
    if (m.status === "fulfilled" && m.value?.content?.items) setMetricas(m.value.content.items as MetricaItem[]);
    if (s.status === "fulfilled" && s.value?.content?.items) setServicios(s.value.content.items as ServicioItem[]);
    if (p.status === "fulfilled" && p.value?.content?.items) setProceso(p.value.content.items as ProcesoItem[]);
    if (i.status === "fulfilled" && i.value?.content?.items) setIndustrias(i.value.content.items as string[]);
    if (c.status === "fulfilled" && c.value?.content) setCta(c.value.content as unknown as CtaContent);
  }, [token]);

  useEffect(() => { if (isContextReady && token) loadAll(); }, [isContextReady, token, loadAll]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const tab = TABS.find((t) => t.id === activeTab)!;
      let content: Record<string, unknown>;
      if (activeTab === "metricas")        content = { items: metricas };
      else if (activeTab === "servicios")  content = { items: servicios };
      else if (activeTab === "proceso")    content = { items: proceso };
      else if (activeTab === "industrias") content = { items: industrias };
      else                                 content = cta as unknown as Record<string, unknown>;
      await savePageSection(tab.section, content, token, user?.email ?? undefined);
      const now = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      setLastSaved(now);
      toast.success("Guardado. Cambios visibles en el sitio en ~5 min.");
    } catch (err) {
      toast.error("Error al guardar: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 6,
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.05em", color: "var(--text-tertiary)",
  };
  const inp: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 8,
    border: "1px solid var(--nx-panel-hairline, var(--border))",
    background: "var(--surface-elevated, var(--surface))",
    color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={cfg.subtitle}
        variant="hero"
        meta={
          <>
            <Tag variant="positive" dot>Sitio en produccion</Tag>
            {lastSaved && <Tag variant="neutral">Guardado {lastSaved}</Tag>}
          </>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft="Ver" onClick={() => window.open("/", "_blank")}>
              Ver sitio
            </Button>
            <Button variant="primary" iconLeft="Guardar" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar seccion"}
            </Button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, padding: "0 24px 4px", flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: "1px solid var(--border)",
              background: activeTab === tab.id ? "var(--primary)" : "var(--surface)",
              color: activeTab === tab.id ? "#fff" : "var(--text-primary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "metricas" && (
        <Section title="Metricas" subtitle="Los 4 numeros bajo el hero.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {metricas.map((m, i) => (
              <div key={i} style={card}>
                <label style={lbl}>Valor</label>
                <input style={inp} value={m.value} onChange={(e) => { const n = [...metricas]; n[i] = { ...n[i], value: e.target.value }; setMetricas(n); }} />
                <label style={lbl}>Descripcion</label>
                <input style={inp} value={m.label} onChange={(e) => { const n = [...metricas]; n[i] = { ...n[i], label: e.target.value }; setMetricas(n); }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {activeTab === "servicios" && (
        <Section title="Servicios" subtitle="Las 6 tarjetas de servicios.">
          <div style={{ display: "grid", gap: 14 }}>
            {servicios.map((s, i) => (
              <div key={i} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={lbl}>Badge</label><input style={inp} value={s.badge} onChange={(e) => { const n=[...servicios]; n[i]={...n[i],badge:e.target.value}; setServicios(n); }} /></div>
                <div><label style={lbl}>Titulo</label><input style={inp} value={s.title} onChange={(e) => { const n=[...servicios]; n[i]={...n[i],title:e.target.value}; setServicios(n); }} /></div>
                <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Descripcion</label><textarea style={{ ...inp, minHeight:68, resize:"vertical" }} value={s.text} onChange={(e) => { const n=[...servicios]; n[i]={...n[i],text:e.target.value}; setServicios(n); }} /></div>
                <div style={{ gridColumn:"1/-1" }}><label style={lbl}>URL</label><input style={inp} value={s.href} onChange={(e) => { const n=[...servicios]; n[i]={...n[i],href:e.target.value}; setServicios(n); }} /></div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {activeTab === "proceso" && (
        <Section title="Proceso" subtitle="Los 4 pasos de como trabajamos.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {proceso.map((p, i) => (
              <div key={i} style={card}>
                <label style={lbl}>Numero (ej. 01)</label>
                <input style={inp} value={p.num} onChange={(e) => { const n=[...proceso]; n[i]={...n[i],num:e.target.value}; setProceso(n); }} />
                <label style={lbl}>Titulo</label>
                <input style={inp} value={p.title} onChange={(e) => { const n=[...proceso]; n[i]={...n[i],title:e.target.value}; setProceso(n); }} />
                <label style={lbl}>Descripcion</label>
                <textarea style={{ ...inp, minHeight:64, resize:"vertical" }} value={p.text} onChange={(e) => { const n=[...proceso]; n[i]={...n[i],text:e.target.value}; setProceso(n); }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {activeTab === "industrias" && (
        <Section title="Industrias" subtitle="Los chips de sectores. Un nombre por linea.">
          <textarea
            style={{ ...inp, minHeight:180, resize:"vertical", fontSize:14 }}
            value={industrias.join("\n")}
            onChange={(e) => setIndustrias(e.target.value.split("\n").map((v) => v.trim()).filter(Boolean))}
          />
          <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6 }}>
            {industrias.map((ind) => (
              <span key={ind} style={{ padding:"4px 14px", borderRadius:100, border:"1px solid var(--border)", fontSize:12 }}>{ind}</span>
            ))}
          </div>
        </Section>
      )}

      {activeTab === "cta" && (
        <Section title="CTA Final" subtitle="La banda al final de la pagina.">
          <div style={{ display:"grid", gap:10 }}>
            {(
              [
                ["eyebrow",       "Texto eyebrow"],
                ["title",         "Titulo - parte estatica"],
                ["titleAccent",   "Titulo - parte resaltada"],
                ["text",          "Parrafo"],
                ["primaryLabel",  "Boton primario - texto"],
                ["primaryHref",   "Boton primario - URL"],
                ["secondaryLabel","Boton secundario - texto"],
                ["secondaryHref", "Boton secundario - URL"],
              ] as [keyof CtaContent, string][]
            ).map(([field, label]) => (
              <div key={field} style={card}>
                <label style={lbl}>{label}</label>
                <input style={inp} value={String(cta[field] ?? "")}
                  onChange={(e) => setCta({ ...cta, [field]: e.target.value })} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
