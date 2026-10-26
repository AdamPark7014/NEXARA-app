import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";

/**
 * `/soluciones` es hub editorial; canónica apunta a `/servicios` para no
 * competir por la misma intención de búsqueda. Studio controla title/OG/noindex.
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
