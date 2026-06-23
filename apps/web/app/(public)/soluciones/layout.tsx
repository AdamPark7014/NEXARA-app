import type { Metadata } from "next";

/** `/soluciones` redirige a `/servicios`; evita canónica ambigua y duplicados en buscadores. */
export const metadata: Metadata = {
  title: "Soluciones",
  alternates: { canonical: "/servicios" },
  robots: { index: false, follow: true },
};

export default function SolucionesRedirectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
