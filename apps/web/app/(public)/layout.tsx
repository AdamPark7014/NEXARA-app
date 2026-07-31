"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import PublicSiteThemeLock from "@/components/PublicSiteThemeLock";
import Header from "../../components/Header";
import Footer from "../components/Footer";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const FloatingContactForm = dynamic(() => import("../components/FloatingContactForm"), { ssr: false });
const PublicTrafficTracker = dynamic(() => import("../../components/PublicTrafficTracker"), { ssr: false });
const PublicScrollReveal = dynamic(() => import("../../components/PublicScrollReveal"), { ssr: false });

/** Páginas con hero full-bleed bajo el header transparente. */
const isFlushHeroPath = (pathname: string | null) => {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, "") || "/";
  return (
    p === "/" ||
    p === "/nexara" ||
    p === "/servicios" ||
    p === "/soluciones" ||
    p === "/nosotros" ||
    p === "/contacto" ||
    p === "/proyectos" ||
    p === "/cobertura" ||
    p === "/blog" ||
    p === "/Nexara-Ingenieros" ||
    p.startsWith("/soluciones/")
  );
};

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  // Liberamos padding-top / max-width para que el hero ocupe el viewport
  // edge-to-edge bajo el header transparente (home + páginas clave).
  const contentClass = `public-layout-content${
    isFlushHeroPath(pathname) ? " public-layout-content--flush" : ""
  }`;

  return (
    <div className="public-layout-wrapper public-friendly">
      <PublicSiteThemeLock />
      <PublicTrafficTracker />
      <PublicScrollReveal />
      <Header />
      <div className={contentClass}>{children}</div>
      <FloatingContactForm />
      <Footer />
      <CookieConsentBanner />
    </div>
  );
}
