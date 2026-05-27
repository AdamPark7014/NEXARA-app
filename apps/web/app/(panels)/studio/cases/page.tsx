"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

const CASES = [
  { titulo: "Soriana — Mantenimiento POS multi-sucursal", cliente: "Soriana S.A.B.", vertical: "Servicios", impacto: "12 sucursales · 99.98% uptime POS · 18 cámaras monitoreadas 24/7", cover: "🛒", publicado: true },
  { titulo: "UDLA Cholula — Laboratorio de cómputo Fase 1", cliente: "Universidad de las Américas", vertical: "Productos", impacto: "120 laptops Lenovo + 40 monitores Dell + red campus", cover: "🎓", publicado: true },
  { titulo: "TOKS Centro Histórico — Redes y POS llave en mano", cliente: "Operadora TOKS", vertical: "Servicios", impacto: "Cableado estructurado completo + 4 cámaras + 4 POS", cover: "🍴", publicado: true },
  { titulo: "Hotel Camino Real — WiFi 6 en 180 habitaciones", cliente: "Hotel Camino Real Puebla", vertical: "Servicios", impacto: "Cobertura total certificada, gestión centralizada", cover: "🏨", publicado: false },
];

export default function StudioCasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title="Casos de éxito"
        subtitle="Las historias que vendemos: clientes reales, números reales. Aparecen en /casos del sitio público."
        actions={
          <>
            <Button variant="secondary" iconLeft="📋">Plantillas</Button>
            <Button variant="primary" iconLeft="🏆">Nuevo caso</Button>
          </>
        }
      />

      <Section title={`${CASES.length} casos`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          {CASES.map((c, i) => (
            <article
              key={i}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 130,
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 25%, transparent), color-mix(in srgb, var(--accent) 15%, transparent))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 56, position: "relative",
                }}
              >
                {c.cover}
                <div style={{ position: "absolute", top: 10, right: 10 }}>
                  <Tag variant={c.publicado ? "positive" : "warning"}>
                    {c.publicado ? "Publicado" : "Borrador"}
                  </Tag>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <Tag variant={c.vertical === "Servicios" ? "accent" : "neutral"}>{c.vertical}</Tag>
                <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15, marginTop: 8 }}>
                  {c.titulo}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {c.cliente}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.4 }}>
                  {c.impacto}
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
