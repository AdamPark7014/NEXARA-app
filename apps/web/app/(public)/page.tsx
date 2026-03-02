"use client";

import { useState, useEffect } from "react";
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
    if (selectedNews) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
    return undefined;
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
      <main className={styles.main}>
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

        <section className={styles.newsSection}>
          <div className={styles.newsHeader}>
            <span className={styles.newsBadge}>NEXARA NEWS</span>
            <div>
              <h2 className={styles.newsTitle}>Noticias que impulsan tu tecnologia</h2>
              <p className={styles.newsSubtitle}>
                Descubre alianzas, casos de exito y lanzamientos que te mantienen un paso adelante.
              </p>
            </div>
          </div>

          {activeNewsItem ? (
            <div className={styles.newsCarousel}>
              <button
                className={styles.newsNav}
                onClick={() => setActiveNews((prev) => (prev - 1 + news.length) % news.length)}
                aria-label="Noticia anterior"
              >
                ‹
              </button>
              <div key={activeNewsItem.id} className={styles.newsSlide}>
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
                    <div className={styles.newsDots}>
                      {news.map((item, index) => (
                        <button
                          key={item.id}
                          className={
                            index === activeNews
                              ? styles.newsDotActive
                              : styles.newsDot
                          }
                          onClick={() => setActiveNews(index)}
                          aria-label={`Ir a noticia ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button
                className={styles.newsNav}
                onClick={() => setActiveNews((prev) => (prev + 1) % news.length)}
                aria-label="Siguiente noticia"
              >
                ›
              </button>
            </div>
          ) : (
            <div className={styles.newsEmpty}>Aun no hay noticias publicadas.</div>
          )}
        </section>

        <section className={styles.whyNexara}>
          <div className={styles.whyBadge}>CONFIANZA Y EXPERIENCIA</div>
          <h2 className={styles.whyTitle}>¿Por qué Nexara?</h2>
          <p className={styles.whyDescription}>
            En Nexara, combinamos experiencia, calidad y atención personalizada para ofrecerte soluciones tecnológicas que impulsan tu negocio. Somos líderes en venta de equipos, integración de sistemas y soporte especializado.
          </p>
          <div className={styles.advantagesGrid}>
            <div className={styles.advantageCard} style={{ animationDelay: '0.1s' }}>
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
            <div className={styles.advantageCard} style={{ animationDelay: '0.2s' }}>
              <div className={styles.advantageNumber}>02</div>
              <div className={styles.advantageIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className={styles.advantageTitle}>Soporte especializado</h3>
              <p className={styles.advantageText}>Equipo técnico disponible 24/7 para resolver tus dudas.</p>
            </div>
            <div className={styles.advantageCard} style={{ animationDelay: '0.3s' }}>
              <div className={styles.advantageNumber}>03</div>
              <div className={styles.advantageIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <h3 className={styles.advantageTitle}>Marcas líderes</h3>
              <p className={styles.advantageText}>Productos de fabricantes reconocidos mundialmente.</p>
            </div>
            <div className={styles.advantageCard} style={{ animationDelay: '0.4s' }}>
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

        <section className={styles.servicesSection}>
          <div className={styles.serviceCard}>
            <div className={styles.serviceContent}>
              <div className={styles.serviceBadge}>ADECUADO A TUS NECESIDADES</div>
              <h3 className={styles.serviceTitle}>Soluciones Personalizadas</h3>
              <p className={styles.serviceDescription}>
                Brindamos soluciones tecnológicas personalizadas a tus necesidades en los sectores empresarial y gubernamental, desde la implementación de infraestructura, energía, centros de datos, hasta ciberseguridad.
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
                ¿Estás buscando equipos tecnológicos de última generación que no solo cumplan, sino que superen tus expectativas? ¡No busques más! En NEXARA, te ofrecemos una amplia gama de productos de las mejores y más reconocidas marcas.
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
        <section className={styles.clientsSection}>
          <div className={styles.clientsHeader}>
            <div className={styles.clientsBadge}>RESULTADOS QUE RESPALDAN</div>
            <h2 className={styles.clientsTitle}>Clientes satisfechos</h2>
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
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
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
        <FAQ />
      </main>
      <FloatingContactForm />

      {selectedNews && (
        <div className={styles.newsModalOverlay} onClick={closeNewsModal}>
          <div className={styles.newsModal} onClick={(event) => event.stopPropagation()}>
            <button className={styles.newsClose} onClick={closeNewsModal} aria-label="Cerrar">
              ✕
            </button>
            <div className={styles.newsModalContent}>
              <div className={styles.newsModalText}>
                <span className={styles.newsModalBadge}>Noticia</span>
                <h3>{selectedNews.title}</h3>
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
                        className={
                          index === selectedImage
                            ? styles.newsGalleryActive
                            : styles.newsGalleryItem
                        }
                        onClick={() => setSelectedImage(index)}
                        aria-label={`Ver imagen ${index + 1}`}
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
