import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";

/**
 * `/soluciones` redirige a `/servicios` (middleware); esta metadata de Studio es la del índice. Las páginas de
 * industria y de servicio por industria fijan su propio `robots` (indexables) para no heredar el noindex del índice.
 */
export async function generateMetadata(): Promise<Metadata> {
  const meta = await buildStudioPageMetadata("soluciones");
  return {
    ...meta,
    alternates: { canonical: "/servicios" },
  };
}

export default function SolucionesRedirectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
