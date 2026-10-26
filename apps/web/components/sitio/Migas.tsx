import Link from "next/link";
import i from "./interior.module.css";

export type Miga = { href?: string; label: string };

/** Ruta de navegación sobre el título (Inicio › Industrias › Retail). La última miga es la página actual. */
export default function Migas({ migas, alinear = "centro" }: { migas: Miga[]; alinear?: "centro" | "izq" }) {
  return (
    <nav className={`${i.migas} ${alinear === "izq" ? i.migasIzq : ""}`} aria-label="Ruta de navegación">
      <ol>
        {migas.map((m, n) => (
          <li key={`${m.label}-${n}`}>
            {m.href && n < migas.length - 1 ? (
              <Link href={m.href}>{m.label}</Link>
            ) : (
              <span aria-current="page">{m.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
