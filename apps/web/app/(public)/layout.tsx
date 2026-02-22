"use client";
import dynamic from "next/dynamic";

const Header = dynamic(() => import("../../components/Header"), { ssr: false });
const Footer = dynamic(() => import("../components/Footer"), { ssr: false });
const NotificationBanner = dynamic(() => import("../../components/NotificationBanner").then(mod => mod.NotificationBanner), { ssr: false });

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="public-layout-wrapper">
      <NotificationBanner />
      <Header />
      {children}
      <Footer />
    </div>
  );
}
