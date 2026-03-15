"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import CertificationsCarousel from "../components/CertificationsCarousel";
import BrandsCarousel from "../components/BrandsCarousel";
import ContactFormToggle from "../components/ContactFormToggle";
import styles from "../page.module.css";
import corporateStyles from "./landing-corporate.module.css";
import { buildApiUrl, getApiBase } from "@/lib/api-base";

interface Client {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
}

interface NewsPost {
  id: number;
  title: string;
  slug: string;
  summary?: string | null;
  content: string;
  coverImageUrl?: string | null;
  galleryUrls: string[];
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface HomeProject {
  id: number;
  slug: string;
  title: string;
  sector: string;
  summary?: string | null;
  impact?: string | null;
  services?: string[];
  tags?: string[];
  highlights?: string[];
  gallery?: string[];
  showInCatalog?: boolean;
  mainImage?: string | null;
  createdAt: string;
}

const API_URL = getApiBase();

// Función para normalizar URLs de imágenes
// Convierte filenames y rutas relativas a URLs completas del API
const normalizeImageUrl = (imageUrl?: string): string | undefined => {
  if (!imageUrl || imageUrl.trim() === "") return undefined;
  
  // Si ya es una URL absoluta (http o https), devolverla tal cual
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  
  // Si es una ruta relativa del API (/clients/image/...) o un filename simple
  // Anteponer el API_URL
  if (imageUrl.startsWith("/")) {
    return `${API_URL}${imageUrl}`;
  }
  
  return `${API_URL}/clients/image/${imageUrl}`;
};

const addCacheKey = (url: string, cacheKey?: string): string => {
  if (!cacheKey) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
};

const normalizeNewsImageUrl = (imageUrl?: string, cacheKey?: string): string | undefined => {
  if (!imageUrl || imageUrl.trim() === "") return undefined;

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return addCacheKey(imageUrl, cacheKey);
  }

  if (imageUrl.startsWith("/")) {
    return addCacheKey(`${API_URL}${imageUrl}`, cacheKey);
  }

  return addCacheKey(`${API_URL}/${imageUrl}`, cacheKey);
};

const normalizeProjectImageUrl = (imageUrl?: string | null): string | undefined => {
  if (!imageUrl || imageUrl.trim() === "") return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/")) {
      return `${API_URL}${imageUrl}`;
    }
    return imageUrl;
  }
  return `${API_URL}/projects/image/${imageUrl}`;
};

const formatNewsDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "";

const enterpriseMetrics = [
  {
    value: "+150",
    label: "proyectos tecnológicos implementados",
    detail: "Despliegues para operación empresarial y entidades del sector público.",
  },
  {
    value: "99.9%",
    label: "continuidad operativa objetivo",
    detail: "Arquitecturas enfocadas en resiliencia, disponibilidad y control.",
  },
  {
    value: "24/7",
    label: "acompañamiento especializado",
    detail: "Soporte consultivo para entornos de misión crítica.",
  },
  {
    value: "End-to-end",
    label: "cobertura integral del ciclo TI",
    detail: "Diagnóstico, implementación, adopción y mejora continua.",
  },
];

const valuePillars = [
  {
    title: "Gobierno y planificación TI",
    text: "Definimos hoja de ruta, prioridades y arquitectura alineadas a objetivos del negocio.",
  },
  {
    title: "Infraestructura y ciberseguridad",
    text: "Diseñamos plataformas seguras y escalables, preparadas para crecimiento sostenido.",
  },
  {
    title: "Servicios gestionados",
    text: "Monitoreo, mantenimiento y soporte con acuerdos de nivel de servicio medibles.",
  },
  {
    title: "Adopción y cambio organizacional",
    text: "Aseguramos transferencia de conocimiento y adopción efectiva de cada iniciativa.",
  },
];

const featuredSolutions = [
  {
    badge: "ESTRATEGIA Y EJECUCIÓN",
    title: "Soluciones empresariales personalizadas",
    description:
      "Integración de infraestructura, seguridad, conectividad y continuidad con acompañamiento técnico especializado.",
    image: "soluciones-personalizadas.jpg",
    alt: "Arquitectura empresarial personalizada",
  },
  {
    badge: "RENOVACIÓN TECNOLÓGICA",
    title: "Equipamiento corporativo y modernización",
    description:
      "Suministro de equipos y plataformas de marcas líderes con evaluación técnica, financiera y operativa.",
    image: "ventas-equipos.jpg",
    alt: "Equipamiento corporativo",
  },
];

