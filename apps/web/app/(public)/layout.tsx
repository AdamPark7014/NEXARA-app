"use client";
import dynamic from "next/dynamic";
import PublicSiteThemeLock from "@/components/PublicSiteThemeLock";

const Header = dynamic(() => import("../../components/Header"), { ssr: false });
const Footer = dynamic(() => import("../components/Footer"), { ssr: false });
const NotificationBanner = dynamic(() => import("../../components/NotificationBanner").then(mod => mod.NotificationBanner), { ssr: false });
const FloatingContactForm = dynamic(() => import("../components/FloatingContactForm"), { ssr: false });
const PublicTrafficTracker = dynamic(() => import("../../components/PublicTrafficTracker"), { ssr: false });
const PublicScrollReveal = dynamic(() => import("../../components/PublicScrollReveal"), { ssr: false });

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="public-layout-wrapper public-friendly">
      <PublicSiteThemeLock />
      <PublicTrafficTracker />
      <PublicScrollReveal />
      <NotificationBanner />
      <Header />
      <div className="public-layout-content">{children}</div>
      <FloatingContactForm />
      <Footer />
    </div>
  );
}
