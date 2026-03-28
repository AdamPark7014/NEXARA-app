"use client";

import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import ExcelDownloadModal from "./ExcelDownloadModal";
import styles from "./EvidenceTable.module.css";

interface Evidence {
  id: number;
  userId?: number;
  tipoEvidencia: string;
  archivoUrl: string;
  aprobada: boolean;
  estatus?: string;
  comentarios?: string | null;
  observacionesRevision?: string | null;
  calificacionEficiencia?: string | null;
  revisadoEn?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  actividad: {
    anNumber: string;
    titulo?: string;
    indicaciones?: string | null;
    creador?: { nombre: string } | null;
    responsable?: { nombre: string } | null;
  };
  user?: { nombre: string } | null;
  aprobadoPor?: { nombre: string } | null;
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

const getAssetUrl = (url?: string | null) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = API_URL.replace(/\/+api\/?$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
};

const getMapsUrl = (lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const EvidenceTable: React.FC<{ mode?: "admin" | "user"; title?: string | null }> = ({
  mode = "admin",
  title = "Evidencias",
}) => {
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [evidences, setEvidences] = useState<Evidence[]>([]);

  const [estatus, setEstatus] = useState<string>("");
  const [actividad, setActividad] = useState<string>("");
  const [responsable, setResponsable] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
  const [excelPreparing, setExcelPreparing] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const estatusList = ["Pendiente", "Aprobada", "Rechazada"];
  const calificacionOptions = ["Alta", "Media", "Baja"];
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<number, { calificacion: string; observaciones: string }>
  >({});

  const fetchEvidences = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl("evidences"), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("No autorizado");
        return res.json();
      })
      .then((data) => setEvidences(Array.isArray(data) ? data : []))
      .catch(() => setEvidences([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.token) return;
    fetchEvidences();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ["polling", "websocket"] });

    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Evidence") {
        fetchEvidences();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  useEffect(() => {
    return () => {
      if (excelUrl) window.URL.revokeObjectURL(excelUrl);
    };
  }, [excelUrl]);

  const closeExcelModal = () => {
    if (excelUrl) {
      window.URL.revokeObjectURL(excelUrl);
    }
    setExcelUrl(null);
    setExcelBlob(null);
  };

