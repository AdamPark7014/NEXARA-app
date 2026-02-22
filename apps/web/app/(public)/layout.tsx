"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";

const Header = dynamic(() => import("../../components/Header"), { ssr: false });
const Footer = dynamic(() => import("../components/Footer"), { ssr: false });
const NotificationBanner = dynamic(() => import("../../components/NotificationBanner").then(mod => mod.NotificationBanner), { ssr: false });

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    document.body.classList.add('public-layout');
    return () => {
      document.body.classList.remove('public-layout');
    };
  }, []);

  return (
    <>
      <NotificationBanner />
      <Header />
      {children}
      <Footer />
    </>
  );
}
