"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DESTINO = "/integra/access";

export default function OfficesAccessRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(DESTINO); }, [router]);
  return (
    <p role="status" style={{ padding: 24, margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
      Los accesos de oficinas ahora viven en Integra. Te llevamos ahí…{" "}
      <Link href={DESTINO} style={{ color: "var(--primary)", fontWeight: 600 }}>
        Ir ahora
      </Link>
    </p>
  );
}
