import Link from "next/link";
import FloatingContactForm from "../../components/FloatingContactForm";
import BrandsCarousel from "../../components/BrandsCarousel";
import Image from "next/image";
import fs from "fs";
import path from "path";
import styles from "./page.module.css";

export const metadata = {
  title: "Soluciones | Nexara",
  description: "Soluciones integrales de TI para tu empresa: equipamiento, redes, seguridad, virtualización y más",
};

const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function getPublicImages(subdir: string): string[] {
  try {
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

function resolveSolDir(): string | null {
  const monorepoDir = path.join(process.cwd(), "apps", "web", "public", "soluciones");
  const appDir = path.join(process.cwd(), "public", "soluciones");
  if (fs.existsSync(monorepoDir)) return monorepoDir;
  if (fs.existsSync(appDir)) return appDir;
  return null;
}

function withVersionSol(src: string): string {
  try {
    const dir = resolveSolDir();
    if (!dir) return src;
    const fileName = src.split("/soluciones/")[1];
    if (!fileName) return src;
    const abs = path.join(dir, fileName);
    const mtime = fs.statSync(abs).mtimeMs | 0;
    return `${src}?v=${mtime}`;
  } catch {
    return src;
  }
}

export default function SolucionesPage() {
  const solucionesRaw = getPublicImages("soluciones");
  const solucionesImages = seededShuffle(solucionesRaw, "soluciones");
  // Use different index pattern than servicios to ensure variety
  const byName = (token: string) => solucionesImages.find((src) => path.basename(src).toLowerCase().includes(token));
  const rectSrcA = byName("rect-a") ?? solucionesImages[2] ?? solucionesImages[0];
  const squareSrcs = [byName("square-a"), byName("square-b")] .filter(Boolean) as string[];
  if (squareSrcs.length < 2) {
    const pool = solucionesImages.filter((s) => s !== rectSrcA);
    while (squareSrcs.length < 2 && pool.length) squareSrcs.push(pool.shift()!);
  }
  const rectSrcB = byName("rect-b") ?? solucionesImages[4] ?? solucionesImages[1];
  return (
    <>
    <main className={styles.container} aria-label="Página de soluciones">
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Soluciones integrales de TI</h1>
          <p className={styles.heroSubtitle}>
            En NEXARA nos especializamos en ofrecer asesoramiento integral para la
            adquisición, instalación e implementación de Tecnologías de la Información.
            Entendemos los procesos y desafíos únicos de cada empresa, lo que nos permite
            ofrecer soluciones personalizadas que se ajusten a sus necesidades específicas.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/contacto" className={styles.primaryCta}>Solicitar cotización</Link>
            <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">WhatsApp</Link>
          </div>
        </div>
      </section>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#areas" className={styles.quickNavLink}>Áreas de solución</a>
        <a href="#arrendamiento" className={styles.quickNavLink}>Arrendamiento</a>
        <a href="#soporte" className={styles.quickNavLink}>Soporte empresarial</a>
        <a href="#marcas" className={styles.quickNavLink}>Marcas</a>
      </nav>

      {/* Espacio estratégico 1 (después del hero) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaRect}>
          <div className={styles.mediaRectInner}>
            {rectSrcA ? (
              <Image
                src={withVersionSol(rectSrcA)}
                alt="Solución destacada"
                fill
                sizes="(min-width: 900px) 900px, 100vw"
                quality={90}
                className={styles.mediaCoverImage}
                priority
              />
            ) : (
              <div className={styles.mediaPlaceholder}>Espacio rectangular 16:9</div>
            )}
          </div>
        </div>
      </section>

      {/* Nuestro equipo y alianzas */}
      <section className={styles.section}>
        <div className={styles.solutionsHighlight}>
          <div className={styles.solutionsIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h3 className={styles.cardTitle}>Equipo y alianzas estratégicas</h3>
            <p>
              Nuestra organización está compuesta por un equipo con amplia experiencia
              y un fuerte compromiso con la satisfacción de nuestros clientes. Mantenemos
              alianzas estratégicas con las principales marcas de tecnología y contamos
              con socios de negocios altamente capacitados, lo que garantiza el éxito
              y la calidad de nuestros servicios.
            </p>
          </div>
        </div>
      </section>

      {/* Áreas de solución */}
      <section id="areas" className={styles.section}>
        <h2 className={styles.sectionTitle}>Nuestras áreas de solución</h2>
        <div className={styles.solutionsGrid}>
          <article className={styles.solutionCard}>
            <div className={styles.solutionIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3 className={styles.cardTitle}>Equipamiento corporativo</h3>
            <p>
              Suministro de computadoras, servidores, componentes y periféricos de
              las marcas más confiables del mercado. Asesoramos en la selección del
              equipamiento ideal según tu presupuesto y objetivos.
            </p>
          </article>

          <article className={styles.solutionCard}>
            <div className={styles.solutionIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <h3 className={styles.cardTitle}>Infraestructura de redes</h3>
            <p>
              Diseño, instalación y configuración de redes LAN/WAN, cableado estructurado,
              switches, routers y puntos de acceso. Garantizamos conectividad robusta
              y escalable para tu operación.
            </p>
          </article>

          <article className={styles.solutionCard}>
            <div className={styles.solutionIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className={styles.cardTitle}>Seguridad informática</h3>
            <p>
              Implementación de firewalls, sistemas de detección de intrusos, antivirus
              empresarial, respaldos automáticos y políticas de seguridad. Protegemos
              tu información crítica contra amenazas actuales.
            </p>
          </article>

          <article className={styles.solutionCard}>
            <div className={styles.solutionIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                <polyline points="17 2 12 7 7 2" />
              </svg>
            </div>
            <h3 className={styles.cardTitle}>Virtualización y nube</h3>
            <p>
              Migración a entornos virtuales, implementación de servidores virtualizados,
              backup en nube y soluciones híbridas. Optimiza recursos y reduce costos
              operativos con tecnologías modernas.
            </p>
          </article>

          <article className={styles.solutionCard}>
            <div className={styles.solutionIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3 className={styles.cardTitle}>Energía y respaldo eléctrico</h3>
            <p>
              UPS, plantas de emergencia, reguladores y sistemas de protección eléctrica.
              Aseguramos continuidad operativa ante cortes o variaciones de voltaje
              en tu infraestructura crítica.
            </p>
          </article>

          <article className={styles.solutionCard}>
            <div className={styles.solutionIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3 className={styles.cardTitle}>Soporte y mantenimiento</h3>
            <p>
              Contratos de soporte técnico 24/7, mantenimiento preventivo y correctivo,
              monitoreo remoto y atención en sitio. Mantén tu operación funcionando
              sin interrupciones con respuesta menor a 4 horas.
            </p>
          </article>
        </div>
      </section>

      {/* Espacio estratégico 2 (dos cuadrados, tras áreas de solución) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaSquares}>
          {[0, 1].map((i) => {
            const src = squareSrcs[i];
            return (
              <div key={i} className={styles.squareItem}>
                {src ? (
                  <Image
                    src={withVersionSol(src)}
                    alt={`Solución ${i + 1}`}
                    fill
                     sizes="(max-width: 900px) 90vw, 420px"
                    quality={90}
                    className={styles.mediaCoverImage}
                  />
                ) : (
                  <div className={styles.squarePlaceholder}>Espacio cuadrado 1:1</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Espacio estratégico 3 (rectangular, antes de Arrendamiento) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaRect}>
          <div className={styles.mediaRectInner}>
            {rectSrcB ? (
              <Image
                src={withVersionSol(rectSrcB)}
                alt="Solución secundaria"
                fill
                sizes="(min-width: 900px) 900px, 100vw"
                quality={90}
                className={styles.mediaCoverImage}
              />
            ) : (
              <div className={styles.mediaPlaceholder}>Espacio rectangular 16:9</div>
            )}
          </div>
        </div>
      </section>

      {/* Arrendamiento */}
      <section id="arrendamiento" className={styles.section}>
        <div className={styles.leasingSection}>
          <div className={styles.leasingContent}>
            <div className={styles.leasingIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className={styles.leasingText}>
              <h3 className={styles.cardTitle}>Arrendamiento de equipos</h3>
              <p>
                <strong>¿Necesitas renovar el equipo tecnológico de tu empresa, pero no quieres descapitalizarte?</strong>
              </p>
              <p>
                En NEXARA ofrecemos <strong>Arrendamiento Puro y Arrendamiento Financiero</strong> para empresas,
                una herramienta estratégica para el desarrollo, modernización y competitividad de tu compañía.
              </p>
              <ul className={styles.leasingBenefits}>
                <li>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Conserva tu flujo de efectivo y capital de trabajo</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Pagos mensuales fijos y deducibles de impuestos</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Renueva tecnología sin grandes inversiones iniciales</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Opción de compra al final del periodo o renovación de equipos</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Incluye soporte técnico y mantenimiento durante el contrato</span>
                </li>
              </ul>
              <p className={styles.leasingCta}>
                Solicita una cotización y descubre cómo el arrendamiento puede impulsar
                la modernización de tu infraestructura TI sin afectar tu liquidez.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Consultoría y acompañamiento */}
      <section id="soporte" className={styles.section}>
        <div className={styles.consultingBanner}>
          <h3>Soporte Técnico Empresarial Integral</h3>
          <p>
            Entendemos que las operaciones modernas dependen de la continuidad y confiabilidad de tu infraestructura tecnológica.
            <strong> Nuestro servicio de Soporte Técnico Empresarial</strong> está diseñado específicamente para empresas con
            múltiples sucursales que requieren cobertura garantizada en equipos críticos de punto de venta, sistemas operativos
            y infraestructura tecnológica.
          </p>
          <div className={styles.supportFeatures}>
            <div className={styles.supportFeature}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <polyline points="16 8 12 12 8 10" />
              </svg>
              <span><strong>Cobertura geográfica amplia</strong><br/>Soporte en todas tus sucursales, sin importar la ubicación</span>
            </div>
            <div className={styles.supportFeature}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <polyline points="16 8 12 12 8 10" />
              </svg>
              <span><strong>Equipo dedicado</strong><br/>Ingenieros certificados asignados a tu cuenta</span>
            </div>
            <div className={styles.supportFeature}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <polyline points="16 8 12 12 8 10" />
              </svg>
              <span><strong>RTA garantizado</strong><br/>Respuesta menor a 4 horas en horario laboral</span>
            </div>
            <div className={styles.supportFeature}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <polyline points="16 8 12 12 8 10" />
              </svg>
              <span><strong>Traslado incluido</strong><br/>Cubrimos viaticos y gastos de desplazamiento</span>
            </div>
          </div>
        </div>
      </section>

      {/* Marcas con las que trabajamos */}
      <section id="marcas" className={styles.brandsSection}>
        <div className={styles.brandsHeader}>
          <h2 className={styles.sectionTitle}>Algunas de las marcas con las que trabajamos</h2>
          <p className={styles.lead}>
            Colaboramos con las marcas líderes en tecnología para garantizar
            soluciones de alta calidad y confiabilidad para tu empresa.
          </p>
        </div>
        <BrandsCarousel />
      </section>

      {/* CTA final */}
      <section className={styles.finalCta}>
        <h2>¿Listo para modernizar tu infraestructura?</h2>
        <p>Conversemos sobre la solución ideal para tu empresa.</p>
        <div className={styles.heroCtas}>
          <Link href="/contacto" className={styles.primaryCta}>Contactar asesor</Link>
          <Link href="/nexara" className={styles.secondaryCta}>Conocer más sobre Nexara</Link>
        </div>
      </section>
    </main>
    <FloatingContactForm />
    </>
  );
}
