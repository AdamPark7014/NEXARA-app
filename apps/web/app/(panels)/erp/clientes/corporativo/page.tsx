"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClientesCorporativoRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/erp/clientes?sector=corporativo");
  }, [router]);
  return null;
}
