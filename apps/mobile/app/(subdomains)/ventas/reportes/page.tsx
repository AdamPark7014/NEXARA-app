"use client";

import { useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import SalesReportsDashboard from "@/components/SalesReportsDashboard";
import styles from "./page.module.css";

export default function VentasReportesPage() {
  const { user } = useUser();
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    return base.replace(/[/.]+$/, "");
  }, []);

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
          apiUrl={apiUrl}
          period={period}
          onPeriodChange={setPeriod}
        />
      </section>
    </div>
  );
}
