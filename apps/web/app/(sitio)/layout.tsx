import localFont from "next/font/local";
import "@/components/sitio/sitio-documento.css";
import s from "@/components/sitio/sitio.module.css";
import Encabezado from "@/components/sitio/Encabezado";
import Pie from "@/components/sitio/Pie";
import Aparecer from "@/components/sitio/Aparecer";
import ExtrasSitio from "@/components/sitio/ExtrasSitio";
import Paleta from "@/components/sitio/Paleta";

/** Letra de exhibición para titulares y cifras; el texto corrido sigue en Inter. */
const display = localFont({ src: "../fonts/inter-tight-var-latin.woff2", weight: "100 900",
  display: "swap",
  variable: "--sitio-display",
  preload: false,
});

/**
 * Sitio público 2026 (aprobado por el dueño el 26-10-2026): todas las páginas públicas, de la portada a Soluciones,
 * Cobertura, Blog, Preguntas, Legal y la firma de cotizaciones, con el mismo encabezado, pie y tipografía.
 */
export default function SitioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${s.sitio} ${display.variable}`} data-sitio>
      <Encabezado />
      {/* Destino de «Saltar al contenido» cuando no hay JavaScript (con JavaScript el foco va al `<main>`). */}
      <span id="contenido" tabIndex={-1} className={s.contenidoAncla} />
      {children}
      <Pie />
      <Aparecer />
      <Paleta />
      <ExtrasSitio />
    </div>
  );
}
