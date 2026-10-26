import Link from "next/link";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import s from "./sitio.module.css";
import { CIUDADES_MAPA } from "./MapaMexico";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ciudades del mapa como fichas; las que tienen página de cobertura ligan a ella. Se sincronizan con el mapa. */
export default function ListaCiudades() {
  const nombres = ["Puebla", "Ciudad de México", ...CIUDADES_MAPA.map((c) => c.nombre)];
  return (
    <ul className={s.ciudades} aria-label="Ciudades donde trabajamos">
      {nombres.map((nombre, i) => {
        const pagina = GEO_CITIES.find((g) => normal(g.name) === normal(nombre));
        const base = i < 2;
        return (
          <li key={nombre}>
            {pagina ? (
              <Link href={`/cobertura/${pagina.slug}`} className={`${s.ciudad} ${base ? s.ciudadBase : ""}`} data-ciudad={nombre}>
                {nombre}
              </Link>
            ) : (
              <span className={`${s.ciudad} ${base ? s.ciudadBase : ""}`} data-ciudad={nombre} tabIndex={0}>
                {nombre}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
