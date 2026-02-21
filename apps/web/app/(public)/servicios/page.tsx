import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import path from "path";
import FloatingContactForm from "../../components/FloatingContactForm";
import styles from "./page.module.css";

export const metadata = {
  title: "Servicios | Nexara",
  description: "Expertos en tecnología: venta de computadoras, accesorios, videovigilancia y soluciones para gobierno, educación, pymes y más",
};

const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function getPublicImages(subdir: string): string[] {
  try {
    // Try monorepo path first: /apps/web/public/<subdir>
    const monorepoDir = path.join(process.cwd(), "apps", "web", "public", subdir);
    const appDir = path.join(process.cwd(), "public", subdir);
    const dir = fs.existsSync(monorepoDir) ? monorepoDir : appDir;
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    return files
      .filter((f) => imageExtensions.includes(path.extname(f).toLowerCase()))
      .map((f) => `/${subdir}/${f}`);
  } catch {
    return [];
  }
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  // Simple xorshift32 based on seed string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    h >>>= 0;
  }
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    const j = (h % (i + 1)) >>> 0;
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function resolveServDir(): string | null {
  const monorepoDir = path.join(process.cwd(), "apps", "web", "public", "servicios");
  const appDir = path.join(process.cwd(), "public", "servicios");
  if (fs.existsSync(monorepoDir)) return monorepoDir;
  if (fs.existsSync(appDir)) return appDir;
  return null;
}

function withVersionServ(src: string): string {
  try {
    const dir = resolveServDir();
    if (!dir) return src;
    const fileName = src.split("/servicios/")[1];
    if (!fileName) return src;
    const abs = path.join(dir, fileName);
    const mtime = fs.statSync(abs).mtimeMs | 0;
    return `${src}?v=${mtime}`;
  } catch {
    return src;
  }
}

