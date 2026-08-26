"use client";

import { ToastViewport } from "@/components/Toast";
import BranchPortalShell from "@/components/portal/BranchPortalShell";
import PortalShell from "@/components/portal/PortalShell";
import { isBranchPortalRoute, usesClientPortalShell } from "@/lib/portal-session";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <>
      <ToastViewport />
      {isBranchPortalRoute(pathname) ? (
        <BranchPortalShell>{children}</BranchPortalShell>
      ) : usesClientPortalShell(pathname) ? (
        // PortalShell usa useSearchParams(): sin este limite, el prerender
        // estatico de /tickets* hace bail-out y rompe el build.
        <Suspense fallback={null}>
          <PortalShell>{children}</PortalShell>
        </Suspense>
      ) : (
        children
      )}
    </>
  );
}
