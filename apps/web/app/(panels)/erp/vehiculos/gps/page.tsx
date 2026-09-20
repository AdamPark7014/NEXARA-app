"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { VEHICULOS_PATH, puedeVerGpsDireccion } from "@/lib/recursos-core";

/**
 * GPS de la flotilla (`/erp/vehiculos/gps`): reservado a Dirección General, la misma regla que
 * la API aplica al GPS en vivo (`puedeVerGpsDireccion`). La página cae dentro de
 * `/erp/vehiculos/**`, así que el filtro por persona se hace aquí. El rastreo lo construye el
 * frente de vehículos; por ahora solo se aparta la ruta.
 */
export default function VehiculosGpsPage() {
  const { user } = useUser();
  const permitido = puedeVerGpsDireccion(user);

  return (
    <>
      <PageHeader
        eyebrow="Core · Vehículos"
        title="GPS de la flotilla"
        subtitle="Posición y recorrido de cada unidad."
      />
      {permitido ? (
        <EmptyState
          icon="🛰️"
          title="Próximamente"
          description="Aquí verás la posición en vivo y el recorrido de cada vehículo."
        />
      ) : (
        <EmptyState
          icon="🔒"
          title="Solo Dirección General"
          description="El GPS de los vehículos es solo para Dirección General."
          action={
            <Link href={VEHICULOS_PATH} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="secondary">Volver a Vehículos</Button>
            </Link>
          }
        />
      )}
    </>
  );
}
