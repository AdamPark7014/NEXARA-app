import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import path from "path";
import styles from "./page.module.css";

export const metadata = {
  title: "Servicios | Nexara",
  description: "Servicios tecnológicos para empresas: equipamiento, redes, seguridad, soporte y licenciamiento.",
};

const sectorOptions = [
  {
    key: "gobierno",
    label: "Gobierno",
    description: "Modernizamos entornos públicos con infraestructura segura, equipamiento y soporte operativo continuo.",
  },
  {
    key: "educativo",
    label: "Educativo",
    description: "Implementamos aulas y redes institucionales para aprendizaje digital con alta disponibilidad.",
  },
  {
    key: "pymes",
    label: "Pymes",
    description: "Diseñamos paquetes tecnológicos escalables para crecer sin frenar la operación.",
  },
  {
    key: "salud",
    label: "Salud",
    description: "Aseguramos continuidad y protección de información en clínicas y centros médicos.",
  },
  {
    key: "industria",
    label: "Industria",
    description: "Integración de TI para plantas y operaciones con foco en control, seguridad y productividad.",
  },
];

const serviceOptions = [
  {
    key: "computo",
    label: "Cómputo empresarial",
    accessories: "Laptops, workstations y servidores",
    description: "Suministro y configuración de equipos listos para operación y crecimiento.",
  },
  {
    key: "redes",
    label: "Redes y conectividad",
    accessories: "Switches, access points y cableado",
    description: "Diseño e implementación de redes estables, seguras y administrables.",
  },
  {
    key: "seguridad",
    label: "Videovigilancia y seguridad",
    accessories: "CCTV, control de acceso y monitoreo",
    description: "Cobertura integral para proteger activos físicos y digitales.",
  },
  {
    key: "soporte",
    label: "Soporte técnico",
    accessories: "Mesa de ayuda, mantenimiento y sitio",
    description: "Atención especializada con tiempos de respuesta definidos para continuidad.",
  },
  {
    key: "licencias",
    label: "Licenciamiento",
    accessories: "Productividad, seguridad y colaboración",
    description: "Gestión de licencias y cumplimiento para operar con software legal y actualizado.",
  },
];

const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function getPublicImages(subdir: string): string[] {
  try {
    // Try monorepo path first: /apps/web/public/<subdir>
    const monorepoDir = path.join(process.cwd(), "apps", "web", "public", subdir);
    const appDir = path.join(process.cwd(), "public", subdir);
    let dir: string | null = null;

    try {
      if (fs.statSync(monorepoDir).isDirectory()) {
        dir = monorepoDir;
      }
    } catch {}

    if (!dir) {
      try {
        if (fs.statSync(appDir).isDirectory()) {
          dir = appDir;
        }
      } catch {}
    }

    if (!dir) return [];
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

  try {
    if (fs.statSync(monorepoDir).isDirectory()) {
      return monorepoDir;
    }
  } catch {}

  try {
    if (fs.statSync(appDir).isDirectory()) {
      return appDir;
    }
  } catch {}

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

type ServiciosPageProps = {
  searchParams?: {
    sector?: string | string[];
    service?: string | string[];
  };
};

export default function ServiciosPage({ searchParams }: ServiciosPageProps) {
  const sectorParam = typeof searchParams?.sector === "string" ? searchParams.sector : undefined;
  const serviceParam = typeof searchParams?.service === "string" ? searchParams.service : undefined;
  const activeSector = sectorOptions.find((sector) => sector.key === sectorParam) ?? sectorOptions[0];
  const activeService = serviceOptions.find((service) => service.key === serviceParam) ?? serviceOptions[0];
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
    <main className={styles.container} aria-label="Página de servicios">
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>EXPERTOS EN TECNOLOGÍA</div>
          <h1 className={styles.heroTitle}>¿Tienes un proyecto en mente?</h1>
          <p className={styles.heroSubtitle}>
            Diseñamos la combinación correcta de servicios y tecnología para equipar,
            modernizar y escalar tu operación con criterio técnico y financiero.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/contacto" className={styles.primaryCta}>
              Solicitar diagnóstico
            </Link>
            <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">
              Canal WhatsApp
            </Link>
          </div>
        </div>
      </section>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#sectores" className={styles.quickNavLink}>Sectores</a>
        <a href="#servicios-principales" className={styles.quickNavLink}>Servicios</a>
        <a href="#contacto" className={styles.quickNavLink}>Contacto</a>
      </nav>

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
                className={styles.mediaCoverImage}
                priority
              />
            ) : (
              <div className={styles.mediaPlaceholder}>Espacio rectangular 16:9</div>
            )}
          </div>
        </div>
      </section>

      {/* Sectores que atendemos */}
      <section id="sectores" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sectores que atendemos</h2>
          <p className={styles.sectionLead}>
            Selecciona un sector para visualizar nuestro enfoque operativo.
          </p>
        </div>
        <div className={styles.selectorButtons}>
          {sectorOptions.map((sector) => (
            <Link
              key={sector.key}
              href={`/servicios?sector=${sector.key}&service=${activeService.key}#sectores`}
              className={activeSector.key === sector.key ? styles.selectorButtonActive : styles.selectorButton}
              aria-current={activeSector.key === sector.key ? "true" : undefined}
            >
              {sector.label}
            </Link>
          ))}
        </div>
        <article className={styles.selectorDetailCard}>
          <h3>{activeSector.label}</h3>
          <p>{activeSector.description}</p>
        </article>
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

      {/* Servicios principales */}
      <section id="servicios-principales" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Nuestros servicios principales</h2>
          <p className={styles.sectionLead}>
            Selecciona un servicio y revisa alcance, accesorios y valor esperado.
          </p>
        </div>
        <div className={styles.selectorButtons}>
          {serviceOptions.map((service) => (
            <Link
              key={service.key}
              href={`/servicios?sector=${activeSector.key}&service=${service.key}#servicios-principales`}
              className={activeService.key === service.key ? styles.selectorButtonActive : styles.selectorButton}
              aria-current={activeService.key === service.key ? "true" : undefined}
            >
              {service.label}
            </Link>
          ))}
        </div>

        <article className={styles.selectorDetailCard} aria-label="Detalle del servicio seleccionado">
          <h3>{activeService.label}</h3>
          <p>{activeService.description}</p>
          <p><strong>Accesorios:</strong> {activeService.accessories}</p>
        </article>

        <div className={styles.servicesCtaBar}>
          <p className={styles.servicesCtaText}>
            ¿Quieres una recomendación puntual para tu operación?
          </p>
          <div className={styles.heroCtas}>
            <Link href="/contacto" className={styles.primaryCta}>Cotización express</Link>
            <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">
              Hablar por WhatsApp
            </Link>
          </div>
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
                className={styles.mediaCoverImage}
              />
            ) : (
              <div className={styles.mediaPlaceholder}>Espacio rectangular 16:9</div>
            )}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section id="contacto" className={styles.finalCta}>
        <div className={styles.ctaContent}>
          <h2>¿Listo para equipar tu proyecto?</h2>
          <p>
            Nuestros asesores están listos para diseñar una propuesta tecnológica
            alineada a tus prioridades operativas.
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
    </>
  );
}
