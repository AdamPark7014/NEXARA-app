"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import ContextRail from "@/components/ui/ContextRail";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import {
  MIS_VEHICULOS_PATH,
  VEHICULOS_GPS_PATH,
  VEHICULOS_PATH,
  puedeVerGpsDireccion,
} from "@/lib/recursos-core";
import {
  etiquetaEstatus,
  formatoFecha,
  formatoKm,
  listarFlotilla,
  nivelDeCombustible,
  type VehiculoFlota,
} from "@/lib/vehiculos-api";
import styles from "./vehiculos-core.module.css";

/**
 * Flotilla en Core (`/erp/vehiculos`): qué hay, quién lo trae y cuándo vuelve.
 * Antes esta ruta reexportaba la pantalla de OPS; ahora es propia y lee
 * `vehicles/flotilla`. `/ops/vehicles` sigue existiendo tal cual.
 */
export default function VehiculosPage() {
  const router = useRouter();
  const { user } = useUser();
  const token = user?.token ?? "";
  const verGps = puedeVerGpsDireccion(user);

  const [vehiculos, setVehiculos] = useState<VehiculoFlota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setVehiculos(await listarFlotilla(token));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la flotilla"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const kpis = useMemo(() => {
    const activos = vehiculos.filter((v) => v.activo);
    return {
      total: vehiculos.length,
      disponibles: activos.filter((v) => v.disponible).length,
      enUso: activos.filter((v) => !v.disponible && v.conductor).length,
    };
  }, [vehiculos]);

  const columnas: Column<VehiculoFlota>[] = [
    {
      key: "vehiculo",
      label: "Vehículo",
      render: (v) => (
        <div className={styles.filaVehiculo}>
          <span className={styles.nombre}>{v.nombre}</span>
          <span className={styles.placas}>{v.placas || "sin placas"}</span>
        </div>
      ),
    },
    {
      key: "estado",
      label: "Estado",
      render: (v) => {
        const est = etiquetaEstatus(v.estatus);
        return (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Tag variant={v.disponible ? "positive" : est.variante} dot>
              {v.disponible ? "Disponible" : est.texto}
            </Tag>
            {v.tieneRastreador && (
              <span className={styles.info} title={`GPS: ${v.gpsProveedor || "con rastreador"}`}>
                i
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "conductor",
      label: "Con",
      render: (v) =>
        v.conductor ? (
          <div className={styles.filaVehiculo}>
            <span>{v.conductor.nombre}</span>
            {v.desde && <span className={styles.mini}>desde {formatoFecha(v.desde)}</span>}
          </div>
        ) : (
          <span className={styles.tenue}>—</span>
        ),
    },
    {
      key: "devolucion",
      label: "Devuelve",
      render: (v) =>
        v.proximaDevolucion ? (
          <span>{formatoFecha(v.proximaDevolucion)}</span>
        ) : (
          <span className={styles.tenue}>—</span>
        ),
    },
    {
      key: "odometro",
      label: "Odómetro",
      numeric: true,
      render: (v) => (
        <div className={styles.filaVehiculo} style={{ alignItems: "flex-end" }}>
          <span>{formatoKm(v.odometroUltimo)}</span>
          {v.combustibleUltimoPct !== null && (
            <span className={styles.mini}>{nivelDeCombustible(v.combustibleUltimoPct)}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.wrap}>
      <PageHeader
        eyebrow="Core · Vehículos"
        title="Flotilla"
        density="ops"
        actions={
          <>
            <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
              Actualizar
            </Button>
            {verGps && (
              <Button variant="secondary" onClick={() => router.push(VEHICULOS_GPS_PATH)}>
                GPS
              </Button>
            )}
          </>
        }
      />

      <ContextRail
        ariaLabel="Vehículos"
        items={[
          { id: "flotilla", label: "Flotilla", href: VEHICULOS_PATH, active: true },
          { id: "mios", label: "Mis vehículos", href: MIS_VEHICULOS_PATH },
          ...(verGps ? [{ id: "gps", label: "GPS", href: VEHICULOS_GPS_PATH }] : []),
        ]}
      />

      {error && <InlineAlert message={error} variant="danger" />}

      <div className={styles.kpis}>
        <KpiCard label="Vehículos" value={kpis.total} />
        <KpiCard label="Disponibles" value={kpis.disponibles} variant="positive" />
        <KpiCard label="En uso" value={kpis.enUso} variant="accent" />
      </div>

      <Section title={cargando ? "Cargando…" : `${vehiculos.length} vehículos`} flush>
        {cargando ? (
          <div style={{ padding: 20 }}>
            <EmptyState title="Cargando…" description="Consultando la flotilla." variant="compact" />
          </div>
        ) : error ? (
          <div style={{ padding: 20 }}>
            <EmptyState
              title="No se pudo cargar"
              description={error}
              variant="compact"
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : (
          <DataTable
            columns={columnas}
            rows={vehiculos}
            rowKey={(v) => v.id}
            density="compact"
            onRowClick={(v) => router.push(`${VEHICULOS_PATH}/${v.id}`)}
            emptyTitle="Sin vehículos"
            emptyDescription="La flotilla está vacía."
          />
        )}
      </Section>
    </div>
  );
}