  const handlePrepareExcelExport = async () => {
    if (excelPreparing) return;
    setExcelPreparing(true);
    try {
      const res = await fetch(buildApiUrl("export/evidence"));
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (excelUrl) {
        window.URL.revokeObjectURL(excelUrl);
      }
      setExcelUrl(url);
      setExcelBlob(blob);
    } catch {
      alert("Error al exportar");
    } finally {
      setExcelPreparing(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!excelUrl) return;
    const a = document.createElement("a");
    a.href = excelUrl;
    a.download = "evidencias.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    closeExcelModal();
  };

  const filtered = useMemo(
    () =>
      evidences.filter(
        (evi) =>
          (estatus ? evi.estatus === estatus : true) &&
          (actividad
            ? evi.actividad?.anNumber?.toLowerCase().includes(actividad.toLowerCase())
            : true) &&
          (responsable
            ? (evi.user?.nombre || evi.actividad?.responsable?.nombre || "")
                .toLowerCase()
                .includes(responsable.toLowerCase())
            : true)
      ),
    [evidences, estatus, actividad, responsable]
  );

  const pendingCount = filtered.filter((evi) => evi.estatus === "Pendiente").length;
  const approvedCount = filtered.filter((evi) => evi.estatus === "Aprobada").length;
  const rejectedCount = filtered.filter((evi) => evi.estatus === "Rechazada").length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [estatus, actividad, responsable]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const updateReviewDraft = (
    id: number,
    changes: Partial<{ calificacion: string; observaciones: string }>
  ) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], calificacion: "", observaciones: "", ...changes },
    }));
  };

  const handleReview = async (id: number, approved: boolean) => {
    if (!user?.token) return;
    const draft = reviewDrafts[id] || { calificacion: "", observaciones: "" };
    const payload = {
      aprobada: approved,
      estatus: approved ? "Aprobada" : "Rechazada",
      calificacionEficiencia: draft.calificacion || null,
      observacionesRevision: draft.observaciones || null,
    };

    const res = await fetch(buildApiUrl(`evidences/${id}`), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      fetchEvidences();
    }
  };

  const handleRemoveOwn = async (id: number) => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl(`evidences/self/${id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (res.ok) fetchEvidences();
  };

  if (loading) return <div>Cargando evidencias...</div>;

  return (
    <div className={`card ${styles.panel}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <span className={styles.panelEyebrow}>{mode === "user" ? "Historial" : "Revisión"}</span>
          {title && <h2 className={styles.title}>{title}</h2>}
          <p className={styles.panelDescription}>
            {mode === "user"
              ? "Consulta tus archivos, revisiones y accesos rápidos sin depender de una tabla comprimida."
              : "Administra y revisa evidencias con una lectura clara de actividad, responsable, archivo y decisión."}
          </p>
        </div>

        <div className={styles.metricsGrid}>
          <div className={`${styles.metricCard} ${styles.metricNeutral}`}>
            <span className={styles.metricLabel}>Total</span>
            <strong className={styles.metricValue}>{filtered.length}</strong>
          </div>
          <div className={`${styles.metricCard} ${styles.metricPending}`}>
            <span className={styles.metricLabel}>Pendientes</span>
            <strong className={styles.metricValue}>{pendingCount}</strong>
          </div>
          <div className={`${styles.metricCard} ${styles.metricApproved}`}>
            <span className={styles.metricLabel}>Aprobadas</span>
            <strong className={styles.metricValue}>{approvedCount}</strong>
          </div>
          <div className={`${styles.metricCard} ${styles.metricRejected}`}>
            <span className={styles.metricLabel}>Rechazadas</span>
            <strong className={styles.metricValue}>{rejectedCount}</strong>
          </div>
        </div>
      </div>

      <div className={styles.filtersBlock}>
        <div className={styles.filtersRow}>
          <select className="input" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
            <option value="">Todos los estatus</option>
            {estatusList.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <input
            className="input"
            placeholder="Actividad"
            value={actividad}
            onChange={(e) => setActividad(e.target.value)}
          />

          <input
            className="input"
            placeholder="Responsable"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
          />

          {hasPermission(user, PERMISSIONS.EVIDENCES_EXPORT) && (
            <button
              className="button-primary"
              onClick={handlePrepareExcelExport}
              disabled={excelPreparing}
            >
              {excelPreparing ? "Preparando..." : "Exportar Excel"}
            </button>
          )}
        </div>

        <div className={styles.toolbarMeta}>
          <span className={styles.resultsText}>
            {filtered.length === 1 ? "1 evidencia encontrada" : `${filtered.length} evidencias encontradas`}
          </span>
          {(estatus || actividad || responsable) && (
            <button
              type="button"
              className={styles.resetFilters}
              onClick={() => {
                setEstatus("");
                setActividad("");
                setResponsable("");
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <ExcelDownloadModal
        isOpen={Boolean(excelUrl)}
        fileName="evidencias.xlsx"
        excelBlob={excelBlob}
        isPreparing={excelPreparing}
        onClose={closeExcelModal}
        onDownload={handleDownloadExcel}
      />

      {importMsg && (
        <div className={importMsg.startsWith("Error") ? styles.feedbackError : styles.feedbackSuccess}>
          {importMsg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <strong className={styles.emptyTitle}>No hay evidencias para mostrar</strong>
          <p className={styles.emptyText}>
            Ajusta los filtros o espera a que se registren nuevas evidencias para verlas aquí.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={`table ${styles.evidenceTable}`}>
            <thead className={styles.tableHead}>
              <tr>
                <th>ID</th>
                <th>Actividad</th>
                <th>Estatus</th>
                <th>Responsable</th>
                <th>Archivo</th>
                <th>Comentarios</th>
                <th>Ubicación</th>
                <th>Revision</th>
                {hasPermission(user, PERMISSIONS.EVIDENCES_REVIEW) && <th>Acciones</th>}
                {mode === "user" && <th>Gestión</th>}
              </tr>
            </thead>

            <tbody className={styles.tableBody}>
              {paginated.map((evi) => {
                const statusClass =
                  evi.estatus === "Aprobada"
                    ? styles.rowApproved
                    : evi.estatus === "Pendiente"
                      ? styles.rowPending
                      : evi.estatus === "Rechazada"
                        ? styles.rowRejected
                        : "";

                return (
                  <tr key={evi.id} className={`${styles.dataRow} ${statusClass}`}>
                    <td className={styles.dataCell} data-label="ID">
                      <div className={styles.idBlock}>
                        <span className={styles.idValue}>#{evi.id}</span>
                        <span className={styles.typePill}>{evi.tipoEvidencia}</span>
                      </div>
                    </td>

                    <td className={styles.dataCell} data-label="Actividad">
                      <div className={styles.activityTitle}>{evi.actividad?.titulo || evi.actividad?.anNumber}</div>
                      <div className={styles.cellSubtext}>{evi.actividad?.anNumber}</div>
                      <div className={styles.cellSubtext}>{evi.actividad?.indicaciones || "-"}</div>
                      <div className={styles.cellSubtext}>
                        {evi.actividad?.creador?.nombre
                          ? `Asignado por ${evi.actividad.creador.nombre}`
                          : "Asignado por -"}
                      </div>
                    </td>

                    <td className={styles.dataCell} data-label="Estatus">
                      <span
                        className={`badge ${styles.statusBadge} ${
                          evi.estatus === "Aprobada"
                            ? "approved"
                            : evi.estatus === "Pendiente"
                              ? "pending"
                              : evi.estatus === "Rechazada"
                                ? "rejected"
                                : ""
                        }`}
                      >
                        {evi.estatus}
                      </span>
                    </td>

                    <td className={styles.dataCell} data-label="Responsable">
                      {evi.user?.nombre || evi.actividad?.responsable?.nombre || "-"}
                    </td>

                    <td className={styles.dataCell} data-label="Archivo">
                      {evi.archivoUrl ? (
                        <div className={styles.fileCell}>
                          {evi.archivoUrl.toLowerCase().endsWith(".pdf") ? (
                            <div className={styles.filePreviewPdf}>PDF</div>
                          ) : (
                            <img
                              src={getAssetUrl(evi.archivoUrl)}
                              alt="Evidencia"
                              className={styles.filePreviewImage}
                            />
                          )}
                          <a
                            className="link"
                            href={getAssetUrl(evi.archivoUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver archivo
                          </a>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className={styles.dataCell} data-label="Comentarios">
                      <div>{evi.comentarios || "-"}</div>
                      <div className={styles.cellSubtext}>Tipo: {evi.tipoEvidencia}</div>
                    </td>

                    <td className={styles.dataCell} data-label="Ubicación">
                      {getMapsUrl(evi.latitud, evi.longitud) ? (
                        <a
                          className="link"
                          href={getMapsUrl(evi.latitud, evi.longitud)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver mapa
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className={styles.dataCell} data-label="Revision">
                      <div>{evi.calificacionEficiencia || "-"}</div>
                      <div className={styles.cellSubtext}>{evi.observacionesRevision || "-"}</div>
                      <div className={styles.cellSubtext}>
                        {evi.aprobadoPor?.nombre ? `Reviso ${evi.aprobadoPor.nombre}` : ""}
                      </div>
                      <div className={styles.cellSubtext}>{formatDateTime(evi.revisadoEn)}</div>
                    </td>

                    {hasPermission(user, PERMISSIONS.EVIDENCES_REVIEW) && (
                      <td className={styles.dataCell} data-label="Acciones">
                        <div className={styles.actionsCell}>
                          <select
                            className="input"
                            value={reviewDrafts[evi.id]?.calificacion || ""}
                            onChange={(event) =>
                              updateReviewDraft(evi.id, { calificacion: event.target.value })
                            }
                          >
                            <option value="">Calificación</option>
                            {calificacionOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>

                          <textarea
                            className="input"
                            rows={2}
                            placeholder="Observaciones"
                            value={reviewDrafts[evi.id]?.observaciones || ""}
                            onChange={(event) =>
                              updateReviewDraft(evi.id, { observaciones: event.target.value })
                            }
                          />

                          <div className={styles.actionsButtons}>
                            <button className="button-primary" onClick={() => handleReview(evi.id, true)}>
                              Aprobar
                            </button>
                            <button className="button-secondary" onClick={() => handleReview(evi.id, false)}>
                              Rechazar
                            </button>
                          </div>
                        </div>
                      </td>
                    )}

                    {mode === "user" && (
                      <td className={styles.dataCell} data-label="Gestión">
                        {evi.estatus === "Pendiente" ? (
                          <button className="button-secondary" onClick={() => handleRemoveOwn(evi.id)}>
                            Quitar
                          </button>
                        ) : (
                          <span className={styles.lockedLabel}>Bloqueado</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.paginationRow}>
        <button
          className="button-secondary"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Anterior
        </button>
        <span>Página {page} de {totalPages}</span>
        <button
          className="button-secondary"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default EvidenceTable;
