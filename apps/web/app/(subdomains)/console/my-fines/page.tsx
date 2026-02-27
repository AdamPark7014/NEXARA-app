"use client";

import styles from "../console.module.css";
import { useUser } from "@/components/UserContext";
import FinesTable from "@/components/FinesTable";

export default function MyFinesPage() {
  const { user } = useUser();

  if (!user) return null;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1>📋 Mis Multas</h1>
        <p>Historial de multas registradas en tu contra</p>
      </div>

      <div className={styles.toolsSection}>
        <FinesTable usuarioId={user.id} showUser={false} />
      </div>
    </div>
  );
}
