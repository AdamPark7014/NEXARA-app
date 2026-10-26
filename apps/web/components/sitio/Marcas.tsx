import s from "./sitio.module.css";

/** Logos reales en /public/marcas: en escala de grises y en una sola cinta lenta. */
const MARCAS = Array.from({ length: 36 }, (_, i) => `/marcas/marcas-${String(i + 1).padStart(2, "0")}.png`);

export default function Marcas() {
  return (
    <section className={s.marcas} aria-label="Fabricantes">
      <div className={s.contenedor}>
        <p className={s.marcasTitulo}>Integramos tecnología de los fabricantes líderes.</p>
      </div>
      <div className={s.marcasVentana}>
        <div className={s.marcasCinta}>
          {[...MARCAS, ...MARCAS].map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${src}-${i}`} src={src} alt="" className={s.marca} loading="lazy" decoding="async" aria-hidden="true" />
          ))}
        </div>
      </div>
    </section>
  );
}