const deliveryModel = [
  {
    step: "01",
    title: "Diagnóstico ejecutivo",
    text: "Analizamos contexto, riesgos y objetivos para priorizar iniciativas con impacto medible.",
  },
  {
    step: "02",
    title: "Implementación controlada",
    text: "Ejecutamos por fases con gestión de hitos, documentación y estándares de calidad.",
  },
  {
    step: "03",
    title: "Optimización continua",
    text: "Medimos desempeño operativo y ajustamos capacidades para sostener resultados en el tiempo.",
  },
];

export default function Home() {
  const [clients, setClients] = useState<Client[]>([]);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [activeNews, setActiveNews] = useState(0);
  const [selectedNews, setSelectedNews] = useState<NewsPost | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const newsModalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    fetchClients();
    fetchNews();
    fetchProjects();
  }, []);

  useEffect(() => {
    if (news.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveNews((prev) => (prev + 1) % news.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [news.length]);

  useEffect(() => {
    if (!selectedNews) {
      document.body.style.overflow = "";
      return undefined;
    }

    document.body.style.overflow = "hidden";
    const modal = newsModalRef.current;

    if (!modal) {
      return () => {
        document.body.style.overflow = "";
        previousFocusRef.current?.focus();
      };
    }

    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);

    const initialFocusable = getFocusable();
    initialFocusable[0]?.focus();

    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNewsModal();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !modal.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last || !modal.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener("keydown", handleModalKeyDown);
    return () => {
      modal.removeEventListener("keydown", handleModalKeyDown);
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    };
  }, [selectedNews]);

  const fetchNews = async () => {
    try {
      const response = await fetch(buildApiUrl("news?status=PUBLISHED"));
      if (!response.ok) return;
      const data = (await response.json()) as NewsPost[];
      setNews(data);
    } catch (err) {
      console.error("Error al cargar noticias:", err);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch(buildApiUrl("clients"));
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (err) {
      console.error("Error al cargar clientes:", err);
      // Usar datos de respaldo si falla
      setClients([
        {
          id: 1,
          name: "Cliente Alfa",
          description: "Optimización de infraestructura y soporte 24/7.",
          imageUrl: "/marcas/marcas-01.png",
        },
        {
          id: 2,
          name: "Cliente Beta",
          description: "Modernización de equipos y continuidad operativa.",
          imageUrl: "/marcas/marcas-05.png",
        },
        {
          id: 3,
          name: "Cliente Gamma",
          description: "Integración de redes y seguridad perimetral.",
          imageUrl: "/marcas/marcas-10.png",
        },
        {
          id: 4,
          name: "Cliente Delta",
          description: "Migración a centro de datos y alta disponibilidad.",
          imageUrl: "/marcas/marcas-15.png",
        },
        {
          id: 5,
          name: "Cliente Épsilon",
          description: "Automatización de procesos y monitoreo proactivo.",
          imageUrl: "/marcas/marcas-22.png",
        },
        {
          id: 6,
          name: "Cliente Zeta",
          description: "Consultoría integral y capacitación del equipo.",
          imageUrl: "/marcas/marcas-30.png",
        },
      ]);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch(buildApiUrl("projects"));
      if (!response.ok) return;
      const data = (await response.json()) as HomeProject[];
      setProjects(data);
    } catch (err) {
      console.error("Error al cargar proyectos:", err);
      setProjects([]);
    }
  };

  const versionedPublicSrc = (file: string): string => {
    return `/${file}`;
  };

  const activeNewsItem = news[activeNews];
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const openNewsModal = (item: NewsPost) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setSelectedNews(item);
    setSelectedImage(0);
  };

  const closeNewsModal = () => {
    setSelectedNews(null);
    setSelectedImage(0);
  };

  const renderParagraphs = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((chunk, index) => (
        <p key={index} className={styles.newsModalParagraph}>
          {chunk.trim()}
        </p>
      ));

  return (
    <div className={`${styles.page} ${corporateStyles.root} ultra-corp-home ultra-corp-strict`}>
      <main className={styles.main} aria-label="Inicio Nexara">
        <div data-ui="landing-hero-wrap" className={styles.heroWrapper}>
          <aside
            data-ui="hero-top-card"
            className={corporateStyles.heroTopCard}
            aria-label="Resumen de que hacemos"
          >
            <Image
              src="/logo-nexara.png"
              alt="Logo Nexara"
              width={84}
              height={84}
              className={corporateStyles.heroTopCardLogo}
            />
            <div data-ui="hero-top-card-content" className={corporateStyles.heroTopCardContent}>
              <h1
                id="hero-heading"
                data-ui="hero-top-card-title"
                className={corporateStyles.heroTopCardTitle}
              >
                ¿QUÉ HACEMOS?
              </h1>
              <p data-ui="hero-top-card-text" className={corporateStyles.heroTopCardText}>
                En Nexara integramos tecnología, equipamiento y servicios de IT end-to-end a la
                medida para que tu operación crezca con continuidad. Combinamos experiencia
                técnica, ejecución ágil y acompañamiento cercano en cada etapa para resolver
                necesidades reales.
              </p>
            </div>
          </aside>

          <section data-ui="landing-hero" className={styles.hero} aria-labelledby="hero-heading">
            <div className={styles.heroBackground} aria-hidden="true">
              <Image
                src="/images/hero_nexara_enterprise.svg"
                alt=""
                fill
                priority
                quality={100}
                sizes="100vw"
                className={styles.heroBackgroundImage}
              />
            </div>
            <div className={styles.heroLayout} aria-hidden="true" />
          </section>
        </div>

        <section
          id="proyectos-recientes"
          data-ui="landing-recent-projects"
          className={styles.recentProjectsSection}
          aria-labelledby="proyectos-recientes-heading"
        >
          <div className={styles.recentProjectsHeader}>
            <div className={styles.recentProjectsHeaderTop}>
              <span className={styles.recentProjectsBadge}>PROYECTOS RECIENTES</span>
              <div className={styles.recentProjectsActions}>
                <a
                  href={`${API_URL}/projects/catalog-pdf/download`}
                  className={styles.recentProjectsPdfCta}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Descargar PDF
                </a>
                <a href="/proyectos" className={styles.recentProjectsPdfCta}>Ver catalogo</a>
              </div>
            </div>
            <div>
              <h2 id="proyectos-recientes-heading" className={styles.recentProjectsTitle}>
                Proyectos recientes
              </h2>
              <p className={styles.recentProjectsSubtitle}>
                Cargamos solo los ultimos proyectos publicados para mostrar lo mas reciente.
              </p>
            </div>
          </div>

          <div className={styles.recentProjectsGrid}>
            {recentProjects.map((project) => (
              <article key={project.id} className={styles.recentProjectFullCard}>
                <header className={styles.recentProjectFullHeader}>
                  <div>
                    <p className={styles.recentProjectSector}>{project.sector || "Proyecto"}</p>
                    <h3 className={styles.recentProjectFullTitle}>{project.title}</h3>
                    <p className={styles.recentProjectSummary}>
                      {project.summary || "Caso publicado en el portafolio Nexara."}
                    </p>
                    <div className={styles.recentProjectMetaRow}>
                      <p>
                        <span>Impacto</span>
                        <strong>{project.impact || "Resultados medibles en operación"}</strong>
                      </p>
                      <p>
                        <span>Servicios</span>
                        <strong>
                          {(project.services || []).length
                            ? (project.services || []).slice(0, 3).join(" • ")
                            : "Integración TI • Implementación • Soporte"}
                        </strong>
                      </p>
                    </div>
                  </div>
                  {!!(project.tags || []).length && (
                    <div className={styles.recentProjectTagRow}>
                      {(project.tags || []).slice(0, 4).map((tag) => (
                        <span key={`${project.id}-${tag}`} className={styles.recentProjectTag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </header>

                <div className={styles.recentProjectFullMedia}>
                  <div className={styles.recentProjectMainImage}>
                    <Image
                      src={normalizeProjectImageUrl(project.mainImage) || "/soluciones/rect-a.jpg"}
                      alt={`Proyecto ${project.title}`}
                      fill
                      sizes="(max-width: 900px) 100vw, 55vw"
                      className={styles.recentProjectImage}
                      unoptimized
                    />
                  </div>
                  <div className={styles.recentProjectGallery}>
                    {(project.gallery || []).slice(0, 4).map((image, index) => (
                      <div key={`${project.id}-gallery-${index}`} className={styles.recentProjectGalleryItem}>
                        <Image
                          src={normalizeProjectImageUrl(image) || "/servicios/square-1.jpg"}
                          alt={`${project.title} imagen ${index + 1}`}
                          fill
                          sizes="(max-width: 900px) 50vw, 18vw"
                          className={styles.recentProjectImage}
                          unoptimized
                        />
                      </div>
                    ))}
                    {!(project.gallery || []).length && (
                      <div className={styles.recentProjectGalleryEmpty}>Sin galeria adicional</div>
                    )}
                  </div>
                </div>

                <ul className={styles.recentProjectHighlights}>
                  {(
                    (project.highlights || []).length
                      ? (project.highlights || []).slice(0, 4)
                      : [
                          project.summary || "Proyecto enfocado en continuidad y eficiencia operativa.",
                          "Implementación alineada a objetivos del negocio.",
                          "Seguimiento técnico con métricas de desempeño.",
                        ]
                  ).map((item, index) => (
                    <li key={`${project.id}-hl-${index}`}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}

            {!recentProjects.length && (
              <div className={styles.recentProjectsEmpty}>
                Aun no hay proyectos publicados.
              </div>
            )}
          </div>
        </section>

        <section id="noticias" data-ui="landing-news" className={styles.newsSection} aria-labelledby="noticias-heading">
          <div className={styles.newsHeader}>
            <span className={styles.newsBadge}>NOTICIAS, OFERTAS Y NOVEDADES</span>
            <div>
              <h2 id="noticias-heading" className={styles.newsTitle}>Tecnología que impulsa tu negocio</h2>
              <p className={styles.newsSubtitle}>
                Noticias estratégicas, ofertas y novedades relevantes para equipos que lideran operación y transformación digital.
              </p>
            </div>
          </div>

          {activeNewsItem ? (
            <div className={styles.newsCarousel} role="region" aria-roledescription="carrusel" aria-label="Carrusel de noticias destacadas">
              <button
                type="button"
                className={styles.newsNav}
                onClick={() => setActiveNews((prev) => (prev - 1 + news.length) % news.length)}
                aria-label="Noticia anterior"
                aria-controls="news-active-slide"
              >
                ‹
              </button>
              <div id="news-active-slide" key={activeNewsItem.id} className={styles.newsSlide} aria-live="polite">
                <div className={styles.newsImageWrap}>
                  <img
                    src={
                      normalizeNewsImageUrl(
                        activeNewsItem.coverImageUrl || undefined,
                        activeNewsItem.updatedAt || activeNewsItem.createdAt,
                      ) ||
                      "/soluciones/rect-a.jpg"
                    }
                    alt={activeNewsItem.title}
                  />
                </div>
                <div className={styles.newsContent}>
                  <div className={styles.newsMetaLine}>
                    <span>Reporte ejecutivo</span>
                    <span>{formatNewsDate(activeNewsItem.publishedAt || activeNewsItem.createdAt)}</span>
                  </div>
                  <h3>{activeNewsItem.title}</h3>
                  <p>{activeNewsItem.summary || "Nuevo insight disponible para tu operación."}</p>
                  <div className={styles.newsActions}>
                    <button
                      type="button"
                      className={styles.newsButton}
                      onClick={() => openNewsModal(activeNewsItem)}
                    >
                      Ver detalle
                    </button>
                    <div className={styles.newsDots} role="group" aria-label="Selector de noticias">
                      {news.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            index === activeNews
                              ? styles.newsDotActive
                              : styles.newsDot
                          }
                          onClick={() => setActiveNews(index)}
                          aria-label={`Ir a noticia ${index + 1}`}
                          aria-pressed={index === activeNews}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.newsNav}
                onClick={() => setActiveNews((prev) => (prev + 1) % news.length)}
                aria-label="Siguiente noticia"
                aria-controls="news-active-slide"
              >
                ›
              </button>
            </div>
          ) : (
            <div className={styles.newsEmpty} role="status" aria-live="polite">
              <span className={styles.newsEmptyBadge}>ACTUALIZACION EN CURSO</span>
              <p className={styles.newsEmptyTitle}>Próximamente publicaremos actualizaciones estratégicas.</p>
              <p className={styles.newsEmptyText}>Muy pronto verás aquí novedades, ofertas y casos relevantes para toma de decisiones empresariales.</p>
            </div>
          )}
        </section>

        <section data-ui="landing-metrics" className={styles.enterpriseStrip} aria-label="Métricas corporativas">
          {enterpriseMetrics.map((metric) => (
            <article key={metric.label} data-ui="metric-card" className={styles.enterpriseMetricCard}>
              <strong>{metric.value}</strong>
              <h3>{metric.label}</h3>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        <nav data-ui="landing-quicknav" className={styles.quickNav} aria-label="Accesos rápidos">
          <a href="#qa-exclusivo" className={styles.quickNavLink}>Q&A exclusivo</a>
          <a href="#proyectos-recientes" className={styles.quickNavLink}>Proyectos recientes</a>
          <a href="#noticias" className={styles.quickNavLink}>Actualidad</a>
          <a href="#capacidades" className={styles.quickNavLink}>Capacidades</a>
          <a href="#soluciones" className={styles.quickNavLink}>Soluciones</a>
          <a href="#metodologia" className={styles.quickNavLink}>Metodología</a>
          <a href="#clientes" className={styles.quickNavLink}>Clientes</a>
          <a href="/qa" className={styles.quickNavLink}>Q&A</a>
        </nav>

        <section id="qa-exclusivo" data-ui="landing-qa" className={styles.qaSpotlight} aria-labelledby="qa-exclusivo-heading">
          <div className={styles.qaSpotlightContent}>
            <span className={styles.qaSpotlightBadge}>APARTADO EXCLUSIVO</span>
            <h2 id="qa-exclusivo-heading" className={styles.qaSpotlightTitle}>Q&A estratégico para dirección y operación</h2>
            <p className={styles.qaSpotlightText}>
              Accede a respuestas puntuales sobre implementación, tiempos, cobertura y soporte para acelerar decisiones.
            </p>
          </div>
          <div className={styles.qaSpotlightActions}>
            <a href="/qa" className={styles.primary}>Ir al Q&A</a>
            <a href="/contacto" className={styles.secondary}>Hacer una pregunta</a>
          </div>
        </section>

        <section id="capacidades" data-ui="landing-capabilities" className={styles.capabilitiesSection} aria-labelledby="capacidades-heading">
          <div className={styles.capabilitiesHeader}>
            <span className={styles.capabilitiesBadge}>CAPACIDADES ENTERPRISE</span>
            <h2 id="capacidades-heading" className={styles.capabilitiesTitle}>Arquitectura, operación y evolución tecnológica</h2>
            <p className={styles.capabilitiesSubtitle}>
              Unificamos tecnología, procesos y personas para que cada inversión en TI se traduzca en rendimiento, control y escalabilidad.
            </p>
          </div>
          <div className={styles.capabilitiesGrid}>
            {valuePillars.map((pillar, index) => (
              <article key={pillar.title} data-ui="capability-card" className={styles.capabilityCard}>
                <span className={styles.capabilityIndex}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="soluciones" data-ui="landing-solutions" className={styles.servicesSection} aria-labelledby="soluciones-heading">
          <div className={styles.servicesHeader}>
            <span className={styles.servicesBadge}>PORTAFOLIO EMPRESARIAL</span>
            <h2 id="soluciones-heading" className={styles.newsTitle}>Soluciones diseñadas para impacto operativo</h2>
          </div>
          <div className={styles.servicesGridEnterprise}>
            {featuredSolutions.map((solution) => (
              <article key={solution.title} data-ui="solution-card" className={styles.serviceCardEnterprise}>
                <div className={styles.serviceContent}>
                  <div className={styles.serviceBadge}>{solution.badge}</div>
                  <h3 className={styles.serviceTitle}>{solution.title}</h3>
                  <p className={styles.serviceDescription}>{solution.description}</p>
                </div>
                <div className={styles.serviceImageWrapper}>
                  <Image
                    src={versionedPublicSrc(solution.image)}
                    alt={solution.alt}
                    width={200}
                    height={200}
                    className={styles.serviceImage}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="metodologia" data-ui="landing-delivery" className={styles.deliverySection} aria-labelledby="metodologia-heading">
          <div className={styles.deliveryHeader}>
            <span className={styles.deliveryBadge}>METODOLOGÍA DE ENTREGA</span>
            <h2 id="metodologia-heading" className={styles.deliveryTitle}>Modelo operativo orientado a resultados</h2>
          </div>
          <div className={styles.deliveryGrid}>
            {deliveryModel.map((phase) => (
              <article key={phase.step} data-ui="delivery-card" className={styles.deliveryCard}>
                <span className={styles.deliveryStep}>{phase.step}</span>
                <h3>{phase.title}</h3>
                <p>{phase.text}</p>
              </article>
            ))}
          </div>
        </section>

        <CertificationsCarousel />
        <BrandsCarousel />

        {/* Clientes satisfechos */}
        <section id="clientes" data-ui="landing-clients" className={styles.clientsSection} aria-labelledby="clientes-heading">
          <div className={styles.clientsHeader}>
            <div className={styles.clientsBadge}>CONFIANZA EMPRESARIAL</div>
            <h2 id="clientes-heading" className={styles.clientsTitle}>Organizaciones que confían en Nexara</h2>
            <p className={styles.clientsSubtitle}>
              Relaciones de largo plazo con organizaciones que priorizan continuidad, seguridad y eficiencia.
            </p>
          </div>
          <div className={styles.clientsGrid}>
            {clients.map((c) => {
              const normalizedImageUrl = normalizeImageUrl(c.imageUrl) || "/marcas/marcas-01.png";
              return (
              <div data-ui="client-card" className={styles.clientCard} key={c.id}>
                <div className={styles.clientLogo}>
                  <Image 
                    src={normalizedImageUrl} 
                    alt={`Logo ${c.name}`} 
                    width={120} 
                    height={120}
                    quality={95}
                    sizes="120px"
                    className={styles.clientLogoImage}
                    unoptimized
                  />
                </div>
                <div className={styles.clientInfo}>
                  <h3 className={styles.clientName}>{c.name}</h3>
                  <p className={styles.clientDescription}>{c.description || "Cuenta activa en acompañamiento tecnológico."}</p>
                </div>
              </div>
            );
            })}
          </div>
        </section>

        <ContactFormToggle />
      </main>

      {selectedNews && (
        <div className={styles.newsModalOverlay} onClick={closeNewsModal} aria-hidden="true">
          <div ref={newsModalRef} className={styles.newsModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="news-modal-title">
            <button type="button" className={styles.newsClose} onClick={closeNewsModal} aria-label="Cerrar">
              ✕
            </button>
            <div className={styles.newsModalContent}>
              <div className={styles.newsModalText}>
                <span className={styles.newsModalBadge}>Noticia</span>
                <h3 id="news-modal-title">{selectedNews.title}</h3>
                <p className={styles.newsModalSummary}>
                  {selectedNews.summary || "Actualización destacada de Nexara."}
                </p>
                <div className={styles.newsModalMeta}>
                  <span className={styles.newsModalDate}>
                    {formatNewsDate(selectedNews.publishedAt || selectedNews.createdAt)}
                  </span>
                  <span className={styles.newsModalCounter}>
                    {Math.max(1, [selectedNews.coverImageUrl, ...selectedNews.galleryUrls].filter(Boolean).length)} imagenes
                  </span>
                </div>
                <div className={styles.newsModalBody}>
                  {renderParagraphs(selectedNews.content)}
                </div>
              </div>
              <div className={styles.newsModalMedia}>
                <div className={styles.newsModalHero}>
                  <img
                    src={
                      normalizeNewsImageUrl(
                        selectedNews.galleryUrls[selectedImage] || selectedNews.coverImageUrl || undefined,
                        selectedNews.updatedAt || selectedNews.createdAt,
                      ) || "/soluciones/rect-b.jpg"
                    }
                    alt={selectedNews.title}
                  />
                </div>
                <div className={styles.newsModalGallery}>
                  {[selectedNews.coverImageUrl, ...selectedNews.galleryUrls]
                    .filter(Boolean)
                    .slice(0, 8)
                    .map((image, index) => (
                      <button
                        key={`${selectedNews.id}-${index}`}
                        type="button"
                        className={
                          index === selectedImage
                            ? styles.newsGalleryActive
                            : styles.newsGalleryItem
                        }
                        onClick={() => setSelectedImage(index)}
                        aria-label={`Ver imagen ${index + 1}`}
                        aria-pressed={index === selectedImage}
                      >
                        <img
                          src={
                            normalizeNewsImageUrl(
                              image || undefined,
                              selectedNews.updatedAt || selectedNews.createdAt,
                            ) || "/soluciones/rect-c.jpg"
                          }
                          alt=""
                        />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
