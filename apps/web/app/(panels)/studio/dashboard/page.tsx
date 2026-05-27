"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

const PAGES = [
  { name: "Inicio", url: "/", status: "Publicada", lastUpdate: "Hace 4 días", visits: 3240 },
  { name: "Soluciones", url: "/soluciones", status: "Publicada", lastUpdate: "Hace 2 días", visits: 1820 },
  { name: "Casos de éxito", url: "/proyectos", status: "Publicada", lastUpdate: "Ayer", visits: 1410 },
  { name: "Cobertura", url: "/cobertura", status: "Publicada", lastUpdate: "Hace 1 semana", visits: 950 },
  { name: "Contacto", url: "/contacto", status: "Publicada", lastUpdate: "Hace 5 días", visits: 1000 },
];

const POSTS = [
  { red: "LinkedIn", titulo: "Caso de éxito: Soriana 90% uptime POS", fecha: "Mañana 10:00", color: "#0a66c2" },
  { red: "Instagram", titulo: "Reel: instalación CCTV en 90 segundos", fecha: "Mié 12:00", color: "#e1306c" },
  { red: "Facebook", titulo: "Promo NVR + 4 cámaras para casa", fecha: "Jue 18:00", color: "#1877f2" },
  { red: "LinkedIn", titulo: "Tips: Auditoría POS en retail", fecha: "Vie 09:00", color: "#0a66c2" },
];

export default function StudioDashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Marca y marketing"
        title="Construyendo la marca NEXARA"
        subtitle="Sitio público, redes sociales, casos de éxito y captación de leads. Aquí se cuenta la historia que ventas convierte."
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>Sitio en producción</Tag>
            <Tag variant="positive">8,420 visitas / 7d</Tag>
            <Tag variant="neutral">47 leads capturados</Tag>
          </>
        }
        actions={
          <>
            <Link href="/studio/news" style={{ textDecoration: "none" }}>
              <Button variant="secondary" iconLeft="📰">
                Nueva noticia
              </Button>
            </Link>
            <Link href="/studio/cases" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="🏆" iconRight="→">
                Nuevo caso
              </Button>
            </Link>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Visitas (7d)"
          value="8,420"
          hint="+18% vs semana anterior"
          icon="🌐"
          variant="accent"
          trend={{ value: "+18% WoW", direction: "up" }}
          sparkline={[6100, 6800, 7200, 7400, 7900, 8100, 8420]}
        />
        <KpiCard
          label="Leads del sitio"
          value="47"
          hint="32 calificados · 6 perdidos"
          icon="📥"
          variant="positive"
          trend={{ value: "+9 WoW", direction: "up" }}
          sparkline={[28, 32, 35, 38, 41, 44, 47]}
        />
        <KpiCard
          label="Casos publicados"
          value="14"
          hint="2 borradores en revisión"
          icon="🏆"
        />
        <KpiCard
          label="Engagement redes"
          value="3.4%"
          hint="LinkedIn · IG · FB · promedio"
          icon="📱"
          variant="positive"
          trend={{ value: "+0.6pp", direction: "up" }}
          sparkline={[2.4, 2.6, 2.8, 3.0, 3.1, 3.2, 3.4]}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        <Section
          eyebrow="Sitio"
          title="Las 5 secciones públicas"
          subtitle="Estado del sitio nexara.com.mx · visitas últimos 7 días"
          tone="accent"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PAGES.map((s) => {
              const max = Math.max(...PAGES.map((p) => p.visits));
              const w = (s.visits / max) * 100;
              return (
                <article
                  key={s.name}
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "13px 16px",
                    borderRadius: 12,
                    background: "var(--surface)",
                    border: "1px solid var(--nx-panel-hairline)",
                    boxShadow: "var(--nx-panel-elev-1)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 2,
                      width: `${w}%`,
                      background: "linear-gradient(90deg, var(--panel-accent, var(--primary)) 0%, transparent 100%)",
                      opacity: 0.6,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      <code>nexara.com.mx{s.url}</code> · {s.lastUpdate}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--nx-font-display)", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
                    {s.visits.toLocaleString("es-MX")}
                  </span>
                  <Tag variant="positive" size="sm">
                    {s.status}
                  </Tag>
                </article>
              );
            })}
          </div>
        </Section>

        <Section
          eyebrow="Calendario"
          title="Próximas publicaciones en redes"
          subtitle="Borradores listos para programar"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {POSTS.map((p, i) => (
              <article
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--nx-panel-hairline)",
                  background: "var(--surface)",
                  boxShadow: "var(--nx-panel-elev-1)",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: `linear-gradient(135deg, ${p.color} 0%, color-mix(in srgb, ${p.color} 70%, white) 100%)`,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 17,
                    fontWeight: 800,
                    fontFamily: "var(--nx-font-display)",
                    boxShadow: `0 6px 14px color-mix(in srgb, ${p.color} 28%, transparent)`,
                  }}
                >
                  {p.red[0]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{p.titulo}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {p.red} · {p.fecha}
                  </div>
                </div>
                <Button size="sm" variant="ghost">
                  Programar
                </Button>
              </article>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
