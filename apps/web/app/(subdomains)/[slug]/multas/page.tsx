"use client";

import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import styles from "./page.module.css";

type VehiclePenalty = {
  id: number;
  penalizacionMonto?: number | null;
  penalizacionNotas?: string | null;
  estatusAprobacion?: string | null;
  fechaInicio?: string | null;
  solicitante?: { nombre: string } | null;
  vehiculo?: { nombre?: string | null; placas?: string | null } | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("es-MX") : "-";

export default function ContabilidadMultas() {
  const { user } = useUser();
  const [penalties, setPenalties] = useState<VehiclePenalty[]>([]);

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl("vehicles"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPenalties(list.filter((item) => (item.penalizacionMonto || 0) > 0));
      })
      .catch(() => setPenalties([]));
  }, [user]);

  const total = useMemo(
    () => penalties.reduce((sum, item) => sum + (item.penalizacionMonto || 0), 0),
    [penalties]
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Multas y danos vehiculares</h1>
          <p className={styles.subtitle}>
            Concentrado de penalizaciones aplicadas a vehiculos en uso operativo.
          </p>
        </div>
      </header>

      <div className={styles.summaryCard}>
        <p>Total en multas</p>
        <h2>{formatCurrency(total)}</h2>
        <span>{penalties.length} registros con cargos</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Vehiculo</th>
              <th>Responsable</th>
              <th>Monto</th>
              <th>Notas</th>
              <th>Fecha</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {penalties.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.vehiculo?.nombre || "Vehiculo"}
                  {item.vehiculo?.placas ? ` (${item.vehiculo.placas})` : ""}
                </td>
                <td>{item.solicitante?.nombre || "-"}</td>
                <td>{formatCurrency(item.penalizacionMonto || 0)}</td>
                <td>{item.penalizacionNotas || "Sin notas"}</td>
                <td>{formatDate(item.fechaInicio)}</td>
                <td>{item.estatusAprobacion || "-"}</td>
              </tr>
            ))}
            {penalties.length === 0 && (
              <tr>
                <td colSpan={6}>No hay multas registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
