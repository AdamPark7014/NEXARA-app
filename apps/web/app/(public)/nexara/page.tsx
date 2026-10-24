import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./home-quiet.module.css";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("home");
}

export const dynamic = "force-dynamic";

const SERVICES = [
  { id: "cctv", title: "Videovigilancia", text: "Cámaras IP, grabación y evidencia cuando hace falta." },
  { id: "redes", title: "Redes y Wi-Fi", text: "Cableado, switching y Wi-Fi documentado." },
  { id: "computo", title: "Cómputo", text: "Racks, servidores, respaldos y equipos de trabajo." },
  { id: "soporte", title: "Soporte", text: "Mesa de ayuda, en remoto y en sitio, con tiempos acordados." },
  { id: "software", title: "Plataformas", text: "Portales y automatización, por fases." },
] as const;

function CityLine({ slugs }: { slugs: string[] }) {
  const cities = slugs
    .map((slug) => GEO_CITIES.find((city) => city.slug === slug))
    .filter((city): city is (typeof GEO_CITIES)[number] => Boolean(city));

  return (
    <p className={styles.cities}>
      {cities.map((city, index) => (
        <span key={city.slug}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <Link href={`/cobertura/${city.slug}`}>{city.name}</Link>
        </span>
      ))}
    </p>
  );
}

export default function NexaraPage() {
  return (
    <main className={`${shared.page} home-main-flush`} aria-label="Nexara — Inicio">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "NEXARA | CCTV, redes y soporte TI en México",
          url: siteBaseUrl(),
          description:
            "Videovigilancia, redes, cómputo y soporte para empresas. Base en Puebla y Ciudad de México.",
          isPartOf: { "@type": "WebSite", name: "NEXARA", url: siteBaseUrl() },
        }}
      />

      <header className={styles.opening}>
        <h1>Tecnología que se instala y se queda.</h1>
        <p>
          Videovigilancia, redes, cómputo y soporte para empresas. Base en Puebla y Ciudad de México.
        </p>
        <Link href="/contacto">Contacto</Link>
      </header>

      <figure className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fotos/campo-instalacion-rack.jpg"
          alt="Técnicos NEXARA instalando un rack en sitio"
        />
      </figure>

      <section className={styles.block} aria-label="Servicios">
        <h2>Servicios</h2>
        <ul className={styles.services}>
          {SERVICES.map((service) => (
            <li key={service.id}>
              <Link href={`/servicios#${service.id}`}>
                <strong>{service.title}</strong>
                <span>{service.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-label="Ciudades">
        <h2>Ciudades</h2>
        <CityLine slugs={["puebla", "cholula", "cdmx"]} />
        <CityLine
          slugs={[
            "tlaxcala",
            "queretaro",
            "estado-de-mexico",
            "leon",
            "monterrey",
            "guadalajara",
            "veracruz",
            "cancun",
          ]}
        />
      </section>

      <section className={`${styles.block} ${styles.contact}`} aria-label="Contacto">
        <h2>Contacto</h2>
        <p>
          <a href="tel:+522226960350">+52 222 696 0350</a>
          <span aria-hidden="true"> · </span>
          <a href="https://wa.me/522226960350" target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </p>
        <p>
          <a href="mailto:gerencia@nexara.com.mx">gerencia@nexara.com.mx</a>
        </p>
        <p>Ignacio Allende 512, Santiago Momoxpan, San Pedro Cholula, Puebla.</p>
      </section>
    </main>
  );
}
