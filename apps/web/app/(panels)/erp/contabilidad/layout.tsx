"use client";

import { ReactNode } from "react";
import ContabilidadSidebar from "@/components/erp/ContabilidadSidebar";

export default function ContabilidadLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ContabilidadSidebar />
      <div>{children}</div>
    </div>
  );
}
