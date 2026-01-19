"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import CertificationsCarousel from "./components/CertificationsCarousel";
import BrandsCarousel from "./components/BrandsCarousel";
import ContactFormToggle from "./components/ContactFormToggle";
import FloatingContactForm from "./components/FloatingContactForm";
import FAQ from "./components/FAQ";
import styles from "./page.module.css";

interface Client {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

export default function Home() {
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${API_URL}/clients`);
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

  // Fondo del hero (usa una imagen pública si existe)
  const heroBgSrc = versionedPublicSrc("hero-bg.jpg");
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.heroWrapper}>
          {heroBgSrc && (
            <div className={styles.heroBg}>
              <Image
                src={heroBgSrc}
                alt="Fondo del hero"
                fill
                priority
                className={styles.heroBgImage}
              />
              <div className={styles.heroBgOverlay} />
            </div>
          )}
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

        <section className={styles.whyNexara}>
          <div className={styles.whyBadge}>CONFIANZA Y EXPERIENCIA</div>
          <h2 className={styles.whyTitle}>¿Por qué Nexara?</h2>
          <p className={styles.whyDescription}>
            En Nexara, combinamos experiencia, calidad y atención personalizada para ofrecerte soluciones tecnológicas que impulsan tu negocio. Somos líderes en venta de equipos, integración de sistemas y soporte especializado.
          </p>
          <div className={styles.advantagesGrid}>
            <div className={styles.advantageCard} style={{ animationDelay: '0.1s' }}>
              <div className={styles.advantageNumber}>01</div>
              <div className={styles.advantageIcon}></div>
              <h3 className={styles.advantageTitle}>+10 años de experiencia</h3>
              <p className={styles.advantageText}>Respaldados por una década sirviendo a empresas.</p>
            </div>
            <div className={styles.advantageCard} style={{ animationDelay: '0.2s' }}>
              <div className={styles.advantageNumber}>02</div>
              <div className={styles.advantageIcon}></div>
              <h3 className={styles.advantageTitle}>Soporte especializado</h3>
              <p className={styles.advantageText}>Equipo técnico disponible para resolver tus dudas.</p>
            </div>
            <div className={styles.advantageCard} style={{ animationDelay: '0.3s' }}>
              <div className={styles.advantageNumber}>03</div>
              <div className={styles.advantageIcon}></div>
              <h3 className={styles.advantageTitle}>Marcas líderes</h3>
              <p className={styles.advantageText}>Productos de fabricantes reconocidos mundialmente.</p>
            </div>
            <div className={styles.advantageCard} style={{ animationDelay: '0.4s' }}>
              <div className={styles.advantageNumber}>04</div>
              <div className={styles.advantageIcon}></div>
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
    </div>
  );
}

