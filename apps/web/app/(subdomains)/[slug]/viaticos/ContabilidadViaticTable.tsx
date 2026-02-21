"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import styles from "./ContabilidadViaticTable.module.css";

type Viatic = {
  id: number;
  actividad?: { anNumber: string };
  montoSolicitado: number;
  razonGasto: string;
  ticketEvidenciaUrl: string;
  estatusPago: string;
  usuario?: { nombre: string };
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);

const ContabilidadViaticTable = () => {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [viatics, setViatics] = useState<Viatic[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUsuario, setFilterUsuario] = useState("");
  const [filterRazon, setFilterRazon] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch(buildApiUrl("viatics"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.json())
      .then((data) => setViatics(Array.isArray(data) ? data : []))
      .catch(() => setViatics([]));
  }, [user]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ["websocket"] });

    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Viatico") {
        fetch(buildApiUrl("viatics"), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
          .then((res) => res.json())
          .then((data) => setViatics(Array.isArray(data) ? data : []))
          .catch(() => setViatics([]));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  const filtered = useMemo(() => {
    let data = viatics;
    if (filterStatus) data = data.filter((v) => v.estatusPago === filterStatus);
    if (filterUsuario)
      data = data.filter((v) =>
        v.usuario?.nombre?.toLowerCase().includes(filterUsuario.toLowerCase())
      );
    if (filterRazon)
      data = data.filter((v) => v.razonGasto?.toLowerCase().includes(filterRazon.toLowerCase()));
    return data;
  }, [viatics, filterStatus, filterUsuario, filterRazon]);

  const totals = useMemo(() => {
    const total = filtered.reduce((sum, item) => sum + (item.montoSolicitado || 0), 0);
    return { total, count: filtered.length };
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(buildApiUrl("viatics/import"), {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      setImportMsg("Error al importar viaticos");
      return;
    }
    const data = await res.json();
    setImportMsg(data.message + (data.count ? ` (${data.count})` : ""));
    fetch(buildApiUrl("viatics"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.json())
      .then((payload) => setViatics(Array.isArray(payload) ? payload : []));
  };

  const handleApprove = async (id: number, value: "Aprobado" | "Rechazado") => {
    if (!user) return;
    setActionLoading(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(buildApiUrl(`viatics/${id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ estatusPago: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Error al actualizar viatico");
      }
      setSuccess("Viatico actualizado");
      const updated = await fetch(buildApiUrl("viatics"), {
        headers: { Authorization: `Bearer ${user.token}` },
      }).then((r) => r.json());
      setViatics(Array.isArray(updated) ? updated : []);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido");
    } finally {
      setActionLoading(null);
    }
  };

  if (!user) return null;

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Panel financiero</p>
          <h2 className={styles.title}>Viaticos</h2>
          <p className={styles.subtitle}>Total filtrado: {formatCurrency(totals.total)} · {totals.count} items</p>
        </div>
        {hasPermission(user, PERMISSIONS.VIATICS_EXPORT) && (
          <div className={styles.actionGroup}>
            <button
              className={styles.primaryButton}
              onClick={async () => {
                const res = await fetch(buildApiUrl("export/viatic"));
                if (!res.ok) return alert("Error al exportar");
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "viaticos.xlsx";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
              }}
            >
              Exportar Excel
            </button>
            <button className={styles.ghostButton} onClick={() => fileInputRef.current?.click()}>
              Importar Excel
            </button>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              ref={fileInputRef}
              className={styles.hiddenInput}
              onChange={handleImport}
            />
          </div>
        )}
      </header>

      <div className={styles.filters}>
        <select className={styles.input} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Aprobado">Aprobado</option>
          <option value="Rechazado">Rechazado</option>
        </select>
        <input
          className={styles.input}
          placeholder="Filtrar por usuario"
          value={filterUsuario}
          onChange={(e) => setFilterUsuario(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="Filtrar por razon"
          value={filterRazon}
          onChange={(e) => setFilterRazon(e.target.value)}
        />
        <select className={styles.input} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {[10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size} por pagina
            </option>
          ))}
        </select>
      </div>

      {importMsg && (
        <div className={importMsg.startsWith("Error") ? styles.error : styles.success}>{importMsg}</div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Actividad</th>
              <th>Monto</th>
              <th>Razon</th>
              <th>Ticket</th>
              <th>Estatus</th>
              <th>Usuario</th>
              {hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.map((v) => (
              <tr key={v.id}>
                <td>{v.actividad?.anNumber}</td>
                <td>{formatCurrency(v.montoSolicitado)}</td>
                <td>{v.razonGasto}</td>
                <td>
                  {v.ticketEvidenciaUrl ? (
                    <a className={styles.link} href={v.ticketEvidenciaUrl} target="_blank" rel="noopener noreferrer">
                      Ver
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      v.estatusPago === "Aprobado"
                        ? styles.badgeApproved
                        : v.estatusPago === "Pendiente"
                          ? styles.badgePending
                          : styles.badgeRejected
                    }`}
                  >
                    {v.estatusPago}
                  </span>
                </td>
                <td>{v.usuario?.nombre}</td>
                {hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && (
                  <td className={styles.actions}>
                    {v.estatusPago === "Pendiente" && (
                      <>
                        <button
                          className={styles.primaryButton}
                          onClick={() => handleApprove(v.id, "Aprobado")}
                          disabled={actionLoading === v.id}
                        >
                          {actionLoading === v.id ? "Aprobando..." : "Aprobar"}
                        </button>
                        <button
                          className={styles.dangerButton}
                          onClick={() => handleApprove(v.id, "Rechazado")}
                          disabled={actionLoading === v.id}
                        >
                          {actionLoading === v.id ? "Rechazando..." : "Rechazar"}
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className={styles.footer}>
        <button
          className={styles.ghostButton}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Anterior
        </button>
        <span className={styles.pageInfo}>Pagina {page} de {totalPages || 1}</span>
        <button
          className={styles.ghostButton}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages || totalPages === 0}
        >
          Siguiente
        </button>
      </footer>

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}
    </section>
  );
};

export default ContabilidadViaticTable;
