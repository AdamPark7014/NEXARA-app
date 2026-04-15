"use client";

import { useState } from "react";
import { useUser } from "@/components/UserContext";
import SalesReportsDashboard from "@/components/SalesReportsDashboard";
import styles from "./page.module.css";

export default function VentasReportesPage() {
  const { user } = useUser();
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Cargando...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.reportSection}>
        <SalesReportsDashboard 
          period={period}
          onPeriodChange={setPeriod}
        />
      </section>
    </div>
  );
}
