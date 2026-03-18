"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setActivePanel } from "@/lib/panel-routing";

export default function ContabilidadIndex() {
  const router = useRouter();

  useEffect(() => {
    setActivePanel("contabilidad");
    router.replace("/contabilidad/dashboard");
  }, [router]);

  return null;
}
