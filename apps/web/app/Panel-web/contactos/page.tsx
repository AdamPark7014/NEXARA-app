"use client";

import styles from "./section.module.css";

export default function Contactos() {
  const contacts = [
    { id: 1, name: "Juan García", email: "juan@email.com", phone: "+52 55 1234 5678", message: "Consulta sobre productos", date: "2025-01-08" },
    { id: 2, name: "María López", email: "maria@email.com", phone: "+52 55 8765 4321", message: "Soporte técnico", date: "2025-01-08" },
    { id: 3, name: "Carlos Ruiz", email: "carlos@email.com", phone: "+52 55 5555 5555", message: "Solicitud de cotización", date: "2025-01-07" },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Contactos</h2>
        <button className={styles.btnPrimary}>📧 Exportar</button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Mensaje</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.name}</td>
                <td>{contact.email}</td>
                <td>{contact.phone}</td>
                <td className={styles.truncate}>{contact.message}</td>
                <td>{contact.date}</td>
                <td className={styles.actions}>
                  <button className={styles.btnSmall}>📧</button>
                  <button className={styles.btnSmall}>✎</button>
                  <button className={styles.btnSmall}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
