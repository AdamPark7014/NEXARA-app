"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import Button from "@/components/ui/Button";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  StatStrip,
  DashPanel,
  BarList,
  ListRow,
  DashPill,
  DashEmpty,
} from "@/components/dashboard/DashKit";
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
    if (hours < 1) return "Hace min";
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? "Ayer" : `Hace ${days}d`;
  }

  const programados = posts.filter((p) => p.estado === "Programado").length;

  return (
    <DashPage>
      <DashHero
        eyebrow="STUDIO · Marca y marketing"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <DashPill tone="positive">Sitio en producción</DashPill>
            <Link href="/studio/leads" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Nuevo lead</Button>
            </Link>
            <Link href="/studio/pages" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconRight="→">Gestionar sitio</Button>
            </Link>
          </>
        }
      />

      {loadErr && (
        <DashPanel title="No se pudo cargar" subtitle={loadErr}>
          <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
        </DashPanel>
      )}

      <StatStrip
        stats={[
          {
            label: "Contactos web",
            value: contacts ?? "…",
            sub: "Formularios recibidos",
            tone: "accent",
            big: true,
          },
          {
            label: "Casos publicados",
            value: cases?.publicados ?? "…",
            sub: cases ? `${cases.total - cases.publicados} borradores en revisión` : undefined,
            tone: "positive",
          },
          {
            label: "Suscriptores newsletter",
            value: nlStats?.totalSubscribers ?? "…",
            sub: nlStats?.activeSubscribers != null ? `${nlStats.activeSubscribers} activos` : "Newsletter",
          },
          {
            label: "Posts programados",
            value: programados,
            sub: "Redes sociales",
          },
        ]}
      />

      <DashGrid>
        <DashCol span={7}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DashPanel
              title="Contactos recientes"
              subtitle="Últimas solicitudes del formulario web"
              action="Ver todos"
              actionHref="/studio/contacts"
            >
              {recentContacts.length === 0 && (
                <DashEmpty title="Sin contactos" description="Aún no hay solicitudes del sitio web." />
              )}
              {recentContacts.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  sub={`${c.company ? `${c.company} · ` : ""}${c.email}`}
                  trail={
                    <>
                      {c.status && <DashPill tone={c.status === "NUEVO" ? "accent" : "neutral"}>{c.status}</DashPill>}
                      {c.createdAt && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAge(c.createdAt)}</span>}
                    </>
                  }
                />
              ))}
            </DashPanel>

            <DashPanel
              title="Casos de éxito"
              subtitle={cases ? `${cases.publicados} publicados · ${cases.total - cases.publicados} borradores` : "Portafolio"}
              action="Gestionar"
              actionHref="/studio/cases"
            >
              {cases !== null && cases.total > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <BarList
                    max={cases.total}
                    items={[
                      { label: "Publicados", value: cases.publicados, color: "var(--success)" },
                      { label: "Borradores", value: cases.total - cases.publicados, color: "var(--warning)" },
                    ].filter((r) => r.value > 0)}
                  />
                </div>
              )}
              {recentCases.length === 0 && (
                <DashEmpty title="Sin casos" description="Agrega el primer caso de éxito." />
              )}
              {recentCases.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.title}
                  sub={[c.client, c.industry].filter(Boolean).join(" · ") || undefined}
                  trail={<DashPill tone={c.publicado ? "positive" : "warning"}>{c.publicado ? "Publicado" : "Borrador"}</DashPill>}
                />
              ))}
            </DashPanel>
          </div>
        </DashCol>

        <DashCol span={5}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DashPanel
              title="Próximas publicaciones"
              subtitle="Posts programados y borradores"
              action="Calendario social"
              actionHref="/studio/social"
            >
              {posts.length === 0 && (
                <DashEmpty title="Sin posts pendientes" description="Crea uno desde el calendario social." />
              )}
              {posts.map((p) => (
                <ListRow
                  key={p.id}
                  accent={RED_COLOR[p.red] ?? "#666"}
                  title={p.titulo}
                  sub={`${p.red} · ${fmtDate(p.cuando)}`}
                  trail={<DashPill tone={p.estado === "Programado" ? "positive" : "warning"}>{p.estado}</DashPill>}
                />
              ))}
            </DashPanel>

            <DashPanel
              title="Newsletter"
              subtitle={
                nlStats?.lastCampaignSentAt
                  ? `Última campaña ${new Date(nlStats.lastCampaignSentAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}${nlStats.lastCampaignOpenRate != null ? ` · ${nlStats.lastCampaignOpenRate}% apertura` : ""}`
                  : "Lista de suscriptores"
              }
              action="Gestionar"
              actionHref="/studio/newsletter"
            >
              <ListRow
                title="Suscriptores totales"
                trail={<span style={{ fontSize: 15, fontWeight: 700 }}>{(nlStats?.totalSubscribers ?? 0).toLocaleString("es-MX")}</span>}
              />
              {nlStats?.activeSubscribers != null && (
                <ListRow
                  title="Activos"
                  trail={<span style={{ fontSize: 15, fontWeight: 700, color: "var(--success)" }}>{nlStats.activeSubscribers.toLocaleString("es-MX")}</span>}
                />
              )}
            </DashPanel>

            <DashPanel title="Sitio público" subtitle="nexara.com.mx — en producción" action="Páginas" actionHref="/studio/pages">
              {PAGES_STATIC.map((s) => (
                <ListRow
                  key={s.name}
                  title={s.name}
                  sub={`nexara.com.mx${s.url}`}
                  trail={<DashPill tone="positive">Publicada</DashPill>}
                />
              ))}
            </DashPanel>
          </div>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
