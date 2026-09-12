"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link → workspace unificado con tab. */
export default function ClientesProyectoRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/erp/clientes?sector=proyecto");
  }, [router]);
  return null;
}