export default function ServiciosPage() {
  const serviciosRaw = getPublicImages("servicios");
  const serviciosImages = seededShuffle(serviciosRaw, "servicios");
  const byName = (token: string) => serviciosImages.find((src) => path.basename(src).toLowerCase().includes(token));
  const rectSrcA = byName("rect-1") ?? serviciosImages[0];
  const squareSrcs = [byName("square-1"), byName("square-2")] .filter(Boolean) as string[];
  if (squareSrcs.length < 2) {
    const pool = serviciosImages.filter((s) => s !== rectSrcA);
    while (squareSrcs.length < 2 && pool.length) squareSrcs.push(pool.shift()!);
  }
  const rectSrcB = byName("rect-2") ?? serviciosImages[3] ?? serviciosImages[1];
  return (
    <>
    <main className={styles.container}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>EXPERTOS EN TECNOLOGÍA</div>
          <h1 className={styles.heroTitle}>¿Tienes un proyecto en mente?</h1>
          <p className={styles.heroSubtitle}>
            Has llegado con los expertos. Encuentra los mejores productos y tecnología
            al mejor precio. Te ayudamos a equipar y modernizar tu operación con
            soluciones diseñadas para tu sector.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/contacto" className={styles.primaryCta}>
              Solicitar asesoría
            </Link>
            <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">
              WhatsApp directo
            </Link>
          </div>
        </div>
      </section>

      {/* Espacio estratégico 1 (rectangular, después del hero) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaRect}>
          <div className={styles.mediaRectInner}>
            {rectSrcA ? (
              <Image
                src={withVersionServ(rectSrcA)}
                alt="Servicio destacado"
                fill
                   sizes="(min-width: 900px) 900px, 100vw"
                quality={90}
                style={{ objectFit: "cover" }}
                priority
              />
            ) : (
              <div className={styles.mediaPlaceholder}>Espacio rectangular 16:9</div>
            )}
          </div>
        </div>
      </section>

      {/* Sectores que atendemos */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sectores que atendemos</h2>
          <p className={styles.sectionLead}>
            Conocemos las necesidades específicas de cada industria y ofrecemos
            soluciones personalizadas que impulsan tu éxito.
          </p>
        </div>

        <div className={styles.sectorsGrid}>
          <article className={styles.sectorCard}>
            <div className={styles.sectorIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h3>Gobierno</h3>
            <p>
              Equipamiento tecnológico para oficinas gubernamentales, sistemas de
              gestión documental, videovigilancia y soluciones de ciberseguridad
              para entidades públicas.
            </p>
          </article>

          <article className={styles.sectorCard}>
            <div className={styles.sectorIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h3>Educativo</h3>
            <p>
              Soluciones para escuelas y universidades: laboratorios de cómputo,
              proyectores, pizarras interactivas, redes wifi institucionales y
              sistemas de gestión académica.
            </p>
          </article>

          <article className={styles.sectorCard}>
            <div className={styles.sectorIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <circle cx="9" cy="10" r="2" />
                <path d="M9 21V16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
              </svg>
            </div>
            <h3>Hogar</h3>
            <p>
              Computadoras personales, periféricos, sistemas de entretenimiento,
              redes domésticas inteligentes, videovigilancia residencial y
              automatización del hogar.
            </p>
          </article>

          <article className={styles.sectorCard}>
            <div className={styles.sectorIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3>Pymes</h3>
            <p>
              Equipamiento completo para pequeñas y medianas empresas: estaciones
              de trabajo, servidores, redes, punto de venta, respaldos en nube y
              soporte técnico continuo.
            </p>
          </article>

          <article className={styles.sectorCard}>
            <div className={styles.sectorIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3>Salud</h3>
            <p>
              Soluciones especializadas para clínicas y hospitales: equipos médicos
              certificados, sistemas de gestión hospitalaria, respaldos HIPAA y
              redes seguras para información sensible.
            </p>
          </article>

          <article className={styles.sectorCard}>
            <div className={styles.sectorIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M6 12h.01M18 12h.01" />
              </svg>
            </div>
            <h3>Industria</h3>
            <p>
              Tecnología industrial robusta: computadoras industriales, sistemas de
              control, automatización, videovigilancia perimetral y soluciones IoT
              para manufactura.
            </p>
          </article>
        </div>
      </section>

      {/* Espacio estratégico 2 (dos cuadrados, tras sectores) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaSquares}>
          {[0, 1].map((i) => {
            const src = squareSrcs[i];
            return (
              <div key={i} className={styles.squareItem}>
                {src ? (
                  <Image
                    src={withVersionServ(src)}
                    alt={`Servicio ${i + 2}`}
                    fill
                    sizes="(max-width: 900px) 90vw, 420px"
                    quality={90}
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div className={styles.squarePlaceholder}>Espacio cuadrado 1:1</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Servicios principales */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Nuestros servicios principales</h2>
          <p className={styles.sectionLead}>
            Soluciones tecnológicas completas respaldadas por marcas líderes y
            atención profesional personalizada.
          </p>
        </div>

        <div className={styles.servicesGrid}>
          <article className={styles.serviceCard}>
            <div className={styles.serviceNumber}>01</div>
            <div className={styles.serviceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className={styles.serviceContent}>
              <h3>Venta de computadoras</h3>
              <p>
                Amplio catálogo de equipos de cómputo para todas las necesidades:
                laptops, desktops, workstations, servidores y equipos All-in-One
                de las marcas más confiables del mercado.
              </p>
              <ul className={styles.serviceFeatures}>
                <li>Laptops empresariales y personales</li>
                <li>Desktops personalizadas según requerimientos</li>
                <li>Workstations para diseño y renderizado</li>
                <li>Servidores Dell, HP, Lenovo</li>
                <li>Equipos gaming y multimedia</li>
                <li>Garantía extendida y soporte técnico</li>
              </ul>
            </div>
          </article>

          <article className={styles.serviceCard}>
            <div className={styles.serviceNumber}>02</div>
            <div className={styles.serviceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                <circle cx="9" cy="10" r="1" />
                <circle cx="15" cy="10" r="1" />
              </svg>
            </div>
            <div className={styles.serviceContent}>
              <h3>Accesorios y periféricos</h3>
              <p>
                Todo lo que necesitas para complementar tu equipo: desde teclados
                y ratones hasta soluciones de almacenamiento, impresoras y
                dispositivos de red empresariales.
              </p>
              <ul className={styles.serviceFeatures}>
                <li>Teclados mecánicos y ergonómicos</li>
                <li>Monitores profesionales y gaming</li>
                <li>Impresoras láser y multifuncionales</li>
                <li>Discos duros externos y SSD</li>
                <li>Routers, switches y access points</li>
                <li>UPS y reguladores de voltaje</li>
              </ul>
            </div>
          </article>

          <article className={styles.serviceCard}>
            <div className={styles.serviceNumber}>03</div>
            <div className={styles.serviceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div className={styles.serviceContent}>
              <h3>Videovigilancia y seguridad</h3>
              <p>
                Sistemas de CCTV profesionales para proteger tu negocio o residencia.
                Instalación, configuración y soporte de cámaras IP, DVR/NVR y
                sistemas de acceso.
              </p>
              <ul className={styles.serviceFeatures}>
                <li>Cámaras IP de alta resolución 4K</li>
                <li>Sistemas DVR/NVR con almacenamiento</li>
                <li>Monitoreo remoto desde dispositivos móviles</li>
                <li>Cámaras térmicas y analíticas</li>
                <li>Control de acceso biométrico</li>
                <li>Instalación y mantenimiento profesional</li>
              </ul>
            </div>
          </article>

          <article className={styles.serviceCard}>
            <div className={styles.serviceNumber}>04</div>
            <div className={styles.serviceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div className={styles.serviceContent}>
              <h3>Redes y conectividad</h3>
              <p>
                Diseño, instalación y configuración de redes empresariales: cableado
                estructurado, redes inalámbricas, VPN y optimización de conectividad
                para tu operación.
              </p>
              <ul className={styles.serviceFeatures}>
                <li>Cableado estructurado certificado</li>
                <li>Redes WiFi 6 de alto rendimiento</li>
                <li>Configuración de switches y routers</li>
                <li>VPN y acceso remoto seguro</li>
                <li>Análisis y optimización de red</li>
                <li>Soporte técnico y monitoreo 24/7</li>
              </ul>
            </div>
          </article>

          <article className={styles.serviceCard}>
            <div className={styles.serviceNumber}>05</div>
            <div className={styles.serviceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <div className={styles.serviceContent}>
              <h3>Mantenimiento y soporte</h3>
              <p>
                Servicios de mantenimiento preventivo y correctivo para equipos de
                cómputo, servidores y redes. Soporte técnico profesional para
                mantener tu operación funcionando sin interrupciones.
              </p>
              <ul className={styles.serviceFeatures}>
                <li>Mantenimiento preventivo programado</li>
                <li>Reparación y diagnóstico de equipos</li>
                <li>Soporte técnico remoto y en sitio</li>
                <li>Actualización de hardware y software</li>
                <li>Limpieza y optimización de sistemas</li>
                <li>Contratos de soporte 24/7</li>
              </ul>
            </div>
          </article>

          <article className={styles.serviceCard}>
            <div className={styles.serviceNumber}>06</div>
            <div className={styles.serviceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div className={styles.serviceContent}>
              <h3>Licenciamiento de software</h3>
              <p>
                Venta de licencias originales y asesoría en el cumplimiento legal
                de software: Microsoft, Adobe, Autodesk, antivirus empresariales y
                más. Renovaciones y actualizaciones.
              </p>
              <ul className={styles.serviceFeatures}>
                <li>Microsoft Office 365 y Windows</li>
                <li>Licencias Adobe Creative Cloud</li>
                <li>Antivirus corporativos (Kaspersky, ESET)</li>
                <li>Software de diseño (AutoCAD, SolidWorks)</li>
                <li>Sistemas operativos para servidores</li>
                <li>Asesoría en licenciamiento empresarial</li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      {/* Espacio estratégico 2 (después de servicios principales) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaRect}>
          <div className={styles.mediaRectInner}>
            {rectSrcB ? (
              <Image
                src={withVersionServ(rectSrcB)}
                alt="Servicio secundario"
                fill
                   sizes="(min-width: 900px) 900px, 100vw"
                quality={90}
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div className={styles.mediaPlaceholder}>Espacio rectangular 16:9</div>
            )}
          </div>
        </div>
      </section>

      {/* Por qué elegirnos */}
      <section className={styles.section}>
        <div className={styles.whyUsSection}>
          <div className={styles.whyUsContent}>
            <h2 className={styles.sectionTitle}>¿Por qué elegirnos?</h2>
            <p className={styles.whyUsLead}>
              Más de 8 años de experiencia nos respaldan como uno de los proveedores
              tecnológicos más confiables de México.
            </p>
            <div className={styles.benefitsGrid}>
              <div className={styles.benefitItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Mejores precios del mercado</span>
              </div>
              <div className={styles.benefitItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Productos 100% originales y certificados</span>
              </div>
              <div className={styles.benefitItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Asesoría personalizada sin costo</span>
              </div>
              <div className={styles.benefitItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Garantía extendida en todos los productos</span>
              </div>
              <div className={styles.benefitItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Instalación y configuración profesional</span>
              </div>
              <div className={styles.benefitItem}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Soporte técnico continuo 24/7</span>
              </div>
            </div>
          </div>
          <div className={styles.whyUsImage}>
            <div className={styles.statsCard}>
              <div className={styles.statItem}>
                <h3>8+</h3>
                <p>Años de experiencia</p>
              </div>
              <div className={styles.statItem}>
                <h3>500+</h3>
                <p>Clientes satisfechos</p>
              </div>
              <div className={styles.statItem}>
                <h3>300+</h3>
                <p>Proyectos completados</p>
              </div>
              <div className={styles.statItem}>
                <h3>95%</h3>
                <p>SLA de cumplimiento</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className={styles.finalCta}>
        <div className={styles.ctaContent}>
          <h2>¿Listo para equipar tu proyecto?</h2>
          <p>
            Nuestros asesores están listos para ayudarte a encontrar las mejores
            soluciones tecnológicas al mejor precio.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/contacto" className={styles.primaryCta}>
              Solicitar cotización
            </Link>
            <Link href="/soluciones" className={styles.secondaryCta}>
              Ver soluciones TI
            </Link>
          </div>
        </div>
      </section>
    </main>
    <FloatingContactForm />
    </>
  );
}
