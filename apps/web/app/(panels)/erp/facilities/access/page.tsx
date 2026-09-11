"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OfficesAccessRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/integra/access"); }, [router]);
  return <p style={{ padding: 24 }}>Redirigiendo a Integra › Accesos…</p>;
}