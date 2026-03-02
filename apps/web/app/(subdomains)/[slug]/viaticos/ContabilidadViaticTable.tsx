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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    const socket: Socket = io(socketUrl, { transports: ["polling", "websocket"] });

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

  const mobileCardListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const mobileCardStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb",
  };

  const mobileMetaGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginTop: "12px",
  };

  const mobileMetaItemStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const mobileMetaLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#6b7280",
    letterSpacing: "0.5px",
    wordBreak: "break-word",
  };

  const mobileMetaValueStyle: React.CSSProperties = {
    fontSize: "14px",
    color: "#111827",
    fontWeight: 500,
    wordBreak: "break-word",
    overflowWrap: "break-word",
    minWidth: 0,
  };

  const mobileActionGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "10px",
    marginTop: "16px",
    width: "100%",
  };

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

      {!isMobile && (
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
      )}

      {isMobile && (
        <div style={mobileCardListStyle}>
          {paginated.map((v) => (
            <div key={v.id} style={mobileCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                  <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 600 }}>#{v.actividad?.anNumber || "N/A"}</span>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#059669" }}>{formatCurrency(v.montoSolicitado)}</span>
                </div>
                <span
                  className={`${styles.badge} ${
                    v.estatusPago === "Aprobado"
                      ? styles.badgeApproved
                      : v.estatusPago === "Pendiente"
                        ? styles.badgePending
                        : styles.badgeRejected
                  }`}
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                >
                  {v.estatusPago}
                </span>
              </div>

              <div style={mobileMetaGridStyle}>
                <div style={mobileMetaItemStyle}>
                  <span style={mobileMetaLabelStyle}>Razón</span>
                  <span style={mobileMetaValueStyle}>{v.razonGasto}</span>
                </div>
                <div style={mobileMetaItemStyle}>
                  <span style={mobileMetaLabelStyle}>Usuario</span>
                  <span style={mobileMetaValueStyle}>{v.usuario?.nombre || "N/A"}</span>
                </div>
                <div style={mobileMetaItemStyle}>
                  <span style={mobileMetaLabelStyle}>Ticket</span>
                  {v.ticketEvidenciaUrl ? (
                    <a className={styles.link} href={v.ticketEvidenciaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px" }}>
                      Ver evidencia
                    </a>
                  ) : (
                    <span style={{ fontSize: "14px", color: "#9ca3af" }}>Sin ticket</span>
                  )}
                </div>
              </div>

              {hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && v.estatusPago === "Pendiente" && (
                <div style={mobileActionGridStyle}>
                  <button
                    className={styles.primaryButton}
                    onClick={() => handleApprove(v.id, "Aprobado")}
                    disabled={actionLoading === v.id}
                    style={{ minHeight: "46px", fontSize: "14px", fontWeight: 600 }}
                  >
                    {actionLoading === v.id ? "Aprobando..." : "Aprobar"}
                  </button>
                  <button
                    className={styles.dangerButton}
                    onClick={() => handleApprove(v.id, "Rechazado")}
                    disabled={actionLoading === v.id}
                    style={{ minHeight: "46px", fontSize: "14px", fontWeight: 600 }}
                  >
                    {actionLoading === v.id ? "Rechazando..." : "Rechazar"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <footer className={styles.footer} style={isMobile ? { display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "12px", alignItems: "center" } : undefined}>
        <button
          className={styles.ghostButton}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          style={isMobile ? { minHeight: "46px", fontSize: "15px", fontWeight: 600 } : undefined}
        >
          Anterior
        </button>
        <span className={styles.pageInfo} style={isMobile ? { fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" } : undefined}>Pagina {page} de {totalPages || 1}</span>
        <button
          className={styles.ghostButton}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages || totalPages === 0}
          style={isMobile ? { minHeight: "46px", fontSize: "15px", fontWeight: 600 } : undefined}
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
