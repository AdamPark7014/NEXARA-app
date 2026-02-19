"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ContabilidadIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/panel/contabilidad/dashboard");
  }, [router]);

  return null;
}
