"use client";

import type { ReactNode } from "react";
import PublicSiteThemeLock from "@/components/PublicSiteThemeLock";
import Header from "@/components/Header";
import Footer from "@/app/components/Footer";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicSiteThemeLock />
      <Header />
      <div className="public-layout-content home-main-flush" style={{ background: "#050a14", minHeight: "60vh" }}>
        {children}
      </div>
      <Footer />
    </>
  );
}
