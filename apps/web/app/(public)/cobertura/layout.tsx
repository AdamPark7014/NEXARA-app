import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cobertura y clientes",
  description:
    "Cobertura de proyectos NEXARA y referencias de clientes en México: CCTV, cómputo, redes y soporte TI.",
  alternates: {
    canonical: "/cobertura",
  },
  robots: { index: true, follow: true },
};

export default function CoberturaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
