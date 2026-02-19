"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VentasIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/panel/ventas/dashboard");
  }, [router]);

  return null;
}
