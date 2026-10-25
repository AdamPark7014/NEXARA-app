import Link from "next/link";
import shared from "../_shared/public.module.css";
import quiet from "../nexara/home-quiet.module.css";
import styles from "./page.module.css";
import { GEO_CITIES, type GeoCity } from "@/lib/seo/geo-cities";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export const revalidate = 1800;

const regionCitySlugs = new Set(GEO_CITIES.map((c) => c.slug));

const regiones = [
  {
    name: "Centro",
    role: "Base operativa",
    desc: "Puebla, CDMX, Estado de México y Querétaro — cuadrillas propias y tiempos de respuesta locales.",
    citySlug: "puebla",
  },
  {
    name: "Bajío",
    role: "Campo + partners",
    desc: "Guanajuato, Aguascalientes y San Luis Potosí. Levantamiento en sitio y seguimiento remoto.",
    citySlug: "leon",
  },
  {
    name: "Occidente",
    role: "Campo + partners",
    desc: "Jalisco, Nayarit, Colima y Michoacán. Instalación y mantenimiento con logística coordinada.",
    citySlug: "guadalajara",
  },
  {
    name: "Norte",
    role: "Cobertura extendida",
    desc: "Nuevo León, Coahuila, Chihuahua y Sonora. Proyectos por fases con equipo móvil.",
    citySlug: "monterrey",
  },
  {
    name: "Sureste",
    role: "Cobertura extendida",
    desc: "Yucatán, Quintana Roo, Veracruz y Tabasco. Intervenciones programadas y soporte híbrido.",
    citySlug: "veracruz",
  },
  {
    name: "Pacífico",
    role: "Cobertura extendida",
    desc: "Sinaloa y Baja California. Enlaces, CCTV y redes con ventanas de trabajo claras.",
    citySlug: null,
  },
] as const;

const modalidades = [
  {
    title: "En sitio",
    text: "Cuadrillas con kit completo, EPP y permisos. Ideal para instalaciones, cableado y entregas con evidencia.",
  },
  {
    title: "Remoto",
    text: "Diagnóstico, configuración y mesa de ayuda sin desplazar personal. Primera línea para la mayoría de incidentes.",
  },
  {
    title: "Híbrido",
    text: "Remoto primero; visita cuando el riesgo o el SLA lo piden. El modelo se define en el contrato, no al calor del ticket.",
  },
];

const MODES = ["base", "campo", "extendida"] as const;

const modeLabel = (mode: GeoCity["mode"]) =>
  mode === "base" ? "Base" : mode === "campo" ? "Campo" : "Extendida";

const MAP_ALT =
  "Mapa de cobertura NEXARA — 32 estados y más de 200 puntos de presencia en México; base en Puebla y CDMX";

function CityLine({ mode }: { mode: GeoCity["mode"] }) {
  const cities = GEO_CITIES.filter((city) => city.mode === mode);

  return (
    <p className={quiet.cities}>
      {cities.map((city, index) => (
        <span key={city.slug}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <Link href={`/cobertura/${city.slug}`} className={styles.inkLink}>
            {city.name}
          </Link>
        </span>
      ))}
    </p>
  );
}

export default function CoberturaPage() {
  return (
    <main className={`${shared.page} home-main-flush`} aria-label="Cobertura NEXARA">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Cobertura NEXARA",
          url: `${siteBaseUrl()}/cobertura`,
          description: "Cobertura nacional con base en Puebla y CDMX.",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: GEO_CITIES.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              url: `${siteBaseUrl()}/cobertura/${c.slug}`,
            })),
          },
        }}
      />

      <header className={quiet.opening}>
        <h1>Base en el centro, alcance nacional.</h1>
        <p>
          Puebla y CDMX como ancla operativa. El resto del país con campo propio, partners y modelo
          remoto o híbrido.
        </p>
        <Link href="/contacto" className={styles.inkLink}>
          Contacto
        </Link>
      </header>

      <figure className={styles.map}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fotos/mapa-cobertura-nexara-claro-2000.webp"
          srcSet="/fotos/mapa-cobertura-nexara-claro-1200.webp 1200w, /fotos/mapa-cobertura-nexara-claro-1600.webp 1600w, /fotos/mapa-cobertura-nexara-claro-2000.webp 2000w"
          sizes="100vw"
          width={2000}
          height={1000}
          alt={MAP_ALT}
        />
      </figure>

      <section className={quiet.block} aria-label="Ciudades">
        <h2>Ciudades</h2>
        {MODES.map((mode) => (
          <div key={mode} className={styles.cityGroup}>
            <p className={styles.modeLabel}>{modeLabel(mode)}</p>
            <CityLine mode={mode} />
          </div>
        ))}
      </section>

      <section className={quiet.block} aria-label="Regiones">
        <h2>Regiones</h2>
        <ul className={quiet.services}>
          {regiones.map((region) => {
            const href =
              region.citySlug && regionCitySlugs.has(region.citySlug)
                ? `/cobertura/${region.citySlug}`
                : null;
            const body = (
              <>
                <strong>{region.name}</strong>
                <span>
                  {region.role}. {region.desc}
                </span>
              </>
            );
            return (
              <li key={region.name}>
                {href ? (
                  <Link href={href} className={styles.inkLink}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.staticRow}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={quiet.block} aria-label="Modalidades">
        <h2>Modalidades</h2>
        <ul className={quiet.services}>
          {modalidades.map((mode) => (
            <li key={mode.title}>
              <div className={styles.staticRow}>
                <strong>{mode.title}</strong>
                <span>{mode.text}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${quiet.block} ${quiet.contact}`} aria-label="Contacto">
        <h2>Contacto</h2>
        <p>
          <a href="tel:+522226960350" className={styles.inkLink}>
            +52 222 696 0350
          </a>
          <span aria-hidden="true"> · </span>
          <a
            href="https://wa.me/522226960350"
            className={styles.inkLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        </p>
        <p>
          <a href="mailto:gerencia@nexara.com.mx" className={styles.inkLink}>
            gerencia@nexara.com.mx
          </a>
        </p>
        <p>Ignacio Allende 512, Santiago Momoxpan, San Pedro Cholula, Puebla.</p>
      </section>
    </main>
  );
}
