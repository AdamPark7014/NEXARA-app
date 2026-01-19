"use client";

import styles from "./section.module.css";

export default function Proyectos() {
  const projects = [
    { id: 1, name: "Sitio Web Corporativo", status: "En progreso", progress: 65, dueDate: "2025-02-15" },
    { id: 2, name: "App Mobile", status: "Completado", progress: 100, dueDate: "2025-01-08" },
    { id: 3, name: "Dashboard Analytics", status: "Pendiente", progress: 20, dueDate: "2025-03-01" },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Proyectos</h2>
        <button className={styles.btnPrimary}>➕ Nuevo Proyecto</button>
      </div>

      <div className={styles.grid}>
        {projects.map((project) => (
          <div key={project.id} className={styles.card}>
            <h3 className={styles.cardTitle}>{project.name}</h3>
            <p className={styles.cardStatus}>{project.status}</p>
            <div className={styles.progressBar}>
              <div className={styles.progress} style={{ width: `${project.progress}%` }}></div>
            </div>
            <div className={styles.cardFooter}>
              <span className={styles.percentage}>{project.progress}%</span>
              <span className={styles.dueDate}>{project.dueDate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
