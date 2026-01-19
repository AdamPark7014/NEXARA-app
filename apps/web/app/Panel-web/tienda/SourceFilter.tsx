"use client";

import styles from "./tienda.module.css";

interface SourceFilterProps {
  selectedSource: string;
  onSourceChange: (source: string) => void;
}

const sources = [
  { id: "todos", label: "Todos", icon: "🌐", color: "#8b5cf6" },
  { id: "nexara", label: "Nexara", icon: "🏢", color: "#60a5fa" },
  { id: "syscom", label: "SYSCOM", icon: "📡", color: "#34d399" },
  { id: "ct-internacional", label: "CT Internacional", icon: "🌍", color: "#f59e0b" },
];

export default function SourceFilter({ selectedSource, onSourceChange }: SourceFilterProps) {
  return (
    <div className={styles.sourceFilterContainer}>
      <div className={styles.filterLabel}>📍 Fuente de Datos:</div>
      <div className={styles.sourceButtons}>
        {sources.map((source) => (
          <button
            key={source.id}
            className={`${styles.sourceBtn} ${selectedSource === source.id ? styles.active : ""}`}
            onClick={() => onSourceChange(source.id)}
            title={source.label}
            style={{
              borderColor: selectedSource === source.id ? source.color : undefined,
              color: selectedSource === source.id ? source.color : undefined,
            }}
          >
            <span className={styles.sourceIcon}>{source.icon}</span>
            <span className={styles.sourceLabel}>{source.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
