"use client";

import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useMemo, useState } from "react";
import FinesForm from "@/components/FinesForm";
import { useUser } from "@/components/UserContext";
import styles from "./page.module.css";

type Fine = {
  id: number;
  usuarioId: number;
  tipo: string;
  razon: string;
  descripcion?: string;
  monto: number;
  estatusPago: string;
  fechaCreacion: string;
  usuario?: { nombre: string; email?: string } | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("es-MX");

export default function ContabilidadMultas() {
  const { user } = useUser();
  const [fines, setFines] = useState<Fine[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl("fines"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFines(Array.isArray(data) ? data : []))
      .catch(() => setFines([]));
  }, [user?.token, refreshKey]);

  const total = useMemo(
    () => fines.reduce((sum, fine) => sum + Number(fine.monto), 0),
    [fines]
  );

  const finesByType = useMemo(() => {
    return {
      actividad: fines.filter((f) => f.tipo === "actividad"),
      vehiculo: fines.filter((f) => f.tipo === "vehiculo"),
      asistencia: fines.filter((f) => f.tipo === "asistencia"),
      herramienta: fines.filter((f) => f.tipo === "herramienta"),
    };
  }, [fines]);

  const handleFineCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const renderTable = (tableData: Fine[], title: string) => (
    <div>
      <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>{title}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Razón</th>
              <th>Descripción</th>
              <th>Monto</th>
              <th>Estatus</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((fine) => (
              <tr key={fine.id}>
                <td>{fine.usuario?.nombre || "-"}</td>
                <td>{fine.razon}</td>
                <td>{fine.descripcion || "-"}</td>
                <td>{formatCurrency(fine.monto)}</td>
                <td>{fine.estatusPago}</td>
                <td>{formatDate(fine.fechaCreacion)}</td>
              </tr>
            ))}
            {tableData.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>
                  No hay multas registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Gestión de Multas</h1>
          <p className={styles.subtitle}>
            Registra y supervisa todas las multas del personal: actividades, vehículos, asistencia y herramientas.
          </p>
        </div>
      </header>

      <div className={styles.summaryCard}>
        <p>Total en multas</p>
        <h2>{formatCurrency(total)}</h2>
        <span>{fines.length} registros</span>
      </div>

      {/* Formulario para crear multas */}
      <FinesForm onFineCreated={handleFineCreated} />

      {/* Multas por tipo */}
      <div style={{ display: 'grid', gap: 24 }}>
        {renderTable(finesByType.actividad, "Multas por Actividades")}
        {renderTable(finesByType.vehiculo, "Multas por Vehículos")}
        {renderTable(finesByType.asistencia, "Multas por Asistencia")}
        {renderTable(finesByType.herramienta, "Multas por Herramientas")}
      </div>
    </section>
  );
}
