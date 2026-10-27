import Link from "next/link";
import { getProgrammaticLandings, findServiceLanding } from "@/lib/seo/programmatic-landings";
import { findGeoCity } from "@/lib/seo/geo-cities";
import s from "./sitio.module.css";
import i from "./interior.module.css";

/** Los tres servicios que más se cotizan: una columna por cada uno, con sus industrias. */
const SERVICIOS = ["camaras-cctv", "redes-y-conectividad", "soporte-ti-pyme"] as const;
const CIUDADES = ["puebla", "cdmx", "cholula", "queretaro", "monterrey"] as const;
const POR_COLUMNA = 5;

type Props = {
  titulo?: string;
  lead?: string;
  /** Ruta de la página donde va el directorio, para no enlazarse a sí misma. */
  actual?: string;
  /** Industria cuyas soluciones ya muestra la página (su hub): no se repiten aquí. */
  excluirIndustria?: string;
};

type Enlace = { href: string; label: string; contexto: string };

/**
 * Directorio al pie de cada página de detalle (como el «Explora» de Apple): una columna por servicio con las
 * industrias que tienen solución propia, y una de ciudades. Las etiquetas son cortas («Manufactura», «Puebla») y el
 * texto oculto completa el ancla para buscadores y lectores de pantalla («Cámaras CCTV e IP para manufactura»).
 */
export default function Directorio({ titulo = "Explora más", lead, actual, excluirIndustria }: Props) {
  const combinaciones = getProgrammaticLandings();
  const columnas = SERVICIOS.flatMap((slug, k) => {
    const servicio = findServiceLanding(slug);
    if (!servicio) return [];
    const todas: Enlace[] = combinaciones
      .filter((x) => x.service.slug === slug && x.industry.slug !== excluirIndustria)
      .map((x) => ({ href: `/soluciones/${x.industry.slug}/${slug}`, label: x.industry.name, contexto: `${servicio.name} para ` }))
      .filter((x) => x.href !== actual);
    // Cada columna arranca en otra industria: si no, las tres repetían la misma lista.
    const inicio = todas.length ? (k * Math.ceil(todas.length / SERVICIOS.length)) % todas.length : 0;
    const enlaces = [...todas.slice(inicio), ...todas.slice(0, inicio)].slice(0, POR_COLUMNA);
    return enlaces.length ? [{ titulo: servicio.name, enlaces }] : [];
  });

  const ciudades: Enlace[] = CIUDADES.flatMap((slug) => {
    const ciudad = findGeoCity(slug);
    return ciudad ? [{ href: `/cobertura/${ciudad.slug}`, label: ciudad.name, contexto: "Tecnología para empresas en " }] : [];
  }).filter((x) => x.href !== actual);
  if (ciudades.length) columnas.push({ titulo: "Por ciudad", enlaces: ciudades });

  return (
    <section className={i.directorio} aria-labelledby="directorio-titulo">
      <div className={s.contenedor}>
        <h2 id="directorio-titulo" className={i.directorioTitulo}>
          {titulo}
        </h2>
        {lead ? <p className={i.directorioLead}>{lead}</p> : null}
        <div className={i.directorioRejilla}>
          {columnas.map((c) => (
            <div key={c.titulo} className={i.directorioGrupo}>
              <h3>{c.titulo}</h3>
              <ul>
                {c.enlaces.map((e) => (
                  <li key={e.href}>
                    <Link href={e.href}>
                      <span className={i.oculto}>{e.contexto}</span>
                      {e.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
