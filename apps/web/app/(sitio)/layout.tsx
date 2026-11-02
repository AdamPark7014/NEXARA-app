import localFont from "next/font/local";
import "@/components/sitio/sitio-documento.css";
import s from "@/components/sitio/sitio.module.css";
import Encabezado from "@/components/sitio/Encabezado";
import Pie from "@/components/sitio/Pie";
import Aparecer from "@/components/sitio/Aparecer";
import ExtrasSitio from "@/components/sitio/ExtrasSitio";
import Paleta from "@/components/sitio/Paleta";

/** Letra de exhibición para los títulos en mayúsculas y las cifras. */
const display = localFont({
  src: "../../components/sitio/fuentes/big-shoulders.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--sitio-display",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

/** Letra de todo el texto corrido. */
const texto = localFont({
  src: "../../components/sitio/fuentes/libre-franklin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--sitio-texto",
});

/**
 * Sitio público 2026 (aprobado por el dueño el 26-10-2026): todas las páginas públicas, de la portada a Soluciones,
 * Cobertura, Blog, Preguntas, Legal y la firma de cotizaciones, con el mismo encabezado, pie y tipografía.
 */
export default function SitioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${s.sitio} ${display.variable} ${texto.variable}`} data-sitio>
      <Encabezado />
      {children}
      <Pie />
      <Aparecer />
      <Paleta />
      <ExtrasSitio />
    </div>
  );
}
