"use client";

/**
 * Studio · Editor de contenido del sitio público (/studio/pages)
 * Permite al diseñador editar:
 * - Textos: Métricas, Servicios, Proceso, Industrias, CTA
 * - Imágenes: hero y slots de Inicio, Servicios, Soluciones, Nosotros, Contacto
 * Guarda en: PUT /api/studio/page-content/:section
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import KpiCard from "@/components/ui/KpiCard";
import StudioFileInput from "@/components/studio/StudioFileInput";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { toast } from "@/components/Toast";
import {
  STUDIO_IMAGE_SPECS,
  studioImageHintLine,
} from "@/lib/studio-image-specs";
import {
  getPageSection,
  savePageSection,
  uploadPageMedia,
  resolvePageMediaUrl,
  mergePageVisuals,
  DEFAULT_METRICAS,
  DEFAULT_SERVICIOS,
  DEFAULT_PROCESO,
  DEFAULT_INDUSTRIAS,
  DEFAULT_CTA,
  DEFAULT_PAGE_VISUALS,
  PAGE_IMAGE_LAYOUTS,
  PAGE_IMAGE_LAYOUT_OPTIONS,
  type MetricaItem,
  type ServicioItem,
  type ProcesoItem,
  type CtaContent,
  type HomeSection,
  type PageVisualSection,
  type PageVisualsContent,
  type PageImageSlot,
  type PageImageLayout,
  type PageImagePosition,
} from "@/lib/page-content-api";

type EditorMode = "textos" | "imagenes";
type ActiveTextTab = "metricas" | "servicios" | "proceso" | "industrias" | "cta";

const TEXT_TABS: { id: ActiveTextTab; label: string; section: HomeSection }[] = [
  { id: "metricas",   label: "Metricas",   section: "home_metricas"   },
  { id: "servicios",  label: "Servicios",  section: "home_servicios"  },
  { id: "proceso",    label: "Proceso",    section: "home_proceso"    },
  { id: "industrias", label: "Industrias", section: "home_industrias" },
  { id: "cta",        label: "CTA Final",  section: "home_cta"        },
];

const VISUAL_TABS: { id: PageVisualSection; label: string; path: string }[] = [
  { id: "page_home",      label: "Inicio",     path: "/"          },
  { id: "page_servicios", label: "Servicios",  path: "/servicios" },
  { id: "page_soluciones",label: "Soluciones", path: "/soluciones"},
  { id: "page_nosotros",  label: "Nosotros",   path: "/nosotros"  },
  { id: "page_contacto",  label: "Contacto",   path: "/contacto"  },
];

const PAGE_VISUAL_SECTIONS: PageVisualSection[] = VISUAL_TABS.map((t) => t.id);

function newSlotId(): string {
  return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function ImagePreview({ url, alt }: { url: string; alt?: string }) {
  const src = resolvePageMediaUrl(url);
  if (!src) return null;
  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "var(--surface-elevated, var(--surface))",
        maxWidth: 360,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || "Vista previa"}
        style={{ display: "block", width: "100%", maxHeight: 200, objectFit: "cover" }}
      />
    </div>
  );
}

export default function StudioPagesPage() {
  const { user, isContextReady } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "pages"), [user]);
  const token = user?.token ?? "";

  const [mode, setMode] = useState<EditorMode>("textos");
  const [activeTextTab, setActiveTextTab] = useState<ActiveTextTab>("metricas");
  const [activeVisualTab, setActiveVisualTab] = useState<PageVisualSection>("page_home");
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const [metricas, setMetricas]     = useState<MetricaItem[]>(DEFAULT_METRICAS);
  const [servicios, setServicios]   = useState<ServicioItem[]>(DEFAULT_SERVICIOS);
  const [proceso, setProceso]       = useState<ProcesoItem[]>(DEFAULT_PROCESO);
  const [industrias, setIndustrias] = useState<string[]>(DEFAULT_INDUSTRIAS);
  const [cta, setCta]               = useState<CtaContent>(DEFAULT_CTA);
  const [visuals, setVisuals]       = useState<Record<PageVisualSection, PageVisualsContent>>(
    () => structuredClone(DEFAULT_PAGE_VISUALS),
  );

  const activeVisual = visuals[activeVisualTab];
  const activeVisualMeta = VISUAL_TABS.find((t) => t.id === activeVisualTab)!;

  const loadTextContent = useCallback(async () => {
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

  const loadVisualContent = useCallback(async () => {
    if (!token) return;
    const results = await Promise.allSettled(
      PAGE_VISUAL_SECTIONS.map((section) => getPageSection(section, token)),
    );
    setVisuals((prev) => {
      const next = { ...prev };
      PAGE_VISUAL_SECTIONS.forEach((section, idx) => {
        const row = results[idx];
        const stored =
          row.status === "fulfilled" && row.value?.content
            ? (row.value.content as Partial<PageVisualsContent>)
            : null;
        next[section] = mergePageVisuals(section, stored);
      });
      return next;
    });
  }, [token]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadTextContent(), loadVisualContent()]);
  }, [loadTextContent, loadVisualContent]);

  useEffect(() => {
    if (isContextReady && token) loadAll();
  }, [isContextReady, token, loadAll]);

  const patchVisuals = (section: PageVisualSection, patch: Partial<PageVisualsContent>) => {
    setVisuals((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  };

  const updateSlot = (section: PageVisualSection, index: number, patch: Partial<PageImageSlot>) => {
    setVisuals((prev) => {
      const slots = [...prev[section].slots];
      slots[index] = { ...slots[index], ...patch };
      return { ...prev, [section]: { ...prev[section], slots } };
    });
  };

  const handleUpload = async (
    key: string,
    file: File | null,
    onUrl: (url: string) => void,
  ) => {
    if (!file) return;
    if (!token) {
      toast.error("Sesión no válida.");
      return;
    }
    setUploadingKey(key);
    try {
      const { url } = await uploadPageMedia(token, file);
      onUrl(url);
      toast.success("Imagen subida.");
    } catch (err) {
      toast.error("Error al subir: " + (err as Error).message);
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (mode === "textos") {
        const tab = TEXT_TABS.find((t) => t.id === activeTextTab)!;
        let content: Record<string, unknown>;
        if (activeTextTab === "metricas")        content = { items: metricas };
        else if (activeTextTab === "servicios")  content = { items: servicios };
        else if (activeTextTab === "proceso")    content = { items: proceso };
        else if (activeTextTab === "industrias") content = { items: industrias };
        else                                     content = cta as unknown as Record<string, unknown>;
        await savePageSection(tab.section, content, token, user?.email ?? undefined);
      } else {
        const content = visuals[activeVisualTab] as unknown as Record<string, unknown>;
        await savePageSection(activeVisualTab, content, token, user?.email ?? undefined);
      }
      const now = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      setLastSaved(now);
      toast.success("Guardado. Cambios visibles en el sitio en ~5 min.");
    } catch (err) {
      toast.error("Error al guardar: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addSlot = () => {
    const slot: PageImageSlot = {
      id: newSlotId(),
      label: "Nuevo slot de imagen",
      desktopUrl: "",
      mobileUrl: "",
      alt: "",
      caption: "",
      layout: "framed_wide",
      objectPosition: "center",
    };
    patchVisuals(activeVisualTab, { slots: [...activeVisual.slots, slot] });
  };

  const removeSlot = (index: number) => {
    patchVisuals(activeVisualTab, {
      slots: activeVisual.slots.filter((_, i) => i !== index),
    });
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
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", borderRadius: 8,
    border: "1px solid var(--border)",
    background: active ? "var(--primary)" : "var(--surface)",
    color: active ? "#fff" : "var(--text-primary)",
    fontSize: 13, fontWeight: 500, cursor: "pointer",
  });
  const modeBtn = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px", borderRadius: 10,
    border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
    background: active ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
    color: active ? "var(--primary)" : "var(--text-primary)",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  });

  const totalVisualSlots = PAGE_VISUAL_SECTIONS.reduce(
    (sum, section) => sum + visuals[section].slots.length,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={
          mode === "textos"
            ? cfg.subtitle
            : "Hero y bandas visuales de las páginas públicas. Sube variantes desktop (≥768 px) y móvil (<768 px) cuando quieras un encuadre distinto."
        }
        variant="hero"
        meta={
          <>
            <Tag variant="positive" dot>Sitio en produccion</Tag>
            {lastSaved && <Tag variant="neutral">Guardado {lastSaved}</Tag>}
            {uploadingKey && <Tag variant="neutral">Subiendo imagen…</Tag>}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              iconLeft="Ver"
              onClick={() =>
                window.open(mode === "imagenes" ? activeVisualMeta.path : "/", "_blank")
              }
            >
              Ver pagina
            </Button>
            <Button variant="primary" iconLeft="Guardar" onClick={handleSave} disabled={saving || !!uploadingKey}>
              {saving ? "Guardando..." : "Guardar seccion"}
            </Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 16 }}>
        {mode === "textos" ? (
          <>
            <KpiCard label="Secciones de texto" value={TEXT_TABS.length} icon="📄" variant="accent" hint="Bloques editables" />
            <KpiCard label="Métricas" value={metricas.length} icon="📊" hint="Números bajo el hero" />
            <KpiCard label="Servicios" value={servicios.length} icon="⚙️" hint="Tarjetas de servicios" />
            <KpiCard label="Pasos del proceso" value={proceso.length} icon="🔢" hint="Flujo de trabajo" />
          </>
        ) : (
          <>
            <KpiCard label="Páginas visuales" value={VISUAL_TABS.length} icon="🖼️" variant="accent" hint="Hero + slots" />
            <KpiCard label="Slots en esta página" value={activeVisual.slots.length} icon="📷" hint={activeVisualMeta.label} />
            <KpiCard label="Slots totales" value={totalVisualSlots} icon="🗂️" hint="En las 5 páginas" />
            <KpiCard
              label="Hero desktop"
              value={activeVisual.heroDesktopUrl ? "✓" : "—"}
              icon="🖥️"
              hint={studioImageHintLine(STUDIO_IMAGE_SPECS.pageHeroDesktop)}
            />
          </>
        )}
      </div>

      {mode === "textos" && (() => {
        const sections = [
          { label: "Métricas", count: metricas.length, color: "var(--primary)" },
          { label: "Servicios", count: servicios.length, color: "var(--success)" },
          { label: "Proceso", count: proceso.length, color: "var(--warning)" },
          { label: "Industrias", count: industrias.length, color: "#a855f7" },
        ];
        const total = sections.reduce((s, r) => s + r.count, 0);
        if (total === 0) return null;
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Elementos por sección</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {sections.filter((r) => r.count > 0).map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.count / Math.max(...sections.map((s) => s.count))) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 8, padding: "0 24px 12px", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setMode("textos")} style={modeBtn(mode === "textos")}>
          Textos
        </button>
        <button type="button" onClick={() => setMode("imagenes")} style={modeBtn(mode === "imagenes")}>
          Imágenes
        </button>
      </div>

      {mode === "textos" && (
        <div style={{ display: "flex", gap: 8, padding: "0 24px 4px", flexWrap: "wrap" }}>
          {TEXT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTextTab(tab.id)}
              style={tabBtn(activeTextTab === tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {mode === "imagenes" && (
        <div style={{ display: "flex", gap: 8, padding: "0 24px 4px", flexWrap: "wrap" }}>
          {VISUAL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveVisualTab(tab.id)}
              style={tabBtn(activeVisualTab === tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {mode === "textos" && activeTextTab === "metricas" && (
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

      {mode === "textos" && activeTextTab === "servicios" && (
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

      {mode === "textos" && activeTextTab === "proceso" && (
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

      {mode === "textos" && activeTextTab === "industrias" && (
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

      {mode === "textos" && activeTextTab === "cta" && (
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

      {mode === "imagenes" && (
        <Section
          title={`Imágenes · ${activeVisualMeta.label}`}
          subtitle={`Página ${activeVisualMeta.path}. Desktop = pantallas anchas (≥768 px). Móvil = teléfonos (<768 px); si dejas móvil vacío, el sitio reutiliza la imagen desktop.`}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...card, gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Hero de página</div>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Imagen full-bleed al inicio de la página. Sube o pega la URL de la variante <strong>desktop</strong> (horizontal, 16:9)
                y, si quieres otro encuadre en teléfono, la variante <strong>móvil</strong> (más vertical).
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                <div>
                  <label style={lbl}>Hero desktop · URL</label>
                  <input
                    style={inp}
                    value={activeVisual.heroDesktopUrl}
                    onChange={(e) => patchVisuals(activeVisualTab, { heroDesktopUrl: e.target.value })}
                    placeholder="/images/hero/… o URL del servidor"
                  />
                  <StudioFileInput
                    spec={STUDIO_IMAGE_SPECS.pageHeroDesktop}
                    label="Hero desktop · subir archivo"
                    inputStyle={inp}
                    onChange={(file) =>
                      handleUpload(`${activeVisualTab}-hero-desktop`, file, (url) =>
                        patchVisuals(activeVisualTab, { heroDesktopUrl: url }),
                      )
                    }
                    onError={(msg) => toast.error(msg)}
                  />
                  <ImagePreview url={activeVisual.heroDesktopUrl} alt={activeVisual.heroAlt} />
                </div>

                <div>
                  <label style={lbl}>Hero móvil · URL (opcional)</label>
                  <input
                    style={inp}
                    value={activeVisual.heroMobileUrl}
                    onChange={(e) => patchVisuals(activeVisualTab, { heroMobileUrl: e.target.value })}
                    placeholder="Opcional — si está vacío se usa desktop"
                  />
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 200px" }}>
                      <StudioFileInput
                        spec={STUDIO_IMAGE_SPECS.pageHeroMobile}
                        label="Hero móvil · subir archivo"
                        inputStyle={inp}
                        onChange={(file) =>
                          handleUpload(`${activeVisualTab}-hero-mobile`, file, (url) =>
                            patchVisuals(activeVisualTab, { heroMobileUrl: url }),
                          )
                        }
                        onError={(msg) => toast.error(msg)}
                      />
                    </div>
                    {activeVisual.heroMobileUrl ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => patchVisuals(activeVisualTab, { heroMobileUrl: "" })}
                      >
                        Limpiar móvil
                      </Button>
                    ) : null}
                  </div>
                  <ImagePreview url={activeVisual.heroMobileUrl || activeVisual.heroDesktopUrl} alt={activeVisual.heroAlt} />
                </div>
              </div>

              <div>
                <label style={lbl}>Texto alternativo del hero (alt)</label>
                <input
                  style={inp}
                  value={activeVisual.heroAlt}
                  onChange={(e) => patchVisuals(activeVisualTab, { heroAlt: e.target.value })}
                  placeholder="Descripción breve para accesibilidad y SEO"
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Slots de imagen ({activeVisual.slots.length})</div>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Cada slot tiene layout y medidas distintas. Elige el formato en Studio; el sitio respetará alto, proporciones y acomodo.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={addSlot}>
                Añadir slot
              </Button>
            </div>

            {activeVisual.slots.map((slot, i) => {
              const layoutMeta = PAGE_IMAGE_LAYOUTS[slot.layout] || PAGE_IMAGE_LAYOUTS.framed_wide;
              return (
              <div key={slot.id} style={{ ...card, gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={lbl}>Etiqueta del slot (solo Studio)</label>
                    <input
                      style={inp}
                      value={slot.label}
                      onChange={(e) => updateSlot(activeVisualTab, i, { label: e.target.value })}
                    />
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>ID: {slot.id}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeSlot(i)}>
                    Eliminar slot
                  </Button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={lbl}>Layout / acomodo en página</label>
                    <select
                      style={inp}
                      value={slot.layout}
                      onChange={(e) =>
                        updateSlot(activeVisualTab, i, {
                          layout: e.target.value as PageImageLayout,
                        })
                      }
                    >
                      {PAGE_IMAGE_LAYOUT_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label} · {opt.desktop.ratio}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Encuadre (object-position)</label>
                    <select
                      style={inp}
                      value={slot.objectPosition || "center"}
                      onChange={(e) =>
                        updateSlot(activeVisualTab, i, {
                          objectPosition: e.target.value as PageImagePosition,
                        })
                      }
                    >
                      <option value="center">Centro</option>
                      <option value="left">Izquierda</option>
                      <option value="right">Derecha</option>
                      <option value="top">Arriba</option>
                      <option value="bottom">Abajo</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--surface-2, color-mix(in srgb, var(--primary) 6%, var(--surface)))",
                    border: "1px solid var(--border)",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: "var(--text-secondary)",
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>{layoutMeta.label}</strong>
                  {" — "}
                  {layoutMeta.hint}
                  <br />
                  <span>
                    Desktop recomendado: {layoutMeta.desktop.width}×{layoutMeta.desktop.height}px ({layoutMeta.desktop.ratio})
                    {" · "}
                    Móvil: {layoutMeta.mobile.width}×{layoutMeta.mobile.height}px ({layoutMeta.mobile.ratio})
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  <div>
                    <label style={lbl}>
                      Desktop · URL · {layoutMeta.desktop.width}×{layoutMeta.desktop.height}
                    </label>
                    <input
                      style={inp}
                      value={slot.desktopUrl}
                      onChange={(e) => updateSlot(activeVisualTab, i, { desktopUrl: e.target.value })}
                    />
                    <StudioFileInput
                      spec={{
                        ...STUDIO_IMAGE_SPECS.pageEditorial,
                        label: `Desktop · ${layoutMeta.label}`,
                        width: layoutMeta.desktop.width,
                        height: layoutMeta.desktop.height,
                        ratio: layoutMeta.desktop.ratio,
                        tip: layoutMeta.hint,
                      }}
                      label="Desktop · subir"
                      inputStyle={inp}
                      onChange={(file) =>
                        handleUpload(`${activeVisualTab}-slot-${slot.id}-desktop`, file, (url) =>
                          updateSlot(activeVisualTab, i, { desktopUrl: url }),
                        )
                      }
                      onError={(msg) => toast.error(msg)}
                    />
                    <ImagePreview url={slot.desktopUrl} alt={slot.alt} />
                  </div>

                  <div>
                    <label style={lbl}>
                      Móvil · URL (opcional) · {layoutMeta.mobile.width}×{layoutMeta.mobile.height}
                    </label>
                    <input
                      style={inp}
                      value={slot.mobileUrl}
                      onChange={(e) => updateSlot(activeVisualTab, i, { mobileUrl: e.target.value })}
                      placeholder="Opcional — si está vacío se usa desktop"
                    />
                    <StudioFileInput
                      spec={{
                        ...STUDIO_IMAGE_SPECS.pageEditorial,
                        label: `Móvil · ${layoutMeta.label}`,
                        width: layoutMeta.mobile.width,
                        height: layoutMeta.mobile.height,
                        ratio: layoutMeta.mobile.ratio,
                        tip: "Opcional. Sin móvil se usa la variante desktop.",
                      }}
                      label="Móvil · subir"
                      inputStyle={inp}
                      onChange={(file) =>
                        handleUpload(`${activeVisualTab}-slot-${slot.id}-mobile`, file, (url) =>
                          updateSlot(activeVisualTab, i, { mobileUrl: url }),
                        )
                      }
                      onError={(msg) => toast.error(msg)}
                    />
                    <ImagePreview url={slot.mobileUrl || slot.desktopUrl} alt={slot.alt} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={lbl}>Alt (accesibilidad)</label>
                    <input
                      style={inp}
                      value={slot.alt}
                      onChange={(e) => updateSlot(activeVisualTab, i, { alt: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Pie de foto / caption (opcional)</label>
                    <input
                      style={inp}
                      value={slot.caption}
                      onChange={(e) => updateSlot(activeVisualTab, i, { caption: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              );
            })}

            {activeVisual.slots.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                No hay slots en esta página. Usa «Añadir slot» para crear uno.
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
