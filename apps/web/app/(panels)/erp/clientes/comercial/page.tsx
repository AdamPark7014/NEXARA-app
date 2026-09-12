"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClientesComercialRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/erp/clientes?sector=comercial");
  }, [router]);
  return null;
}
