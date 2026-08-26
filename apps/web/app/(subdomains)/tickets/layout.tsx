"use client";

import { ToastViewport } from "@/components/Toast";
import BranchPortalShell from "@/components/portal/BranchPortalShell";
import PortalShell from "@/components/portal/PortalShell";
import { isBranchPortalRoute, usesClientPortalShell } from "@/lib/portal-session";
import { usePathname } from "next/navigation";

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <>
      <ToastViewport />
      {isBranchPortalRoute(pathname) ? (
        <BranchPortalShell>{children}</BranchPortalShell>
      ) : usesClientPortalShell(pathname) ? (
        <PortalShell>{children}</PortalShell>
      ) : (
        children
      )}
    </>
  );
}
