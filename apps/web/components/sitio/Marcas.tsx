import s from "./sitio.module.css";

/** Logos reales en /public/marcas: los fabricantes de lo que NEXARA instala, sin los de consumo (impresoras, memorias). */
const MARCAS: [string, string][] = [
  ["36", "Hikvision"],
  ["31", "Ubiquiti"],
  ["32", "Cisco"],
  ["17", "TP‑Link"],
  ["26", "Dell"],
  ["05", "HP"],
  ["29", "Lenovo"],
  ["19", "Microsoft"],
  ["10", "Huawei"],
  ["07", "Eaton"],
  ["33", "Tripp Lite"],
  ["06", "Honeywell"],
  ["12", "Zebra"],
  ["28", "Western Digital"],
];

export default function Marcas() {
  return (
    <section className={s.marcas} aria-label="Fabricantes">
      <div className={s.contenedor}>
        <p className={s.marcasTitulo}>Integramos tecnología de los fabricantes líderes.</p>
        <div className={s.marcasFila}>
          {MARCAS.map(([n, nombre]) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={n} src={`/marcas/marcas-${n}.webp`} alt={nombre} className={s.marca} loading="lazy" decoding="async" />
          ))}
        </div>
      </div>
    </section>
  );
}
