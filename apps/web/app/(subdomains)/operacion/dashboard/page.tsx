"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../console/console.module.css";

const quickLinks = [
  { href: "/client-tickets", label: "Helpdesk", icon: "🎫", desc: "Tickets y solicitudes de clientes" },
  { href: "/activities", label: "Actividades", icon: "🗂️", desc: "Órdenes de servicio en campo" },
  { href: "/projects", label: "Instalaciones", icon: "🧩", desc: "Proyectos CCTV / tech activos" },
  { href: "/assets", label: "Activos", icon: "📡", desc: "Equipos instalados por cliente" },
  { href: "/maintenance", label: "Mantenimiento", icon: "🔧", desc: "Contratos y visitas programadas" },
  { href: "/gps", label: "GPS", icon: "🛰️", desc: "Ubicación de técnicos en tiempo real" },
];

export default function OperacionDashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) router.replace("/login");
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) return null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <p style={{ margin: 0, color: "var(--text-secondary, #5a6a7a)", maxWidth: 720 }}>
        Centro de operación para servicios de cómputo, tech y CCTV: helpdesk, instalaciones, activos en cliente y
        logística de campo.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {quickLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.menuLink}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 18,
              borderRadius: 14,
              border: "1px solid var(--border, rgba(0,0,0,0.08))",
              textDecoration: "none",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>{item.icon}</span>
            <strong>{item.label}</strong>
            <span style={{ fontSize: "0.88rem", opacity: 0.85 }}>{item.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
