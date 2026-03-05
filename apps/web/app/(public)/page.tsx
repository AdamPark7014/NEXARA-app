"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import CertificationsCarousel from "../components/CertificationsCarousel";
import BrandsCarousel from "../components/BrandsCarousel";
import ContactFormToggle from "../components/ContactFormToggle";
import FloatingContactForm from "../components/FloatingContactForm";
import styles from "../page.module.css";
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

const normalizeNewsImageUrl = (imageUrl?: string): string | undefined => {
  if (!imageUrl || imageUrl.trim() === "") return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/")) {
    return `${API_URL}${imageUrl}`;
  }
  return `${API_URL}/${imageUrl}`;
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
  const [activeNews, setActiveNews] = useState(0);
  const [selectedNews, setSelectedNews] = useState<NewsPost | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const newsModalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    fetchClients();
    fetchNews();
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

  const versionedPublicSrc = (file: string): string => {
    return `/${file}`;
  };

  const activeNewsItem = news[activeNews];
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
    <div className={styles.page}>
      <main className={styles.main} aria-label="Inicio Nexara">
        <div className={styles.heroWrapper}>
          <section className={styles.hero} aria-labelledby="hero-heading">
            <div className={styles.heroLayout}>
              <div className={styles.heroContent}>
                <span className={styles.heroEyebrow}>TRANSFORMAMOS TECNOLOGÍA EN RESULTADOS REALES</span>
                <h1 id="hero-heading" className={styles.heroTitle}>
                  Soluciones tecnológicas corporativas para continuidad y crecimiento
                </h1>
                <p className={styles.heroSubtitle}>
                  Diseñamos, implementamos y operamos infraestructura TI con enfoque en
                  continuidad, productividad y escalabilidad para empresas y sector público.
                </p>

                <ul className={styles.heroBenefits} aria-label="Beneficios principales">
                  <li>Consultoría estratégica con acompañamiento integral</li>
                  <li>Implementación bajo estándares empresariales</li>
                  <li>Soporte especializado para operación crítica</li>
                </ul>

                <div className={`${styles.ctas} ${styles.heroButtons}`}>
                  <a href="/contacto" className={`${styles.primary} ${styles.heroPrimaryCta}`}>
                    Solicitar asesoría estratégica
                  </a>
                  <a href="/soluciones" className={`${styles.secondary} ${styles.heroSecondaryCta}`}>
                    Revisar soluciones
                  </a>
                </div>
              </div>

              <aside className={styles.heroPanel} aria-label="Indicadores clave de Nexara">
                <h2 className={styles.heroPanelTitle}>Resultados que respaldan cada proyecto</h2>
                <div className={styles.heroStats}>
                  <div className={styles.heroStatItem}>
                    <strong>+10 años</strong>
                    <span>de experiencia en servicios y soluciones TI.</span>
                  </div>
                  <div className={styles.heroStatItem}>
                    <strong>Soporte especializado</strong>
                    <span>Atención experta para continuidad operativa.</span>
                  </div>
                  <div className={styles.heroStatItem}>
                    <strong>Implementación de punta a punta</strong>
                    <span>Desde diagnóstico hasta adopción en operación.</span>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>

        <section className={styles.enterpriseStrip} aria-label="Métricas corporativas">
          {enterpriseMetrics.map((metric) => (
            <article key={metric.label} className={styles.enterpriseMetricCard}>
              <strong>{metric.value}</strong>
              <h3>{metric.label}</h3>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        <nav className={styles.quickNav} aria-label="Accesos rápidos">
          <a href="#qa-exclusivo" className={styles.quickNavLink}>Q&A exclusivo</a>
          <a href="#noticias" className={styles.quickNavLink}>Actualidad</a>
          <a href="#capacidades" className={styles.quickNavLink}>Capacidades</a>
          <a href="#soluciones" className={styles.quickNavLink}>Soluciones</a>
          <a href="#metodologia" className={styles.quickNavLink}>Metodología</a>
          <a href="#clientes" className={styles.quickNavLink}>Clientes</a>
          <a href="/qa" className={styles.quickNavLink}>Q&A</a>
        </nav>

        <section id="qa-exclusivo" className={styles.qaSpotlight} aria-labelledby="qa-exclusivo-heading">
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

        <section id="noticias" className={styles.newsSection} aria-labelledby="noticias-heading">
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
                      normalizeNewsImageUrl(activeNewsItem.coverImageUrl || undefined) ||
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

        <section id="capacidades" className={styles.capabilitiesSection} aria-labelledby="capacidades-heading">
          <div className={styles.capabilitiesHeader}>
            <span className={styles.capabilitiesBadge}>CAPACIDADES ENTERPRISE</span>
            <h2 id="capacidades-heading" className={styles.capabilitiesTitle}>Arquitectura, operación y evolución tecnológica</h2>
            <p className={styles.capabilitiesSubtitle}>
              Unificamos tecnología, procesos y personas para que cada inversión en TI se traduzca en rendimiento, control y escalabilidad.
            </p>
          </div>
          <div className={styles.capabilitiesGrid}>
            {valuePillars.map((pillar, index) => (
              <article key={pillar.title} className={styles.capabilityCard}>
                <span className={styles.capabilityIndex}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="soluciones" className={styles.servicesSection} aria-labelledby="soluciones-heading">
          <div className={styles.servicesHeader}>
            <span className={styles.servicesBadge}>PORTAFOLIO EMPRESARIAL</span>
            <h2 id="soluciones-heading" className={styles.newsTitle}>Soluciones diseñadas para impacto operativo</h2>
          </div>
          <div className={styles.servicesGridEnterprise}>
            {featuredSolutions.map((solution) => (
              <article key={solution.title} className={styles.serviceCardEnterprise}>
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

        <section id="metodologia" className={styles.deliverySection} aria-labelledby="metodologia-heading">
          <div className={styles.deliveryHeader}>
            <span className={styles.deliveryBadge}>METODOLOGÍA DE ENTREGA</span>
            <h2 id="metodologia-heading" className={styles.deliveryTitle}>Modelo operativo orientado a resultados</h2>
          </div>
          <div className={styles.deliveryGrid}>
            {deliveryModel.map((phase) => (
              <article key={phase.step} className={styles.deliveryCard}>
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
        <section id="clientes" className={styles.clientsSection} aria-labelledby="clientes-heading">
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
              <div className={styles.clientCard} key={c.id}>
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

        <section className={styles.executiveCta} aria-labelledby="executive-cta-heading">
          <div className={styles.executiveCtaContent}>
            <span className={styles.executiveCtaBadge}>PRÓXIMO PASO</span>
            <h2 id="executive-cta-heading">Define tu hoja de ruta tecnológica con enfoque ejecutivo</h2>
            <p>
              Coordinemos una sesión para priorizar riesgos, capacidades y oportunidades de tu operación.
            </p>
          </div>
          <div className={styles.executiveCtaActions}>
            <a href="/contacto" className={styles.primary}>Agendar reunión estratégica</a>
            <a href="/soluciones" className={styles.secondary}>Revisar portafolio</a>
          </div>
        </section>

        <ContactFormToggle />
      </main>
      <FloatingContactForm />

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
                        <img src={normalizeNewsImageUrl(image || undefined) || "/soluciones/rect-c.jpg"} alt="" />
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
