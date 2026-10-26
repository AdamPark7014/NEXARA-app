import { Inter_Tight } from "next/font/google";
import "@/components/sitio/sitio-documento.css";
import s from "@/components/sitio/sitio.module.css";
import Encabezado from "@/components/sitio/Encabezado";
import Pie from "@/components/sitio/Pie";
import Aparecer from "@/components/sitio/Aparecer";
import ExtrasSitio from "@/components/sitio/ExtrasSitio";
import Paleta from "@/components/sitio/Paleta";

/** Letra de exhibición para titulares y cifras; el texto corrido sigue en Inter. */
const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--sitio-display",
});

/**
 * Sitio público 2026 (aprobado por el dueño el 26-10-2026): portada, Servicios, Nosotros, Proyectos y Contacto.
 * Blog, Soluciones, Cobertura y Legal siguen en `(public)` con el layout anterior hasta rehacerlos.
 */
export default function SitioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${s.sitio} ${display.variable}`} data-sitio>
      <Encabezado />
      {children}
      <Pie />
      <Aparecer />
      <Paleta />
      <ExtrasSitio />
    </div>
  );
}
