"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

const SCHEDULED = [
  { red: "Instagram", emoji: "📷", titulo: "Reel — Instalación CCTV Casa Garza", cuando: "Hoy 18:00", estado: "Programado" },
  { red: "LinkedIn", emoji: "💼", titulo: "Post — Renovación contrato Soriana ✓", cuando: "Mañana 09:00", estado: "Programado" },
  { red: "Facebook", emoji: "📘", titulo: "Carrusel — Catálogo de cámaras 2026", cuando: "+2d 14:00", estado: "Programado" },
  { red: "Instagram", emoji: "📷", titulo: "Stories — Equipo en obra UDLA", cuando: "Hoy 20:00", estado: "Borrador" },
];

export default function StudioSocialPage() {
  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title="Redes sociales"
        subtitle="Calendario editorial, contenido programado y métricas de las cuentas de NEXARA."
        actions={
          <>
            <Button variant="secondary" iconLeft="📊">Métricas</Button>
            <Button variant="primary" iconLeft="✏️">Crear post</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Seguidores totales" value="14.2k" hint="Instagram + LinkedIn + FB" trend={{ direction: "up", value: "+2.1%" }} variant="positive" icon="👥" />
        <KpiCard label="Engagement (mes)" value="6.8%" hint="vs 5.4% mes pasado" trend={{ direction: "up", value: "+1.4pp" }} variant="accent" icon="❤️" />
        <KpiCard label="Posts programados" value={SCHEDULED.filter(s => s.estado === "Programado").length} hint="Próximos 7 días" variant="default" icon="📅" />
        <KpiCard label="Leads desde redes" value="14" hint="Mes actual" variant="positive" icon="🌐" />
      </div>

      <Section title="Calendario editorial" subtitle="Próximas publicaciones">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SCHEDULED.map((s, i) => (
            <article
              key={i}
              style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 16, alignItems: "center",
                padding: 14, background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 28 }}>{s.emoji}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.titulo}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>{s.red}</div>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.cuando}</span>
              <Tag variant={s.estado === "Programado" ? "positive" : "warning"}>{s.estado}</Tag>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
