"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import CertificationsCarousel from "../components/CertificationsCarousel";
import BrandsCarousel from "../components/BrandsCarousel";
import ContactFormToggle from "../components/ContactFormToggle";
import FloatingContactForm from "../components/FloatingContactForm";
import FAQ from "../components/FAQ";
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
    }, 7000);
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
          <section className={styles.hero}>
            <h1 className={styles.heroTitle}>
              Expertos en Soluciones Tecnológicas para tu Empresa
            </h1>
            <p className={styles.heroSubtitle}>
              Venta de computadoras, integración de tecnología y servicios IT a la medida.
            </p>
            <div className={`${styles.ctas} ${styles.heroButtons}`}>
              <a href="/contacto" className={styles.primary}>
                Solicita una asesoría
              </a>
              <a href="/soluciones" className={styles.secondary}>
                Ver soluciones
              </a>
            </div>
          </section>
        </div>

        <nav className={styles.quickNav} aria-label="Accesos rápidos">
          <a href="#noticias" className={styles.quickNavLink}>Noticias</a>
          <a href="#por-que" className={styles.quickNavLink}>Por qué Nexara</a>
          <a href="#soluciones" className={styles.quickNavLink}>Soluciones</a>
          <a href="#clientes" className={styles.quickNavLink}>Clientes</a>
          <a href="#faq" className={styles.quickNavLink}>FAQ</a>
        </nav>

        <section id="noticias" className={styles.newsSection} aria-labelledby="noticias-heading">
          <div className={styles.newsHeader}>
            <span className={styles.newsBadge}>NEXARA NEWS</span>
            <div>
              <h2 id="noticias-heading" className={styles.newsTitle}>Noticias que impulsan tu tecnologia</h2>
              <p className={styles.newsSubtitle}>
                Descubre alianzas, casos de exito y lanzamientos que te mantienen un paso adelante.
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
                    <span>Actualizacion</span>
                    <span>{formatNewsDate(activeNewsItem.publishedAt || activeNewsItem.createdAt)}</span>
                  </div>
                  <h3>{activeNewsItem.title}</h3>
                  <p>{activeNewsItem.summary || "Nueva noticia disponible."}</p>
                  <div className={styles.newsActions}>
                    <button
                      type="button"
                      className={styles.newsButton}
                      onClick={() => openNewsModal(activeNewsItem)}
                    >
                      Ver mas
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
            <div className={styles.newsEmpty}>Aun no hay noticias publicadas.</div>
          )}
        </section>

        <section id="por-que" className={styles.whyNexara} aria-labelledby="por-que-heading">
          <div className={styles.whyBadge}>CONFIANZA Y EXPERIENCIA</div>
          <h2 id="por-que-heading" className={styles.whyTitle}>¿Por qué Nexara?</h2>
          <p className={styles.whyDescription}>
            En Nexara, combinamos experiencia, calidad y atención personalizada para ofrecerte soluciones tecnológicas que impulsan tu negocio. Somos líderes en venta de equipos, integración de sistemas y soporte especializado.
          </p>
          <div className={styles.advantagesGrid}>
            <div className={`${styles.advantageCard} ${styles.advantageDelay1}`}>
              <div className={styles.advantageNumber}>01</div>
              <div className={styles.advantageIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3 className={styles.advantageTitle}>+10 años de experiencia</h3>
              <p className={styles.advantageText}>Respaldados por una década sirviendo a empresas con excelencia.</p>
            </div>
            <div className={`${styles.advantageCard} ${styles.advantageDelay2}`}>
              <div className={styles.advantageNumber}>02</div>
              <div className={styles.advantageIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className={styles.advantageTitle}>Soporte especializado</h3>
              <p className={styles.advantageText}>Equipo técnico disponible 24/7 para resolver tus dudas.</p>
            </div>
            <div className={`${styles.advantageCard} ${styles.advantageDelay3}`}>
              <div className={styles.advantageNumber}>03</div>
              <div className={styles.advantageIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <h3 className={styles.advantageTitle}>Marcas líderes</h3>
              <p className={styles.advantageText}>Productos de fabricantes reconocidos mundialmente.</p>
            </div>
            <div className={`${styles.advantageCard} ${styles.advantageDelay4}`}>
              <div className={styles.advantageNumber}>04</div>
              <div className={styles.advantageIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 className={styles.advantageTitle}>Soluciones llave en mano</h3>
              <p className={styles.advantageText}>Implementación completa desde la cotización hasta la puesta en marcha.</p>
            </div>
          </div>
        </section>

        <section id="soluciones" className={styles.servicesSection} aria-labelledby="soluciones-heading">
          <h2 id="soluciones-heading" className={styles.newsTitle}>Soluciones destacadas</h2>
          <div className={styles.serviceCard}>
            <div className={styles.serviceContent}>
              <div className={styles.serviceBadge}>ADECUADO A TUS NECESIDADES</div>
              <h3 className={styles.serviceTitle}>Soluciones Personalizadas</h3>
              <p className={styles.serviceDescription}>
                Diseñamos soluciones TI a la medida para empresas y gobierno: infraestructura, energía, centros de datos y ciberseguridad con acompañamiento de punta a punta.
              </p>
            </div>
            <div className={styles.serviceImageWrapper}>
              <Image
                src={versionedPublicSrc("soluciones-personalizadas.jpg")}
                alt="Soluciones Personalizadas"
                width={200}
                height={200}
                className={styles.serviceImage}
              />
            </div>
          </div>

          <div className={styles.serviceCard}>
            <div className={styles.serviceContent}>
              <div className={styles.serviceBadge}>EQUIPOS DE VANGUARDIA</div>
              <h3 className={styles.serviceTitle}>Ventas</h3>
              <p className={styles.serviceDescription}>
                Te ayudamos a elegir equipos de última generación de marcas líderes, con asesoría clara para que compres justo lo que tu operación necesita.
              </p>
            </div>
            <div className={styles.serviceImageWrapper}>
              <Image
                src={versionedPublicSrc("ventas-equipos.jpg")}
                alt="Ventas de Equipos"
                width={200}
                height={200}
                className={styles.serviceImage}
              />
            </div>
          </div>
        </section>

        <CertificationsCarousel />
        <BrandsCarousel />

        {/* Clientes satisfechos */}
        <section id="clientes" className={styles.clientsSection} aria-labelledby="clientes-heading">
          <div className={styles.clientsHeader}>
            <div className={styles.clientsBadge}>RESULTADOS QUE RESPALDAN</div>
            <h2 id="clientes-heading" className={styles.clientsTitle}>Clientes satisfechos</h2>
            <p className={styles.clientsSubtitle}>
              Empresas que confían en nosotros para impulsar su tecnología.
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
                  <p className={styles.clientDescription}>{c.description || "Cliente satisfecho"}</p>
                </div>
              </div>
            );
            })}
          </div>
        </section>

        <ContactFormToggle />
        <section id="faq">
          <FAQ />
        </section>
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
                  {selectedNews.summary || "Actualizacion destacada de Nexara."}
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
