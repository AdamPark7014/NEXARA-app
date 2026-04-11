import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Contacta a NEXARA para cotizaciones, soporte TI, CCTV, redes y proyectos tecnológicos en Puebla, CDMX y México.",
  alternates: {
    canonical: "/contacto",
  },
  robots: { index: true, follow: true },
};

export default function ContactoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
