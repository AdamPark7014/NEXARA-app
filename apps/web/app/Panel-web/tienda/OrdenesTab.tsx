"use client";

import styles from "./tienda.module.css";

import { useEffect, useState } from "react";

interface Orden {
  id: number;
  order: string;
  customer: string;
  total: number;
  status: string;
  date: string;
  source: string;
}

interface OrdenesTabProps {
  source: string;
}

export default function OrdenesTab({ source }: OrdenesTabProps) {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);

  async function fetchOrdenes() {
    try {
      const response = await fetch("http://localhost:3001/orders");
      const data = await response.json();
      setOrdenes(Array.isArray(data) ? data : []);
    } catch {
      setOrdenes([]);
    }
  }

  useEffect(() => {
    fetchOrdenes();
  }, []);

  async function handleNuevaOrden() {
    try {
      const nuevaOrden = {
        userId: 1,
        status: 'PENDING',
        email: "demo@nexara.com",
        total: 2300,
        items: [
          { productId: 1, quantity: 2, price: 1500, supplierId: 1 },
          { productId: 1, quantity: 1, price: 800, supplierId: 1 }
        ]
      };
      const response = await fetch('http://localhost:3001/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaOrden)
      });
      if (!response.ok) throw new Error('Error al crear la orden');
      const resultado = await response.json();
      // Si la respuesta tiene success y order, mostrar el id correctamente
      if (resultado.success && resultado.order && resultado.order.id) {
        alert('Orden creada: ' + resultado.order.id);
      } else {
        alert('Orden creada: ' + JSON.stringify(resultado));
      }
      fetchOrdenes();
    } catch (error: unknown) {
      if (error instanceof Error) {
        alert('Error: ' + error.message);
      } else {
        alert('Error desconocido');
      }
    }
  }

  const filteredOrdenes = source === "todos" 
    ? ordenes 
    : ordenes.filter(o => o.source === source);

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Completado":
        return styles.completado;
      case "Enviado":
        return styles.enviado;
      case "Pendiente":
        return styles.pendiente;
      case "Procesando":
        return styles.procesando;
      default:
        return "";
    }
  };

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h3 className={styles.subTitle}>📋 Órdenes</h3>
        <button className={styles.btnPrimary} onClick={handleNuevaOrden}>➕ Nueva Orden</button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Fuente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrdenes.length > 0 ? (
              filteredOrdenes.map((orden) => (
                <tr key={orden.id}>
                  <td><strong>{orden.order}</strong></td>
                  <td>{orden.customer}</td>
                  <td className={styles.price}>{orden.total}</td>
                  <td>
                    <span className={`${styles.badge} ${getStatusClass(orden.status)}`}>
                      {orden.status}
                    </span>
                  </td>
                  <td className={styles.date}>{orden.date}</td>
                  <td>
                    <span className={`${styles.sourceBadge} ${styles[orden.source]}`}>
                      {orden.source === "nexara" && "🏢 Nexara"}
                      {orden.source === "syscom" && "📡 SYSCOM"}
                      {orden.source === "ct-internacional" && "🌍 CT"}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.btnSmall} title="Ver detalles">👁️</button>
                    <button className={styles.btnSmall} title="Editar">✎</button>
                    <button className={styles.btnSmall} title="Descargar">📥</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className={styles.emptyMessage}>No hay órdenes disponibles para esta fuente</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
