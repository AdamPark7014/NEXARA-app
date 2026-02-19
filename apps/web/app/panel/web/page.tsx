"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import styles from "./page.module.css";

type Client = {
  id: number;
  name: string;
  createdAt: string;
};

type Project = {
  id: number;
  title: string;
  sector: string;
  createdAt: string;
};

type ContactMessage = {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  status: string;
  createdAt: string;
};

type NewsPost = {
  id: number;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  createdAt: string;
};

type Highlight = {
  label: string;
  title: string;
  meta: string;
  href: string;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Sin fecha";

const getLatest = <T extends { createdAt: string }>(items: T[]) => {
  if (!items.length) return null;
  return items.reduce((latest, item) =>
    new Date(item.createdAt).getTime() > new Date(latest.createdAt).getTime() ? item : latest
  );
};

export default function WebPanel() {
  const { user } = useUser();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<ContactMessage[]>([]);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [clientsRes, projectsRes, contactsRes, newsRes] = await Promise.all([
          fetch(buildApiUrl("clients"), { cache: "no-store" }),
          fetch(buildApiUrl("projects"), { cache: "no-store" }),
          fetch(buildApiUrl("contact-messages"), { cache: "no-store" }),
          fetch(buildApiUrl("news"), { cache: "no-store" }),
        ]);

        if (!clientsRes.ok || !projectsRes.ok || !contactsRes.ok || !newsRes.ok) {
          throw new Error("No se pudieron cargar los datos del dashboard");
        }

        const [clientsData, projectsData, contactsData, newsData] = await Promise.all([
          clientsRes.json(),
          projectsRes.json(),
          contactsRes.json(),
          newsRes.json(),
        ]);

        if (!active) return;
        setClients(clientsData as Client[]);
        setProjects(projectsData as Project[]);
        setContacts(contactsData as ContactMessage[]);
        setNews(newsData as NewsPost[]);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const latestClient = useMemo(() => getLatest(clients), [clients]);
  const latestProject = useMemo(() => getLatest(projects), [projects]);
  const latestContact = useMemo(() => getLatest(contacts), [contacts]);
  const latestNews = useMemo(() => getLatest(news), [news]);

  const openContacts = useMemo(
    () => contacts.filter((item) => item.status === "NEW" || item.status === "IN_PROGRESS").length,
    [contacts]
  );
  const publishedNews = useMemo(
    () => news.filter((item) => item.status === "PUBLISHED").length,
    [news]
  );

  const highlights = useMemo(() => {
    const items: Highlight[] = [];
    if (latestClient) {
      items.push({
        label: "Cliente reciente",
        title: latestClient.name,
        meta: formatDate(latestClient.createdAt),
        href: "/panel/web/clientes",
      });
    }
    if (latestProject) {
      items.push({
        label: "Proyecto reciente",
        title: latestProject.title,
        meta: `${latestProject.sector} · ${formatDate(latestProject.createdAt)}`,
        href: "/panel/web/proyectos",
      });
    }
    if (latestContact) {
      items.push({
        label: "Contacto reciente",
        title: latestContact.name,
        meta: `${latestContact.company || latestContact.email} · ${formatDate(
          latestContact.createdAt
        )}`,
        href: "/panel/web/contactos",
      });
    }
    if (latestNews) {
      items.push({
        label: "Noticia reciente",
        title: latestNews.title,
        meta: `${latestNews.status} · ${formatDate(latestNews.createdAt)}`,
        href: "/panel/web/noticias",
      });
    }
    return items;
  }, [latestClient, latestProject, latestContact, latestNews]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel Web</p>
          <h1 className={styles.title}>Dashboard Nexara</h1>
          <p className={styles.subtitle}>
            {user?.nombre
              ? `Bienvenido, ${user.nombre}.`
              : "Bienvenido."} Aqui tienes una vista rapida de clientes, proyectos, contactos y
            noticias.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryButton} href="/panel/web/noticias">
            Crear noticia
          </Link>
          <Link className={styles.secondaryButton} href="/panel/web/contactos">
            Ver contactos
          </Link>
        </div>
      </header>

        <div className={styles.grid}>
          <div className={styles.summaryCard}>
            <div>
              <p className={styles.cardKicker}>Clientes</p>
              <h2 className={styles.cardValue}>{clients.length}</h2>
              <p className={styles.cardMeta}>Ultimo: {latestClient?.name || "Sin registros"}</p>
            </div>
            <Link className={styles.cardLink} href="/panel/web/clientes">
              Gestionar
            </Link>
          </div>

          <div className={styles.summaryCard}>
            <div>
              <p className={styles.cardKicker}>Proyectos</p>
              <h2 className={styles.cardValue}>{projects.length}</h2>
              <p className={styles.cardMeta}>
                {latestProject ? latestProject.title : "Sin registros"}
              </p>
            </div>
            <Link className={styles.cardLink} href="/panel/web/proyectos">
              Gestionar
            </Link>
          </div>

          <div className={styles.summaryCard}>
            <div>
              <p className={styles.cardKicker}>Contactos</p>
              <h2 className={styles.cardValue}>{contacts.length}</h2>
              <p className={styles.cardMeta}>Abiertos: {openContacts}</p>
            </div>
            <Link className={styles.cardLink} href="/panel/web/contactos">
              Gestionar
            </Link>
          </div>

          <div className={styles.summaryCard}>
            <div>
              <p className={styles.cardKicker}>Noticias</p>
              <h2 className={styles.cardValue}>{news.length}</h2>
              <p className={styles.cardMeta}>Publicadas: {publishedNews}</p>
            </div>
            <Link className={styles.cardLink} href="/panel/web/noticias">
              Gestionar
            </Link>
          </div>
        </div>

        <div className={styles.detailGrid}>
          <div className={styles.activityCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Ultimos movimientos</h3>
                <p className={styles.cardSubtitle}>
                  Resumen rapido de lo mas reciente en cada seccion.
                </p>
              </div>
              <span className={styles.badge}>{highlights.length} entradas</span>
            </div>
            {loading ? (
              <p className={styles.loading}>Cargando informacion...</p>
            ) : error ? (
              <p className={styles.error}>{error}</p>
            ) : highlights.length === 0 ? (
              <p className={styles.empty}>Aun no hay actividad.</p>
            ) : (
              <div className={styles.activityList}>
                {highlights.map((item) => (
                  <Link key={`${item.label}-${item.title}`} href={item.href} className={styles.activityItem}>
                    <span className={styles.activityLabel}>{item.label}</span>
                    <div>
                      <p className={styles.activityTitle}>{item.title}</p>
                      <p className={styles.activityMeta}>{item.meta}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actionsCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Accesos directos</h3>
                <p className={styles.cardSubtitle}>Enlaces rapidos para tus tareas diarias.</p>
              </div>
            </div>
            <div className={styles.actionGrid}>
              <Link className={styles.actionTile} href="/panel/web/clientes">
                <span>Clientes</span>
                <strong>Actualizar portafolio</strong>
              </Link>
              <Link className={styles.actionTile} href="/panel/web/proyectos">
                <span>Proyectos</span>
                <strong>Editar contenido</strong>
              </Link>
              <Link className={styles.actionTile} href="/panel/web/contactos">
                <span>Contactos</span>
                <strong>Responder mensajes</strong>
              </Link>
              <Link className={styles.actionTile} href="/panel/web/noticias">
                <span>Noticias</span>
                <strong>Publicar novedades</strong>
              </Link>
            </div>
          </div>
        </div>
    </section>
  );
}
