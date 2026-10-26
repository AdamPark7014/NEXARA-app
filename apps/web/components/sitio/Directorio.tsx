import Link from "next/link";
import { getProgrammaticLandings, INDUSTRY_LANDINGS, findServiceLanding } from "@/lib/seo/programmatic-landings";
import { isIndustryHubSlug } from "@/lib/seo/industry-hubs";
import { MONEY_SERVICE_SLUGS } from "@/lib/seo/money-pages";
import { findGeoCity } from "@/lib/seo/geo-cities";
import s from "./sitio.module.css";
import i from "./interior.module.css";

const CIUDADES = ["puebla", "cdmx", "cholula", "queretaro", "monterrey"] as const;
const SERVICIOS_LOCALES = ["camaras-cctv", "redes-y-conectividad", "soporte-ti-pyme"] as const;

type Props = {
  titulo?: string;
  lead?: string;
  /** Ruta de la página donde va el directorio, para no enlazarse a sí misma. */
  actual?: string;
  /** Industria cuyas soluciones ya muestra la página (su hub): no se repiten aquí. */
  excluirIndustria?: string;
  industrias?: number;
  porIndustria?: number;
};

const rango = (slug: string) => {
  const n = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(slug);
  return n === -1 ? 99 : n;
};

/**
 * Directorio al pie de cada página de detalle (como el «Explora» de Apple): soluciones por industria y servicios
 * por ciudad. Son los enlaces internos que antes daba el bloque SEO, en columnas discretas.
 */
export default function Directorio({ titulo = "Explora más", lead, actual, excluirIndustria, industrias = 4, porIndustria = 3 }: Props) {
  const soluciones = getProgrammaticLandings()
    .map(({ industry, service }) => ({ href: `/soluciones/${industry.slug}/${service.slug}`, industry, service }))
    .filter((x) => x.href !== actual)
    .sort((a, b) => rango(a.service.slug) - rango(b.service.slug));

  const grupos = INDUSTRY_LANDINGS.filter((ind) => ind.slug !== excluirIndustria).map((ind) => {
    const enlaces = soluciones.filter((x) => x.industry.slug === ind.slug).slice(0, porIndustria);
    return {
      titulo: ind.name,
      href: isIndustryHubSlug(ind.slug) ? `/soluciones/${ind.slug}` : enlaces[0]?.href ?? "/servicios",
      enlaces: enlaces.map((x) => ({ href: x.href, label: x.service.name })),
    };
  })
    .filter((g) => g.enlaces.length > 0)
    .slice(0, industrias);

  const locales = CIUDADES.flatMap((c) => {
    const ciudad = findGeoCity(c);
    if (!ciudad) return [];
    return SERVICIOS_LOCALES.map((sv) => {
      const servicio = findServiceLanding(sv);
      const href = `/cobertura/${ciudad.slug}/${sv}`;
      return servicio && href !== actual ? { href, label: `${servicio.name} en ${ciudad.name}` } : null;
    }).filter((x): x is { href: string; label: string } => x !== null);
  });

  return (
    <section className={i.directorio} aria-labelledby="directorio-titulo">
      <div className={s.contenedor}>
        <h2 id="directorio-titulo" className={i.directorioTitulo}>
          {titulo}
        </h2>
        {lead ? <p className={i.directorioLead}>{lead}</p> : null}
        <div className={i.directorioRejilla}>
          {grupos.map((g) => (
            <div key={g.titulo} className={i.directorioGrupo}>
              <h3>
                <Link href={g.href}>{g.titulo}</Link>
              </h3>
              <ul>
                {g.enlaces.map((e) => (
                  <li key={e.href}>
                    <Link href={e.href}>{e.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {locales.length > 0 ? (
            <div className={`${i.directorioGrupo} ${i.directorioDoble}`}>
              <h3>Por ciudad</h3>
              <ul>
                {locales.slice(0, 10).map((e) => (
                  <li key={e.href}>
                    <Link href={e.href}>{e.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
