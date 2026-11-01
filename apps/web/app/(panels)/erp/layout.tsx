"use client";

import AppShell from "@/components/app-shell/AppShell";
import GrabacionProvider from "@/components/reuniones/GrabacionProvider";
import { ToastViewport } from "@/components/Toast";
import { resolveShellPanelFromPath } from "@/lib/cross-panel-handoff";
import { usePathname } from "next/navigation";

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }

  const shellPanel = resolveShellPanelFromPath(pathname);

  return (
    <GrabacionProvider>
      <ToastViewport />
      <AppShell panel={shellPanel}>{children}</AppShell>
    </GrabacionProvider>
  );
}
