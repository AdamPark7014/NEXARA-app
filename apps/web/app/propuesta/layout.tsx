import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "@/components/sitio/sitio-documento.css";
import s from "@/components/sitio/sitio.module.css";
import Encabezado from "@/components/sitio/Encabezado";
import Pie from "@/components/sitio/Pie";
import Aparecer from "@/components/sitio/Aparecer";

/** Letra de exhibición para titulares y cifras; el texto corrido sigue en Inter. */
const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--sitio-display",
});

/**
 * Propuesta del sitio público 2026, en una ruta aparte y sin indexar mientras
 * el dueño la aprueba. Cuando se apruebe, estas piezas pasan a `(public)`.
 */
export const metadata: Metadata = {
  title: "NEXARA · Propuesta de sitio",
  robots: { index: false, follow: false },
};

export default function PropuestaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${s.sitio} ${display.variable}`} data-sitio>
      <Encabezado inicio="/propuesta" />
      {children}
      <Pie inicio="/propuesta" />
      <Aparecer />
    </div>
  );
}
