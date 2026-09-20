"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import ContextRail from "@/components/ui/ContextRail";
import { Tag } from "@/components/ui/DataTable";
import VehiculosFlotaMapa from "@/components/VehiculosFlotaMapa";
import { useUser } from "@/components/UserContext";
import {
  MIS_VEHICULOS_PATH,
  VEHICULOS_GPS_PATH,
  VEHICULOS_PATH,
  puedeVerGpsDireccion,
} from "@/lib/recursos-core";
import { estadoGps, type EstadoGps } from "@/lib/vehiculos-api";
import styles from "../vehiculos-core.module.css";

/**
 * GPS de la flotilla (`/erp/vehiculos/gps`): reservado a Dirección General, la misma regla que
 * la API aplica al GPS en vivo (`puedeVerGpsDireccion`). La página cae dentro de
 * `/erp/vehiculos/**`, así que el filtro por persona se hace aquí. Sin permiso no se pide
 * nada al servidor: el mapa ni se monta.
 */
export default function VehiculosGpsPage() {
  const { user } = useUser();
  const permitido = puedeVerGpsDireccion(user);
  const token = user?.token ?? "";
  const [estado, setEstado] = useState<EstadoGps | null>(null);

  useEffect(() => {
    if (!permitido || !token) return;
    let vivo = true;
    void (async () => {
      try {
        const data = await estadoGps(token);
        if (vivo) setEstado(data);
      } catch {
        if (vivo) setEstado(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [permitido, token]);

  return (
    <>
      <PageHeader
        eyebrow="Core · Vehículos"
        title="GPS de la flotilla"
        subtitle="Posición y recorrido de cada unidad."
        density="ops"
        meta={
          permitido && estado ? (
            <>
              {estado.proveedor && <Tag variant="neutral">{estado.proveedor}</Tag>}
              <Tag variant={estado.configurado ? "positive" : "warning"}>
                {estado.vehiculosConRastreador} con rastreador
              </Tag>
            </>
          ) : undefined
        }
      />
      {permitido ? (
        <div className={styles.wrap}>
          <ContextRail
            ariaLabel="Vehículos"
            items={[
              { id: "flotilla", label: "Flotilla", href: VEHICULOS_PATH },
              { id: "mios", label: "Mis vehículos", href: MIS_VEHICULOS_PATH },
              { id: "gps", label: "GPS", href: VEHICULOS_GPS_PATH, active: true },
            ]}
          />
          <VehiculosFlotaMapa token={token} />
        </div>
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
