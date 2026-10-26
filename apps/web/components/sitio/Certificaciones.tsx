import s from "./sitio.module.css";
import p from "./paginas.module.css";

/** Certificaciones y alianzas reales (assets en /public/certificaciones). */
const CERTIFICACIONES = [
  { src: "/certificaciones/certificaciones-06.png", alt: "Hikvision" },
  { src: "/certificaciones/certificaciones-09.png.jpeg", alt: "Dell Technologies Authorized Partner" },
  { src: "/certificaciones/certificaciones-04.png", alt: "Lenovo SEG Silver Partner" },
  { src: "/certificaciones/certificaciones-07.png", alt: "Sophos" },
  { src: "/certificaciones/certificaciones-01.png", alt: "Linksys" },
  { src: "/certificaciones/certificaciones-02.png", alt: "Belden" },
  { src: "/certificaciones/certificaciones-03.png", alt: "Intellinet" },
  { src: "/certificaciones/certificaciones-05.png.jpeg", alt: "Grandstream" },
  { src: "/certificaciones/certificaciones-08.png", alt: "Mimosa" },
  { src: "/certificaciones/certificaciones-04.1.png.webp", alt: "Lenovo SEG Authorized Solutions" },
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
            <li key={c.src} className={p.logo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.src} alt={c.alt} loading="lazy" decoding="async" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
