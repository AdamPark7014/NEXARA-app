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
    <>
      <NotificationBanner />
      <Header />
      <div style={{ 
        paddingTop: 'var(--header-offset)',
      }}>
        {children}
      </div>
      <Footer />
    </>
  );
}
