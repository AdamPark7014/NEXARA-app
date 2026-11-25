import type { CSSProperties } from "react";
import s from "./sitio.module.css";
import v from "./vivo.module.css";

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
        <ul className={v.panal}>
          {MARCAS.map(([n, nombre], i) => (
            <li key={n} style={{ "--i": i } as CSSProperties}>
              <span className={v.celda}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/marcas/marcas-${n}.webp`} alt={nombre} loading="lazy" decoding="async" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
