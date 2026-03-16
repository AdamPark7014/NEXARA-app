"use client";

import React from "react";
import ContabilidadHorasTable from "./ContabilidadHorasTable";
import styles from "./page.module.css";

export default function ContabilidadHoras() {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Horas trabajadas</h1>
          <p className={styles.subtitle}>
            Análisis de jornadas y productividad por usuario para control de costos.
          </p>
        </div>
      </header>
      <ContabilidadHorasTable />
    </section>
  );
}
