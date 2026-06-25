"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";

export default function ClientTicketsPage() {
  const { client, error, reload } = useClientDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  if (!client.serviceClientId) {
    return (
      <EmptyState
        icon="🎫"
        title="Portal de tickets no disponible"
        description="Provisiona el cliente en operación para habilitar tickets de sucursal."
      />
    );
  }

  return (
    <DetailSection title="Tickets del cliente">
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 12px" }}>
        Los tickets de sucursal se gestionan en el portal cliente y en OPS. Desde aquí puedes ir al módulo de actividades
        filtradas por este cliente de servicio.
      </p>
      <Link href="/ops/activities" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
        Ver actividades de campo →
      </Link>
    </DetailSection>
  );
}
