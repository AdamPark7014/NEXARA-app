"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OpsServiceClientsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/crm/clients"); }, [router]);
  return <p style={{ padding: 24 }}>Redirigiendo a CRM › Clientes…</p>;
}
