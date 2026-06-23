"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import PublicSiteThemeLock from "@/components/PublicSiteThemeLock";

const Header = dynamic(() => import("../../components/Header"), { ssr: false });
const Footer = dynamic(() => import("../components/Footer"), { ssr: false });
const FloatingContactForm = dynamic(() => import("../components/FloatingContactForm"), { ssr: false });
const PublicTrafficTracker = dynamic(() => import("../../components/PublicTrafficTracker"), { ssr: false });
const PublicScrollReveal = dynamic(() => import("../../components/PublicScrollReveal"), { ssr: false });

const isHomePath = (pathname: string | null) =>
  pathname === "/" || pathname === "/nexara" || pathname === "/nexara/";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  // En la home pública liberamos al `<main>` del `max-width: var(--content-max)`
  // y del `padding-top: header-height` para que el `HomeHero` ocupe TODO el
  // viewport (ambos bordes laterales + arriba del header transparente).
  const contentClass = `public-layout-content${
    isHomePath(pathname) ? " public-layout-content--flush" : ""
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
    </div>
  );
}
