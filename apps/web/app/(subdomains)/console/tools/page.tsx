"use client";

import Link from "next/link";
import styles from "../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default function ToolsPage() {
  const { user } = useUser();

  if (!user) return null;

  const tools = [
    {
      id: "fines",
      label: "Gestión de Multas",
      description: "Panel de control de multas: crear, visualizar y asignar multas a usuarios por incumplimientos laborales, daños a vehículos, herramientas y más.",
      icon: "📋",
      href: "/tools/fines",
      permissions: [PERMISSIONS.CONSOLE_ADMIN],
    },
    {
      id: "tools-history",
      label: "Historial de Herramientas",
      description: "Gestión completa de herramientas prestadas: visualizar historial, estado actual, devoluciones pendientes y multas por daño de herramientas.",
      icon: "🔧",
      href: "/tools/tools-history",
      permissions: [PERMISSIONS.CONSOLE_ADMIN],
    },
  ];

  const availableTools = tools.filter(
    (tool) =>
      !tool.permissions ||
      tool.permissions.every((permission) => hasPermission(user, permission))
  );

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1>Herramientas</h1>
        <p>Panel de control de multas y herramientas prestadas</p>
      </div>

      <div className={styles.toolsGrid}>
        {availableTools.map((tool) => (
          <Link key={tool.id} href={tool.href}>
            <div className={styles.toolCard}>
              <div className={styles.toolIcon}>{tool.icon}</div>
              <h3>{tool.label}</h3>
              <p>{tool.description}</p>
              <span className={styles.toolArrow}>→</span>
            </div>
          </Link>
        ))}
      </div>

      {availableTools.length === 0 && (
        <div className={styles.emptyState}>
          <p>No tienes acceso a ninguna herramienta en este momento</p>
        </div>
      )}
    </div>
  );
}

