"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VehiculosFlotaMapa from "@/components/VehiculosFlotaMapa";
import { useUser } from "@/components/UserContext";
import { VEHICULOS_PATH, puedeVerGpsDireccion } from "@/lib/recursos-core";
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
    <div className={styles.wrap}>
      <Link href={VEHICULOS_PATH} className={styles.volver}>
        ‹ Vehículos
      </Link>
      <h1 className={styles.titulo}>GPS</h1>
      {permitido && estado ? (
        <div className={styles.lineas}>
          {estado.proveedor ? <span className={styles.linea}>{estado.proveedor}</span> : null}
          <span className={styles.linea}>{estado.vehiculosConRastreador} con rastreador</span>
        </div>
      ) : null}
      {permitido ? (
        <VehiculosFlotaMapa token={token} />
      ) : (
        <p className={styles.frase} role="status">
          Solo Dirección General puede ver el GPS.
        </p>
      )}
    </div>
  );
}
