"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const STORAGE_KEY = "nexara_capital_snapshot";

type CapitalSnapshot = {
  cash: number;
  revenue: number;
  expenses: number;
  investments: number;
};

const toNumber = (value: string) => {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function ContabilidadCapital() {
  const [snapshot, setSnapshot] = useState<CapitalSnapshot>({
    cash: 0,
    revenue: 0,
    expenses: 0,
    investments: 0,
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as CapitalSnapshot;
      setSnapshot({
        cash: data.cash || 0,
        revenue: data.revenue || 0,
        expenses: data.expenses || 0,
        investments: data.investments || 0,
      });
    } catch (_err) {
      setSnapshot({ cash: 0, revenue: 0, expenses: 0, investments: 0 });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [snapshot]);

  const net = useMemo(() => snapshot.revenue - snapshot.expenses, [snapshot]);
  const totalCapital = useMemo(() => snapshot.cash + snapshot.investments, [snapshot]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Capital y presupuesto</h1>
          <p className={styles.subtitle}>
            Controla la salud financiera y registra la fotografia de capital disponible.
          </p>
        </div>
      </header>

      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <p>Capital disponible</p>
          <h2>{formatCurrency(totalCapital)}</h2>
          <span>Cash + inversiones</span>
        </div>
        <div className={styles.metricCard}>
          <p>Flujo neto mensual</p>
          <h2>{formatCurrency(net)}</h2>
          <span>Ingresos - egresos</span>
        </div>
      </div>

      <form className={styles.form}>
        <label>
          Caja disponible
          <input
            type="number"
            value={snapshot.cash}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, cash: toNumber(event.target.value) }))}
          />
        </label>
        <label>
          Ingresos mensuales
          <input
            type="number"
            value={snapshot.revenue}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, revenue: toNumber(event.target.value) }))}
          />
        </label>
        <label>
          Egresos mensuales
          <input
            type="number"
            value={snapshot.expenses}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, expenses: toNumber(event.target.value) }))}
          />
        </label>
        <label>
          Inversiones activas
          <input
            type="number"
            value={snapshot.investments}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, investments: toNumber(event.target.value) }))}
          />
        </label>
      </form>
    </section>
  );
}
