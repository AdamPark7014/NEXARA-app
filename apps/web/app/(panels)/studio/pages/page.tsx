"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

type SitePage = {
  slug: string;
  titulo: string;
  descripcion: string;
  hero: string;
  estado: "Publicada" | "Borrador" | "En revisión";
  ultimaEdicion: string;
  visitas: string;
};

const PAGES: SitePage[] = [
  { slug: "/", titulo: "Inicio", descripcion: "Hero principal · 3 verticales de negocio · CTA cotización", hero: "🏠", estado: "Publicada", ultimaEdicion: "Hace 12d (Vania S.)", visitas: "4.2k / mes" },
  { slug: "/servicios", titulo: "Servicios", descripcion: "CCTV, redes, cableado, mantenimiento, soporte continuo", hero: "🛠️", estado: "Publicada", ultimaEdicion: "Hace 8d (Vania S.)", visitas: "2.1k / mes" },
  { slug: "/productos", titulo: "Productos", descripcion: "Cámaras, NVR, switches, laptops, pantallas, kits llave en mano", hero: "📦", estado: "Publicada", ultimaEdicion: "Hace 5d (Vania S.)", visitas: "1.8k / mes" },
  { slug: "/casos", titulo: "Casos de éxito", descripcion: "Soriana, TOKS, UDLA, Camino Real", hero: "🏆", estado: "Publicada", ultimaEdicion: "Hace 3d (Vania S.)", visitas: "1.1k / mes" },
  { slug: "/contacto", titulo: "Contacto", descripcion: "Formulario y datos de venta directa", hero: "✉️", estado: "En revisión", ultimaEdicion: "Hoy (Vania S.)", visitas: "780 / mes" },
];

export default function StudioPagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title="Páginas públicas del sitio"
        subtitle="Las 5 secciones que ve el público. Sin login. Diseñador edita aquí; el sitio se publica automático."
        actions={
          <>
            <Button variant="secondary" iconLeft="🌐">Ver sitio público</Button>
            <Button variant="primary" iconLeft="🚀">Publicar todo</Button>
          </>
        }
      />

      <Section title={`${PAGES.length} páginas en producción`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {PAGES.map((p) => (
            <article
              key={p.slug}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                overflow: "hidden",
                cursor: "pointer",
                transition: "transform var(--nx-motion-fast) ease, box-shadow var(--nx-motion-fast) ease",
              }}
            >
              <div
                style={{
                  height: 110,
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 20%, transparent), color-mix(in srgb, var(--accent) 20%, transparent))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 48,
                  position: "relative",
                }}
              >
                {p.hero}
                <div style={{ position: "absolute", top: 10, right: 10 }}>
                  <Tag variant={p.estado === "Publicada" ? "positive" : p.estado === "Borrador" ? "neutral" : "warning"}>
                    {p.estado}
                  </Tag>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>
                  {p.titulo}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, fontFamily: "var(--font-mono, monospace)" }}>
                  nexara.com.mx{p.slug}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {p.descripcion}
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>{p.ultimaEdicion}</span>
                  <span>📊 {p.visitas}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
