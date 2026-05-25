"use client";

import { useState } from "react";
import styles from "../../../console/console.module.css";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

export default function ToolsHistoryPage() {
  const { user } = useUser();
  const [selectedUser, setSelectedUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  if (!user) return null;

  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user.isSuperAdmin;

  const filterOptions = [
    { value: "all", label: "Todas" },
    { value: "active", label: "En uso" },
    { value: "returned", label: "Devueltas" },
    { value: "pending", label: "Pendientes de devolución" },
    { value: "damaged", label: "Con daños" },
  ];

  return (
    <div className={styles.pageContainer}>
      <HelpTab module="tools-history" user={user} />
      <div className={styles.pageHeader}>
        <h1>Historial de Herramientas</h1>
        <p>
          {isSuperAdmin
            ? "Visualizar herramientas asignadas a cada miembro del equipo"
            : "Gestionar herramientas prestadas y su historial"}
        </p>
      </div>

      {/* Filtros */}
      <div className={styles.filterSection}>
        <div className={styles.filterGroup}>
          <label htmlFor="status">Estado</label>
          <select
            id="status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={styles.formInput}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && !isSuperAdmin && (
          <div className={styles.filterGroup}>
            <label htmlFor="user">Usuario</label>
            <input
              type="text"
              id="user"
              placeholder="Buscar usuario..."
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className={styles.formInput}
            />
          </div>
        )}
      </div>

      {/* Tabla de Herramientas */}
      <div className={styles.toolsSection}>
        <h2>
          {isSuperAdmin ? "Herramientas por Usuario" : "Historial de Préstamos"}
        </h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                {isAdmin && <th>Usuario</th>}
                <th>Herramienta</th>
                <th>Fecha Préstamo</th>
                <th>Fecha Devolución</th>
                <th>Estado</th>
                <th>Daños</th>
                <th>Multas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className={styles.emptyTableMessage}>
                  {isAdmin
                    ? "No hay herramientas registradas"
                    : "No tienes herramientas prestadas"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen de Estatus */}
      {!isSuperAdmin && (
        <div className={styles.statusSummary}>
          <h2>Resumen de tu estatus</h2>
          <div className={styles.statusCards}>
            <div className={styles.statusCard}>
              <div className={styles.statusNumber}>0</div>
              <div className={styles.statusLabel}>En uso</div>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.statusNumber}>0</div>
              <div className={styles.statusLabel}>Pendientes</div>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.statusNumber}>0</div>
              <div className={styles.statusLabel}>Multas asociadas</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
