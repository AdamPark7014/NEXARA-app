"use client";

import React, { useEffect, useMemo, useState } from "react";
import ContabilidadViaticTable from "./ContabilidadViaticTable";
import { useUser } from "@/components/UserContext";
import { canViewContabilidadTarget } from "@/lib/contabilidad-visibility";
import styles from "./page.module.css";

type Viatic = {
  id: number;
  usuarioId?: number | null;
  usuario?: {
    id?: number;
    roleName?: string;
    roleFlags?: { accesoConsoleAdmin?: boolean } | null;
    isSuperAdmin?: boolean;
    permissions?: string[];
  } | null;
  montoSolicitado?: number | null;
  estatusPago?: string | null;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function ContabilidadViatics() {
  const { user } = useUser();
  const [viatics, setViatics] = useState<Viatic[]>([]);

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl("viatics"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setViatics(Array.isArray(data) ? data : []))
      .catch(() => setViatics([]));
  }, [user]);

  const visibleViatics = useMemo(() => {
    return viatics.filter((item) =>
      canViewContabilidadTarget(user, {
        id: item.usuario?.id ?? item.usuarioId,
        isSuperAdmin: item.usuario?.isSuperAdmin,
        roleName: item.usuario?.roleName,
        roleFlags: item.usuario?.roleFlags,
        permissions: item.usuario?.permissions,
      }),
    );
  }, [viatics, user]);

  const totals = useMemo(() => {
    const total = visibleViatics.reduce((sum, item) => sum + (item.montoSolicitado || 0), 0);
    const pending = visibleViatics.filter((item) => item.estatusPago === "Pendiente").length;
    const approved = visibleViatics.filter((item) => item.estatusPago === "Aprobado").length;
    return { total, pending, approved };
  }, [visibleViatics]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Viáticos y gastos</h1>
          <p className={styles.subtitle}>
            Supervisa solicitudes, aprobaciones y comprobantes con impacto en caja.
          </p>
        </div>
      </header>

      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <p>Total solicitado</p>
          <h2>{formatCurrency(totals.total)}</h2>
        </div>
        <div className={styles.metricCard}>
          <p>Pendientes</p>
          <h2>{totals.pending}</h2>
        </div>
        <div className={styles.metricCard}>
          <p>Aprobados</p>
          <h2>{totals.approved}</h2>
        </div>
      </div>

      <ContabilidadViaticTable />
    </section>
  );
}

