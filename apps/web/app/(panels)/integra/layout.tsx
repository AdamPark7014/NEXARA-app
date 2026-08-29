"use client";

import AppShell from "@/components/app-shell/AppShell";
import { ToastViewport } from "@/components/Toast";
import { usePathname } from "next/navigation";

export default function IntegraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }

  return (
    <>
      <ToastViewport />
      <AppShell panel="integra">{children}</AppShell>
    </>
  );
}
