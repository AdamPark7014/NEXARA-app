"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import ContactFormToggle from "../components/ContactFormToggle";
import styles from "../page.module.css";
import corporateStyles from "./landing-corporate.module.css";
import { buildApiUrl, getApiBase } from "@/lib/api-base";
import { MX_ADMIN1_PATHS } from "./mxAdmin1Paths";

interface Client {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
}

const normalizeClient = (value: unknown): Client => {
  const item = (value ?? {}) as Partial<Client>;
  return {
    id: Number(item.id) || 0,
    name: typeof item.name === "string" ? item.name : "Cliente sin nombre",
    description: typeof item.description === "string" ? item.description : undefined,
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
  };
};

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

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await fetch(buildApiUrl("clients"));
      if (response.ok) {
        const raw = (await response.json()) as unknown;
        setClients(Array.isArray(raw) ? raw.map(normalizeClient) : []);
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
          id="cobertura"
          data-ui="landing-coverage-map"
          className={styles.coverageMapSection}
          aria-labelledby="cobertura-map-heading"
          data-reveal="up"
        >
          <header className={styles.coverageHeader} data-reveal="soft">
            <div className={styles.coverageTitleRow}>
              <div className={styles.coverageChevrons} aria-hidden />
              <h2 id="cobertura-map-heading" className={styles.coverageTitle}>
                COBERTURA
              </h2>
              <span className={styles.coverageTitleRule} aria-hidden />
            </div>
            <p className={styles.coverageSubtitle}>PRESENCIA EN MÉXICO</p>
          </header>

          <div className={styles.coverageGrid} data-reveal-stagger>
            <aside className={styles.coverageList} aria-label="Cobertura por estado (oeste y centro)" data-reveal="up">
              <ol className={styles.coverageOl}>
                <li>Hidalgo: 4 Cds</li>
                <li>Colima: 1 Cd</li>
                <li>Michoacán: 2 Cds</li>
                <li>CDMX: 3 Cds</li>
                <li>EDOMEX: 3 Cds</li>
                <li>Tlaxcala: Todo el estado</li>
                <li>Puebla: 5 Cds</li>
                <li>Querétaro: 1 Cd</li>
                <li>Veracruz: 7 Cds</li>
                <li>Oaxaca: Todo el estado</li>
                <li>Chiapas: 4 Cds</li>
                <li>Campeche: 2 Cds</li>
                <li>Yucatán: 5 Cds</li>
                <li>Quintana Roo: 4 Cds</li>
              </ol>
            </aside>

            <div className={styles.coverageMapCard} aria-label="Mapa de cobertura" data-reveal="up">
              <div className={styles.coverageMapInner}>
                <svg
                  className={styles.coverageMexicoSvg}
                  viewBox="0 0 1000 630"
                  role="img"
                  aria-label="Mapa de México (cobertura Nexara)"
                >
                  <defs>
                    {/* Contorno único (sin líneas internas) a partir del fill */}
                    <filter id="mxOutline" x="-45%" y="-45%" width="190%" height="190%" colorInterpolationFilters="sRGB">
                      {/* 1) Stroke externo: dilate - original */}
                      <feMorphology in="SourceAlpha" operator="dilate" radius="7.2" result="dilated" />
                      <feComposite in="dilated" in2="SourceAlpha" operator="out" result="outerStroke" />

                      {/* 2) Línea nítida (teal) */}
                      <feColorMatrix
                        in="outerStroke"
                        type="matrix"
                        values="0 0 0 0 0.02  0 0 0 0 0.95  0 0 0 0 0.84  0 0 0 1 0"
                        result="strokeTeal"
                      />

                      {/* 3) Glow suave y glow fuerte (como póster) */}
                      <feGaussianBlur in="strokeTeal" stdDeviation="8" result="glowSoft" />
                      <feGaussianBlur in="strokeTeal" stdDeviation="16" result="glowStrong" />
                      <feColorMatrix
                        in="glowStrong"
                        type="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.7 0"
                        result="glowStrongAlpha"
                      />

                      <feMerge>
                        <feMergeNode in="glowStrongAlpha" />
                        <feMergeNode in="glowSoft" />
                        <feMergeNode in="strokeTeal" />
                      </feMerge>
                    </filter>

                    {/* Pin con logo Nexara (recorte circular) */}
                    <clipPath id="mxPinLogoClip">
                      <circle cx="0" cy="0" r="18" />
                    </clipPath>
                  </defs>

                  {/* Mapa real (admin1) — fill sin bordes internos */}
                  <g className={styles.mxShape} aria-hidden="true">
                    {MX_ADMIN1_PATHS.map((d) => (
                      <path key={d.slice(0, 18)} d={d} />
                    ))}
                  </g>

                  {/* Contorno único generado desde el fill */}
                  <g className={styles.mxOutline} filter="url(#mxOutline)" aria-hidden="true">
                    {MX_ADMIN1_PATHS.map((d) => (
                      <path key={`o-${d.slice(0, 18)}`} d={d} />
                    ))}
                  </g>

                  {/* Pines (aprox. como referencia) */}
                  <g className={styles.mxPins} aria-hidden="true">
                    {(
                      [
                        { x: 250, y: 175 },
                        { x: 420, y: 250 },
                        { x: 540, y: 240 },
                        { x: 700, y: 300 },
                        { x: 780, y: 415 },
                        { x: 510, y: 420 },
                      ] as const
                    ).map((p) => (
                      <g key={`${p.x}-${p.y}`} className={styles.mxPin} transform={`translate(${p.x} ${p.y})`}>
                        <ellipse className={styles.mxPinRing} cx="0" cy="34" rx="30" ry="12" />
                        <path
                          className={styles.mxPinBody}
                          d="M0,40 C-18,24 -26,12 -26,0 C-26,-16 -14,-28 0,-28 C14,-28 26,-16 26,0 C26,12 18,24 0,40 Z"
                        />
                        <circle className={styles.mxPinFace} cx="0" cy="-2" r="20" />
                        <image
                          href="/logo-nexara.png"
                          x="-18"
                          y="-20"
                          width="36"
                          height="36"
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="url(#mxPinLogoClip)"
                          className={styles.mxPinLogo}
                        />
                        <circle className={styles.mxPinFaceStroke} cx="0" cy="-2" r="20" />
                      </g>
                    ))}
                  </g>
                </svg>
              </div>
            </div>

            <aside className={styles.coverageList} aria-label="Cobertura por estado (norte y bajío)" data-reveal="up">
              <ol className={styles.coverageOl}>
                <li>Baja California: Todo el estado</li>
                <li>Baja California Sur: 4 Cds</li>
                <li>Sonora: 1 Cd</li>
                <li>Coahuila: 2 Cds</li>
                <li>Chihuahua: 3 Cds</li>
                <li>Sinaloa: 2 Cds</li>
                <li>Durango: 1 Cd</li>
                <li>Zacatecas: 1 Cd</li>
                <li>Nuevo León: 2 Cds</li>
                <li>Tamaulipas: 4 Cds</li>
                <li>Nayarit: 2 Cds</li>
                <li>San Luis Potosí: 1 Cd</li>
                <li>Aguascalientes: 1 Cd</li>
                <li>Jalisco: 4 Cds</li>
                <li>Guanajuato: 2 Cds</li>
                <li>Querétaro: Todo el estado</li>
              </ol>
            </aside>
          </div>

          <div className={styles.coverageFooter}>
            <p className={styles.coverageStatement}>
              En Nexara combinamos experiencia operativa, ejecución técnica y seguimiento para entregar resultados
              medibles.
            </p>

            <div className={styles.coverageSupport} aria-label="Indicadores de respaldo">
              <h3 className={styles.coverageSupportTitle}>NOS RESPALDAN</h3>
              <div className={styles.coverageMetrics}>
                <article className={styles.coverageMetric}>
                  <strong>+10</strong>
                  <span>AÑOS</span>
                  <small>de experiencia en TI empresarial.</small>
                </article>
                <article className={styles.coverageMetric}>
                  <strong>+500</strong>
                  <span>CLIENTES</span>
                  <small>atendidos en distintos sectores.</small>
                </article>
                <article className={styles.coverageMetric}>
                  <strong>+300</strong>
                  <span>PROYECTOS</span>
                  <small>implementados de punta a punta.</small>
                </article>
                <article className={styles.coverageMetric}>
                  <strong>95%</strong>
                  <span>SLA</span>
                  <small>de cumplimiento en servicio.</small>
                </article>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
