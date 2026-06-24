"use client";

import { ToastViewport } from "@/components/Toast";
import { usePathname } from "next/navigation";

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // TEMPORALMENTE: retorna solo children para evitar error de AppShell
  return (
    <>
      <ToastViewport />
      {children}
    </>
  );
}
