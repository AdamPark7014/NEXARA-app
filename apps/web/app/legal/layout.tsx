import type { ReactNode } from "react";
import PublicSiteThemeLock from "@/components/PublicSiteThemeLock";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicSiteThemeLock />
      {children}
    </>
  );
}
