import type { Metadata } from "next";

/** Las cotizaciones se abren con un enlace privado (token): no deben aparecer en buscadores. */
export const metadata: Metadata = {
  title: "Firma de cotización",
  robots: { index: false, follow: false },
};

export default function CotizacionesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
