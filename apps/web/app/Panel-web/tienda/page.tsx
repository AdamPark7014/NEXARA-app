"use client";

import { useState } from "react";
import SourceFilter from "./SourceFilter";
import ProductosTab from "./ProductosTab";
import OrdenesTab from "./OrdenesTab";
import InventarioTab from "./InventarioTab";
import CategoriasTab from "./CategoriasTab";
import DescuentosTab from "./DescuentosTab";
import styles from "./tienda.module.css";

export default function Tienda() {
  const [activeTab, setActiveTab] = useState("productos");
  const [selectedSource, setSelectedSource] = useState("todos");

  const tabs = [
    { id: "productos", label: "📦 Productos", icon: "📦" },
    { id: "ordenes", label: "📋 Órdenes", icon: "📋" },
    { id: "inventario", label: "📊 Inventario", icon: "📊" },
    { id: "categorias", label: "🏷️ Categorías", icon: "🏷️" },
    { id: "descuentos", label: "🎁 Descuentos", icon: "🎁" },
  ];

  return (
    <div className={styles.tiendaSection}>
      <div className={styles.header}>
        <h2 className={styles.title}>🛍️ Gestión de Tienda</h2>
      </div>

      {/* Source Filter */}
      <SourceFilter selectedSource={selectedSource} onSourceChange={setSelectedSource} />

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            <span>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.tabContent}>
        {activeTab === "productos" && <ProductosTab source={selectedSource} />}
        {activeTab === "ordenes" && <OrdenesTab source={selectedSource} />}
        {activeTab === "inventario" && <InventarioTab source={selectedSource} />}
        {activeTab === "categorias" && <CategoriasTab source={selectedSource} />}
        {activeTab === "descuentos" && <DescuentosTab source={selectedSource} />}
      </div>
    </div>
  );
}
