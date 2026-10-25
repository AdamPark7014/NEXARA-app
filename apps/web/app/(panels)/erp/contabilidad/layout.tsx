"use client";

import { ReactNode } from "react";
import ContabilidadSidebar from "@/components/erp/ContabilidadSidebar";
import q from "@/components/erp/lista-quieta.module.css";

export default function ContabilidadLayout({ children }: { children: ReactNode }) {
  return (
    <div className={q.zona} style={{ display: "grid", gap: 12 }}>
      <ContabilidadSidebar />
      <div>{children}</div>
    </div>
  );
}
