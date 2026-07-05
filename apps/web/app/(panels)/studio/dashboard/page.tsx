"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

const RED_COLOR: Record<string, string> = {
  LinkedIn: "#0a66c2", Instagram: "#e1306c", Facebook: "#1877f2",
  Twitter: "#1da1f2", TikTok: "#000000",
};

const PAGES_STATIC = [
  { name: "Inicio", url: "/" },
  { name: "Soluciones", url: "/soluciones" },
  { name: "Casos de éxito", url: "/proyectos" },
  { name: "Cobertura", url: "/cobertura" },
  { name: "Contacto", url: "/contacto" },
];

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  createdAt?: string | null;
  status?: string | null;
}

interface CaseStudy {
  id: number;
  title: string;
  publicado: boolean;
  client?: string | null;
  industry?: string | null;
}

interface NewsletterStats {
  totalSubscribers: number;
  activeSubscribers?: number;
  lastCampaignSentAt?: string | null;
  lastCampaignOpenRate?: number | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function StudioDashboardPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "dashboard"), [user]);
  const token = user?.token ?? "";

  const [contacts, setContacts] = useState<number | null>(null);
  const [recentContacts, setRecentContacts] = useState<ContactMessage[]>([]);
  const [cases, setCases] = useState<{ total: number; publicados: number } | null>(null);
  const [recentCases, setRecentCases] = useState<CaseStudy[]>([]);
  const [posts, setPosts] = useState<{ id: number; red: string; titulo: string; cuando: string; estado: string }[]>([]);
  const [nlStats, setNlStats] = useState<NewsletterStats | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadErr(null);
    try {
      const [contactData, caseData, postData, nlData] = await Promise.allSettled([
        apiFetch("contact-messages?limit=5&sort=createdAt:desc", token),
        apiFetch("case-studies?limit=20", token),
        apiFetch("social-posts?limit=6", token),
        apiFetch("newsletter/stats", token),
      ]);

      if (contactData.status === "fulfilled") {
        const d = contactData.value;
        const arr: ContactMessage[] = Array.isArray(d) ? d : (d?.data ?? []);
        setContacts(typeof d?.total === "number" ? d.total : arr.length);
        setRecentContacts(arr.slice(0, 5));
      }

      if (caseData.status === "fulfilled") {
        const arr: CaseStudy[] = Array.isArray(caseData.value) ? caseData.value : (caseData.value?.data ?? []);
        setCases({ total: arr.length, publicados: arr.filter((c) => c.publicado).length });
        setRecentCases(arr.slice(0, 4));
      }

      if (postData.status === "fulfilled") {
        const arr = Array.isArray(postData.value) ? postData.value : (postData.value?.data ?? []);
        setPosts(arr.filter((p: { estado: string }) => p.estado === "Programado" || p.estado === "Borrador").slice(0, 4));
      }

      if (nlData.status === "fulfilled") {
        setNlStats(nlData.value);
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Error al cargar el panel");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function fmtDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = (d.getTime() - now.getTime()) / 3600000;
    if (diff < 24 && diff >= 0) return `Hoy ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
    if (diff < 48 && diff >= 0) return `Mañana ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtAge(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Hace unos minutos";
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? "Ayer" : `Hace ${days}d`;
  }

  return (
    <>
      {loadErr && <p role="alert" style={{ color: "var(--danger)", fontSize: 12, marginBottom: 12 }}>⚠ {loadErr}</p>}
      <PageHeader
        eyebrow="STUDIO · Marca y marketing"
        title={cfg.title}
        subtitle={cfg.subtitle}
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>Sitio en producción</Tag>
            {contacts !== null && <Tag variant="neutral">{contacts} contactos capturados</Tag>}
            {cases !== null && <Tag variant="positive">{cases.publicados} casos publicados</Tag>}
            {nlStats && <Tag variant="neutral">📬 {nlStats.totalSubscribers} suscriptores</Tag>}
          </>
        }
        actions={
          <>
            <Link href="/studio/leads" style={{ textDecoration: "none" }}>
              <Button variant="secondary" iconLeft="✨">Nuevo lead</Button>
            </Link>
            <Link href="/studio/pages" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="🌐" iconRight="→">Gestionar sitio</Button>
            </Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard
          label="Contactos web"
          value={contacts ?? "—"}
          hint="Formularios recibidos"
          icon="📥"
          variant="accent"
        />
        <KpiCard
          label="Casos publicados"
          value={cases?.publicados ?? "—"}
          hint={cases ? `${cases.total - cases.publicados} borradores en revisión` : "Cargando…"}
          icon="🏆"
          variant="positive"
        />
        <KpiCard
          label="Suscriptores newsletter"
          value={nlStats?.totalSubscribers ?? "—"}
          hint={nlStats?.activeSubscribers != null ? `${nlStats.activeSubscribers} activos` : "Newsletter"}
          icon="📬"
          variant="default"
        />
        <KpiCard
          label="Posts programados"
          value={posts.filter((p) => p.estado === "Programado").length || "—"}
          hint="Redes sociales"
          icon="📅"
          variant="default"
        />
      </div>

      {/* Atajos de módulos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 24 }}>
        {[
          { href: "/studio/pages", icon: "🌐", label: "Páginas web", desc: "Gestión del sitio público" },
          { href: "/studio/leads", icon: "✨", label: "Leads digitales", desc: "Contactos del sitio web" },
          { href: "/studio/contacts", icon: "📇", label: "Contactos", desc: "Directorio de contactos" },
          { href: "/studio/newsletter", icon: "📬", label: "Newsletter", desc: "Campañas de email" },
        ].map((m) => (
          <Link key={m.href} href={m.href} style={{ textDecoration: "none", color: "var(--text-primary)", padding: "14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, boxShadow: "var(--nx-panel-elev-1)" }}>
            <span style={{ fontSize: 20, width: 36, height: 36, borderRadius: 9, background: "color-mix(in srgb, var(--primary) 12%, var(--surface))", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 20 }}>
        {/* Contactos recientes */}
        <Section
          eyebrow="Leads"
          title="Contactos recientes"
          subtitle="Últimas solicitudes del formulario web"
          actions={<Link href="/studio/contacts" style={{ fontSize: 12, color: "var(--primary)" }}>Ver todos →</Link>}
        >
          {recentContacts.length === 0 ? (
            <EmptyState icon="📥" title="Sin contactos" description="Aún no hay solicitudes del sitio web." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentContacts.map((c) => (
                <article key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.company ? `${c.company} · ` : ""}{c.email}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    {c.status && <Tag variant={c.status === "NUEVO" ? "accent" : "neutral"} size="sm">{c.status}</Tag>}
                    {c.createdAt && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{fmtAge(c.createdAt)}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>

        {/* Casos de éxito */}
        <Section
          eyebrow="Portfolio"
          title="Casos de éxito"
          subtitle={cases ? `${cases.publicados} publicados · ${cases.total - cases.publicados} borradores` : "Portafolio"}
          actions={<Link href="/studio/cases" style={{ fontSize: 12, color: "var(--primary)" }}>Gestionar →</Link>}
        >
          {recentCases.length === 0 ? (
            <EmptyState icon="🏆" title="Sin casos" description="Agrega el primer caso de éxito." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentCases.map((c) => (
                <article key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                    {(c.client ?? c.industry) && (
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{[c.client, c.industry].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <Tag variant={c.publicado ? "positive" : "warning"} size="sm">{c.publicado ? "Publicado" : "Borrador"}</Tag>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* Newsletter */}
        {nlStats && (
          <Section eyebrow="Newsletter" title="Estado de la campaña" subtitle="Métricas de la lista de suscriptores">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Suscriptores totales</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>{nlStats.totalSubscribers.toLocaleString("es-MX")}</div>
              </div>
              {nlStats.activeSubscribers != null && (
                <div style={{ padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Activos</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "var(--success, #10b981)" }}>{nlStats.activeSubscribers.toLocaleString("es-MX")}</div>
                </div>
              )}
            </div>
            {nlStats.lastCampaignSentAt && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Última campaña: {new Date(nlStats.lastCampaignSentAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}
                {nlStats.lastCampaignOpenRate != null && ` · ${nlStats.lastCampaignOpenRate}% apertura`}
              </div>
            )}
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <Link href="/studio/newsletter" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>Gestionar newsletter →</Link>
            </div>
          </Section>
        )}

        {/* Calendario de publicaciones */}
        <Section eyebrow="Redes sociales" title="Próximas publicaciones" subtitle="Posts programados y borradores">
          {posts.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No hay posts pendientes.{" "}
              <Link href="/studio/social" style={{ color: "var(--primary)", fontWeight: 600 }}>Crea uno →</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {posts.map((p) => {
                const color = RED_COLOR[p.red] ?? "#666";
                return (
                  <article key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
                    <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 70%, white) 100%)`, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800 }}>
                      {p.red[0]}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.titulo}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{p.red} · {fmtDate(p.cuando)}</div>
                    </div>
                    <Tag variant={p.estado === "Programado" ? "positive" : "warning"} size="sm">{p.estado}</Tag>
                  </article>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <Link href="/studio/social" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>Ver calendario social →</Link>
          </div>
        </Section>

        {/* Sitio público */}
        <Section eyebrow="Sitio" title="Secciones públicas" subtitle="nexara.com.mx — en producción">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PAGES_STATIC.map((s) => (
              <article key={s.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "13px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    <code>nexara.com.mx{s.url}</code>
                  </div>
                </div>
                <Tag variant="positive" size="sm">Publicada</Tag>
              </article>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
