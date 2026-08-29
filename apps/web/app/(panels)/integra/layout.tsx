"use client";

import AppShell from "@/components/app-shell/AppShell";
import { ToastViewport } from "@/components/Toast";
import { usePathname } from "next/navigation";
import { IntegraChrome } from "./_IntegraChrome";

export default function IntegraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }

  return (
    <>
      <ToastViewport />
      <AppShell panel="integra">
        <IntegraChrome>{children}</IntegraChrome>
      </AppShell>
    </>
  );
}
