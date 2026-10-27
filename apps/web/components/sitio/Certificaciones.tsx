import s from "./sitio.module.css";
import p from "./paginas.module.css";

/**
 * Certificaciones y alianzas reales, a una tinta (`/public/certificaciones/mono`, sacadas de los originales de la
 * misma carpeta). `alto` marca los logos más altos que anchos, que necesitan más altura para pesar lo mismo.
 */
const CERTIFICACIONES = [
  { clave: "hikvision", alt: "Hikvision" },
  { clave: "dell", alt: "Dell Technologies Authorized Partner" },
  { clave: "lenovo-dispositivos", alt: "Lenovo 360 Intelligent Devices, 2025 Silver", alto: true },
  { clave: "sophos", alt: "Sophos", alto: true },
  { clave: "linksys", alt: "Linksys" },
  { clave: "belden", alt: "Belden" },
  { clave: "intellinet", alt: "Intellinet" },
  { clave: "grandstream", alt: "Grandstream", alto: true },
  { clave: "mimosa", alt: "Mimosa" },
  { clave: "lenovo-infraestructura", alt: "Lenovo 360 Infrastructure Solutions, 2025 Authorized", alto: true },
];

export default function Certificaciones({ gris = false }: { gris?: boolean }) {
  return (
    <section className={`${s.seccion} ${gris ? s.seccionAlt : ""}`} aria-labelledby="certificaciones-titulo">
      <div className={s.contenedor}>
        <header className={s.centro} data-aparecer>
          <p className={s.antetitulo}>Respaldo técnico</p>
          <h2 id="certificaciones-titulo" className={s.titulo}>
            Certificaciones <span className={s.tenue}>y alianzas.</span>
          </h2>
        </header>
        <ul className={p.logos} data-aparecer>
          {CERTIFICACIONES.map((c) => (
            <li key={c.clave} className={p.logo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/certificaciones/mono/${c.clave}.png`} alt={c.alt} loading="lazy" decoding="async" data-alto={c.alto ? "" : undefined} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
