"use client";

import { toast } from "@/components/Toast";
import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "./UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { buildApiUrl as buildApiUrlFromBase, getApiAssetOrigin, getSocketBaseUrl } from "@/lib/api-base";
import { triggerBlobDownload, triggerFileDownload } from "@/lib/file-download";
import { openExternalUrl } from "@/lib/open-external-url";
import ExcelDownloadModal from "./ExcelDownloadModal";
import PDFViewer from "./PDFViewer";
import styles from "./EvidenceTable.module.css";

interface Evidence {
  id: number;
  userId?: number;
  tipoEvidencia: string;
  archivoUrl: string;
  archivos?: Array<{ label: string; type: 'image' | 'pdf'; url: string }>;
  aprobada: boolean;
  estatus?: string;
  comentarios?: string | null;
  observacionesRevision?: string | null;
  calificacionEficiencia?: string | null;
  fechaEvidencia?: string | null;
  revisadoEn?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  entryPhotoUrl?: string | null;
  entryPhotoUploadedAt?: string | null;
  entryLatitude?: number | null;
  entryLongitude?: number | null;
  evidencePhotos?: string[];
  evidencePhotosUploadedAt?: string | null;
  serviceSheetPdfUrl?: string | null;
  serviceSheetUploadedAt?: string | null;
  serviceSheetData?: unknown;
  serviceSheetCompletedAt?: string | null;
  exitPhotoUrl?: string | null;
  exitPhotoUploadedAt?: string | null;
  exitLatitude?: number | null;
  exitLongitude?: number | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  actividad: {
    id?: number;
    anNumber: string;
    titulo?: string;
    indicaciones?: string | null;
    branchName?: string | null;
    branchCity?: string | null;
    branchState?: string | null;
    branchAddress?: string | null;
    creador?: { nombre: string } | null;
    responsable?: { nombre: string } | null;
  };
  user?: { nombre: string } | null;
  aprobadoPor?: { nombre: string } | null;
}

const buildApiUrl = (path: string) => buildApiUrlFromBase(path);

const inferFileType = (value: string): 'image' | 'pdf' => {
  const lower = value.toLowerCase();
  if (lower.endsWith('.pdf') || lower.includes('/pdf') || lower.includes('application/pdf')) {
    return 'pdf';
  }
  return 'image';
};

const getAssetUrl = (url?: string | null) => {
  if (!url) return "";
  const raw = url.trim();
  if (!raw) return "";
  if (/^(data:|blob:|\/\/)/i.test(raw)) return raw;

  const base = getApiAssetOrigin();
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/uploads/')) {
        return `${base}${encodeURI(parsed.pathname)}${parsed.search}`;
      }
      if (!/^\/(activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(parsed.pathname)) {
        return raw;
      }
    } catch {
      // Keep original URL when parsing fails.
      return raw;
    }
  }

  const normalizedPath = raw
    .replace(/\\+/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api(?=\/uploads\/)/i, "")
    .replace(/^\/?uploads\//i, "")
    .replace(/^\/+/, "");

  const normalized = `/uploads/${normalizedPath}`.replace(/\/uploads\/+/i, "/uploads/");
  return `${base}${encodeURI(normalized)}`;
};

const normalizeText = (value?: string | null) => (value || "").toLowerCase().trim();

const smartTokenMatch = (needle: string, chunks: Array<string | null | undefined>) => {
  const tokens = normalizeText(needle).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = chunks.map((chunk) => normalizeText(chunk)).filter(Boolean).join(" ");
  return tokens.every((token) => haystack.includes(token));
};

const buildEvidenceFiles = (evi: Evidence): GalleryFile[] => {
  const normalizedFiles: GalleryFile[] = [];
  const seen = new Set<string>();

  const pushFile = (candidateUrl?: string | null, label?: string, explicitType?: 'image' | 'pdf') => {
    const url = (candidateUrl || '').trim();
    if (!url) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalizedFiles.push({
      label: (label || 'Archivo').trim() || 'Archivo',
      type: explicitType || inferFileType(url),
      url,
    });
  };

  const absorb = (value: unknown) => {
    if (!value) return;

    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return;

      if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
        try {
          absorb(JSON.parse(text));
          return;
        } catch {
          // Fall through as plain string.
        }
      }

      if (text.includes('|')) {
        text
          .split('|')
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part, index) => pushFile(part, `Archivo ${index + 1}`));
        return;
      }

      pushFile(text, 'Archivo');
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(absorb);
      return;
    }

    if (typeof value === 'object') {
      const item = value as Record<string, unknown>;
      const maybeUrl =
        (typeof item.url === 'string' && item.url) ||
        (typeof item.archivoUrl === 'string' && item.archivoUrl) ||
        (typeof item.path === 'string' && item.path) ||
        '';
      const maybeLabel = typeof item.label === 'string' ? item.label : 'Archivo';
      const maybeType = item.type === 'pdf' || item.type === 'image' ? item.type : undefined;
      if (maybeUrl) {
        pushFile(maybeUrl, maybeLabel, maybeType);
      }
    }
  };

  absorb((evi as unknown as Record<string, unknown>).archivos);
  absorb(evi.archivoUrl);

  return normalizedFiles;
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

const hasCoordinates = (lat?: number | null, lng?: number | null) => lat != null && lng != null;

const formatCoordinates = (lat?: number | null, lng?: number | null) => {
  if (!hasCoordinates(lat, lng)) return '-';
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
};

const humanizeKey = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

type DetailField = { label: string; value: string; imageUrl?: string | null };

const flattenDetailFields = (value: unknown, prefix = ''): DetailField[] => {
  if (value == null) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (/^data:image\//i.test(trimmed)) {
      return [{ label: prefix || 'Imagen', value: 'Imagen capturada', imageUrl: trimmed }];
    }
    return [{ label: prefix || 'Valor', value: trimmed }];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [{ label: prefix || 'Valor', value: String(value) }];
  }

  if (Array.isArray(value)) {
    if (!value.length) return [];
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      return [{ label: prefix || 'Valores', value: value.join(', ') }];
    }
    return value.flatMap((item, index) =>
      flattenDetailFields(item, prefix ? `${prefix} ${index + 1}` : `Elemento ${index + 1}`),
    );
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      flattenDetailFields(nested, prefix ? `${prefix} / ${humanizeKey(key)}` : humanizeKey(key)),
    );
  }

  return [];
};

// ── Inline media gallery with lightbox ──────────────────────────────────────
type GalleryFile = { label: string; type: 'image' | 'pdf'; url: string };
const MediaGallery: React.FC<{ archivos: GalleryFile[]; getUrl: (u: string) => string }> = ({ archivos, getUrl }) => {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const PREVIEW = 4;
  if (!archivos.length) return <span style={{ color: 'var(--text-secondary)' }}>-</span>;
  const extra = archivos.length - PREVIEW;
  const handlePrev = () => setIdx(i => (i - 1 + archivos.length) % archivos.length);
  const handleNext = () => setIdx(i => (i + 1) % archivos.length);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') setOpen(false);
  };
  return (
    <>
      <div className={styles.galleryStrip}>
        {archivos.slice(0, PREVIEW).map((f, i) => {
          const resolvedUrl = getUrl(f.url);
          return (
            <button
              key={i}
              type="button"
              className={styles.galleryThumb}
              onClick={() => { setIdx(i); setOpen(true); }}
              title={f.label}
              aria-label={`Ver ${f.label}`}
            >
              {f.type === 'pdf' ? (
                <div className={styles.thumbPdf}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                  <span>PDF</span>
                </div>
              ) : imgErrors[i] ? (
                <div className={styles.thumbError}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
              ) : (
                <img
                  src={resolvedUrl}
                  alt={f.label}
                  className={styles.thumbImg}
                  onError={() => setImgErrors(e => ({ ...e, [i]: true }))}
                />
              )}
              <div className={styles.thumbLabel}>{f.label}</div>
              {i === PREVIEW - 1 && extra > 0 && (
                <div className={styles.thumbExtra}>+{extra}</div>
              )}
            </button>
          );
        })}
      </div>
      {open && (
        <div
          className={styles.lightboxOverlay}
          onClick={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.lightboxBox} onClick={e => e.stopPropagation()}>
            <div className={styles.lightboxHeader}>
              <span className={styles.lightboxLabel}>{archivos[idx].label}</span>
              <span className={styles.lightboxCounter}>{idx + 1} / {archivos.length}</span>
              <a
                href={getUrl(archivos[idx].url)}
                className={styles.lightboxOpen}
                onClick={e => {
                  e.stopPropagation();
                  void openExternalUrl(getUrl(archivos[idx].url));
                }}
                title="Abrir en nueva pestaña"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
              <button className={styles.lightboxClose} onClick={() => setOpen(false)} aria-label="Cerrar">&#10005;</button>
            </div>
            <div className={styles.lightboxMedia}>
              {archivos[idx].type === 'pdf' ? (
                <iframe src={getUrl(archivos[idx].url)} className={styles.lightboxPdf} title={archivos[idx].label} />
              ) : imgErrors[idx] ? (
                <div className={styles.lightboxFallback}>
                  <span>Vista previa no disponible</span>
                  <button type="button" className="button-secondary" onClick={() => void openExternalUrl(getUrl(archivos[idx].url))}>
                    Abrir archivo
                  </button>
                </div>
              ) : (
                <img
                  src={getUrl(archivos[idx].url)}
                  alt={archivos[idx].label}
                  className={styles.lightboxImg}
                  title={archivos[idx].label}
                  onError={() => setImgErrors(e => ({ ...e, [idx]: true }))}
                />
              )}
            </div>
            {archivos.length > 1 && (
              <>
                <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`} onClick={e => { e.stopPropagation(); handlePrev(); }} aria-label="Anterior">&#8249;</button>
                <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNavNext}`} onClick={e => { e.stopPropagation(); handleNext(); }} aria-label="Siguiente">&#8250;</button>
              </>
            )}
            {archivos.length > 1 && (
              <div className={styles.lightboxDots}>
                {archivos.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`${styles.dot} ${i === idx ? styles.dotActive : ''}`}
                    onClick={e => { e.stopPropagation(); setIdx(i); }}
                    title={f.label}
                    aria-label={f.label}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const EvidenceTable: React.FC<{ mode?: "admin" | "user"; title?: string | null }> = ({
  mode = "admin",
  title = "Evidencias",
}) => {
  const isUserView = mode === "user" || /mis evidencias/i.test(title || "");
  const { user } = useUser();
  const canReview = mode === "admin" && hasPermission(user, PERMISSIONS.EVIDENCES_REVIEW);
  const canExport = mode === "admin" && hasPermission(user, PERMISSIONS.EVIDENCES_EXPORT);

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
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [showBulkPdfModal, setShowBulkPdfModal] = useState(false);
  const [bulkFromDate, setBulkFromDate] = useState("");
  const [bulkToDate, setBulkToDate] = useState("");
  const [bulkReportLoading, setBulkReportLoading] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfData, setPreviewPdfData] = useState<Uint8Array | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState("reporte-ticket.pdf");
  const [detailEvidence, setDetailEvidence] = useState<Evidence | null>(null);

  const estatusList = ["Pendiente", "Aprobada", "Rechazada"];
  const calificacionOptions = ["Alta", "Media", "Baja"];
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<number, { calificacion: string; observaciones: string }>
  >({});

  const detailFormFields = useMemo(
    () => flattenDetailFields(detailEvidence?.serviceSheetData),
    [detailEvidence],
  );

  const fetchEvidences = () => {
    if (!user?.token) return;
    setLoading(true);
    const endpoint = isUserView ? "activity-evidence/history" : "activity-evidence/review-history";
    fetch(buildApiUrl(endpoint), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("No autorizado");
        return res.json();
      })
      .then((data) => {
        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : [];
        setEvidences(rows);
      })
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
      const model = payload?.model?.toLowerCase();
      if (model === "evidence" || model === "activityevidence") {
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
      if (previewPdfUrl) window.URL.revokeObjectURL(previewPdfUrl);
    };
  }, [excelUrl, previewPdfUrl]);

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
      toast.error("Error al exportar");
    } finally {
      setExcelPreparing(false);
    }
  };

  const handleDownloadExcel = () => {
    const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (excelBlob?.size) {
      void triggerBlobDownload(excelBlob, "evidencias.xlsx", { mimeType: xlsxMime });
      closeExcelModal();
      return;
    }
    if (!excelUrl) return;
    void triggerFileDownload(excelUrl, "evidencias.xlsx", { preferOpenOnMobile: true, mimeType: xlsxMime });
    closeExcelModal();
  };

  const buildReportFileName = (evi: Evidence, index?: number) => {
    const an = (evi.actividad?.anNumber || `ticket-${evi.id}`).trim();
    const safeAn = an.replace(/[^a-z0-9-_.]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const suffix = typeof index === "number" ? `-${String(index + 1).padStart(2, "0")}` : "";
    return `reporte-${safeAn || `ticket-${evi.id}`}${suffix}.pdf`;
  };

  const fetchTicketReportBlob = async (activityId: number) => {
    if (!user?.token) throw new Error("Sesión no válida");
    const endpoint = isUserView ? `activity-evidence/${activityId}/report` : `activities/${activityId}/report`;
    const response = await fetch(buildApiUrl(endpoint), {
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    });
    if (!response.ok) {
      throw new Error("No se pudo generar el PDF");
    }
    return response.blob();
  };

  const downloadPdfBlob = (blob: Blob, fileName: string) => {
    void triggerBlobDownload(blob, fileName, { mimeType: "application/pdf" });
  };

  const handlePreviewTicketPdf = async (evi: Evidence) => {
    const activityId = evi.actividad?.id;
    if (!activityId) {
      toast.error("No se encontró la actividad asociada para generar el PDF.");
      return;
    }
    setPdfLoadingId(evi.id);
    try {
      const blob = await fetchTicketReportBlob(activityId);
      const arrayBuffer = await blob.arrayBuffer();
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
      }
      const url = window.URL.createObjectURL(blob);
      setPreviewPdfUrl(url);
      setPreviewPdfData(new Uint8Array(arrayBuffer));
      setPreviewPdfName(buildReportFileName(evi));
      setShowPdfViewer(true);
    } catch {
      toast.error("No se pudo abrir la vista previa del PDF.");
    } finally {
      setPdfLoadingId((current) => (current === evi.id ? null : current));
    }
  };

  const closePdfViewer = () => {
    setShowPdfViewer(false);
    setPreviewPdfData(null);
    if (previewPdfUrl) {
      window.URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
  };

  const filtered = useMemo(
    () =>
      evidences.filter(
        (evi) =>
          (estatus ? evi.estatus === estatus : true) &&
          (actividad
            ? smartTokenMatch(actividad, [
                evi.actividad?.anNumber,
                evi.actividad?.titulo,
                evi.actividad?.indicaciones,
                evi.actividad?.branchName,
                evi.actividad?.branchCity,
                evi.actividad?.branchState,
                evi.actividad?.branchAddress,
              ])
            : true) &&
          (responsable
            ? (evi.user?.nombre || evi.actividad?.responsable?.nombre || "")
                .toLowerCase()
                .includes(responsable.toLowerCase())
            : true)
      ),
    [evidences, estatus, actividad, responsable]
  );

  const responsibleOptions = useMemo(() => {
    const unique = new Set<string>();
    evidences.forEach((evi) => {
      const name = (evi.user?.nombre || evi.actividad?.responsable?.nombre || "").trim();
      if (name) unique.add(name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "es"));
  }, [evidences]);

  const resolveEvidenceDate = (evi: Evidence) => {
    const raw = evi.fechaEvidencia || evi.revisadoEn || null;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const bulkCandidates = useMemo(() => {
    const start = bulkFromDate ? new Date(`${bulkFromDate}T00:00:00`) : null;
    const end = bulkToDate ? new Date(`${bulkToDate}T23:59:59.999`) : null;

    return filtered
      .filter((evi) => Boolean(evi.actividad?.id))
      .filter((evi) => {
        const date = resolveEvidenceDate(evi);
        if (!start && !end) return true;
        if (!date) return false;
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = resolveEvidenceDate(a)?.getTime() || 0;
        const bTime = resolveEvidenceDate(b)?.getTime() || 0;
        return aTime - bTime;
      });
  }, [filtered, bulkFromDate, bulkToDate]);

  const handlePreviewBulkPdfReport = async () => {
    if (bulkReportLoading) return;
    if (!bulkCandidates.length) {
      toast.error("No hay tickets con actividad válida para descargar.");
      return;
    }

    setBulkReportLoading(true);

    try {
      const params = new URLSearchParams();
      if (bulkFromDate) params.set("from", bulkFromDate);
      if (bulkToDate) params.set("to", bulkToDate);

      const query = params.toString();
      const endpoint = `activity-evidence/history/report${query ? `?${query}` : ""}`;
      const response = await fetch(buildApiUrl(endpoint), {
        headers: {
          Authorization: `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error("No se pudo generar el reporte consolidado");
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
      }
      const url = window.URL.createObjectURL(blob);
      setPreviewPdfUrl(url);
      setPreviewPdfData(new Uint8Array(arrayBuffer));
      setPreviewPdfName(`reporte-evidencias-${bulkFromDate || "inicio"}-${bulkToDate || "hoy"}.pdf`);
      setShowBulkPdfModal(false);
      setShowPdfViewer(true);
    } catch {
      toast.error("No se pudo generar el PDF consolidado.");
    } finally {
      setBulkReportLoading(false);
    }
  };

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

  const handleReview = async (evi: Evidence, approved: boolean) => {
    if (!user?.token) return;
    const isPendingReview = (evi.estatus || "").toLowerCase() === "pendiente";
    if (!isPendingReview) {
      toast.error("Esta evidencia ya fue revisada y no puede volver a cambiarse.");
      return;
    }
    const activityId = evi.actividad?.id;
    if (!activityId || !user?.id) {
      toast.error("No se encontró la actividad para revisar esta evidencia.");
      return;
    }

    const draft = reviewDrafts[evi.id] || { calificacion: "", observaciones: "" };
    const endpoint = approved
      ? `activity-evidence/${activityId}/approve`
      : `activity-evidence/${activityId}/reject`;
    const payload = approved
      ? {
          reviewerId: user.id,
          notes: draft.observaciones || undefined,
        }
      : {
          reviewerId: user.id,
          rejectedStep: "EVIDENCE_PHOTOS",
          notes: draft.observaciones || "Evidencia rechazada por administracion",
        };

    const res = await fetch(buildApiUrl(endpoint), {
      method: "POST",
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
            placeholder="Actividad, AN o sucursal"
            value={actividad}
            onChange={(e) => setActividad(e.target.value)}
          />

          {!isUserView && (
            <select
              className="input"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
            >
              <option value="">Todos los responsables</option>
              {responsibleOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}

          {canExport && (
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
          {isUserView && (
            <button
              type="button"
              className={`button-secondary ${styles.bulkDownloadButton}`}
              onClick={() => setShowBulkPdfModal(true)}
              disabled={bulkReportLoading || !filtered.length}
            >
              {bulkReportLoading ? "Generando PDF..." : "Descargar todos los tickets (PDF)"}
            </button>
          )}
          {(estatus || actividad || (!isUserView && responsable)) && (
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

      {showBulkPdfModal && (
        <div className={styles.bulkModalOverlay} onClick={() => !bulkReportLoading && setShowBulkPdfModal(false)} aria-hidden="true">
          <div className={styles.bulkModalCard} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Descargar PDFs por fecha">
            <div className={styles.bulkModalHeader}>
              <h3 className={styles.bulkModalTitle}>Descargar PDFs por fecha</h3>
              <button type="button" className="button-secondary" onClick={() => setShowBulkPdfModal(false)} disabled={bulkReportLoading}>
                Cerrar
              </button>
            </div>

            <div className={styles.bulkModalBody}>
              <div className={styles.bulkFiltersRow}>
                <label className={styles.bulkField}>
                  <span>Desde</span>
                  <input
                    type="date"
                    className="input"
                    value={bulkFromDate}
                    onChange={(event) => setBulkFromDate(event.target.value)}
                    disabled={bulkReportLoading}
                  />
                </label>
                <label className={styles.bulkField}>
                  <span>Hasta</span>
                  <input
                    type="date"
                    className="input"
                    value={bulkToDate}
                    onChange={(event) => setBulkToDate(event.target.value)}
                    disabled={bulkReportLoading}
                  />
                </label>
              </div>

              <div className={styles.bulkSummary}>
                <strong>{bulkCandidates.length}</strong> tickets listos para descarga
                {bulkReportLoading && (
                  <span> • Generando reporte...</span>
                )}
              </div>

              <div className={styles.bulkActions}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setBulkFromDate("");
                    setBulkToDate("");
                  }}
                  disabled={bulkReportLoading}
                >
                  Limpiar fechas
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={handlePreviewBulkPdfReport}
                  disabled={bulkReportLoading || !bulkCandidates.length}
                >
                  {bulkReportLoading ? "Generando..." : "Ver preview PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPdfViewer && previewPdfUrl && (
        <div className={styles.pdfModalOverlay} onClick={closePdfViewer} aria-hidden="true">
          <div
            className={styles.pdfModalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa del ticket en PDF"
          >
            <div className={styles.pdfModalHeader}>
              <h3 className={styles.pdfModalTitle}>Vista previa del ticket</h3>
              <div className={styles.pdfModalActions}>
                <button type="button" className="button-secondary" onClick={closePdfViewer}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className={styles.pdfViewerWrap}>
              <PDFViewer
                pdfUrl={previewPdfUrl}
                pdfData={previewPdfData}
                fileName={previewPdfName}
                height="620px"
                fillParent
              />
            </div>
          </div>
        </div>
      )}

      {detailEvidence && (
        <div className={styles.detailModalOverlay} onClick={() => setDetailEvidence(null)} aria-hidden="true">
          <div
            className={styles.detailModalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de evidencia"
          >
            <div className={styles.detailModalHeader}>
              <div>
                <h3 className={styles.detailModalTitle}>Detalle de evidencia #{detailEvidence.id}</h3>
                <div className={styles.detailModalSubtitle}>
                  {detailEvidence.actividad?.anNumber} · {detailEvidence.actividad?.titulo || 'Actividad'}
                </div>
              </div>
              <div className={styles.detailModalActions}>
                <button type="button" className="button-secondary" onClick={() => setDetailEvidence(null)}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className={styles.detailModalBody}>
              <section className={styles.detailSection}>
                <h4 className={styles.detailSectionTitle}>Actividad</h4>
                <div className={styles.detailGrid}>
                  <div><strong>AN:</strong> {detailEvidence.actividad?.anNumber || '-'}</div>
                  <div><strong>Responsable:</strong> {detailEvidence.user?.nombre || detailEvidence.actividad?.responsable?.nombre || '-'}</div>
                  <div><strong>Sucursal:</strong> {[detailEvidence.actividad?.branchName, detailEvidence.actividad?.branchCity, detailEvidence.actividad?.branchState].filter(Boolean).join(', ') || '-'}</div>
                  <div><strong>Dirección:</strong> {detailEvidence.actividad?.branchAddress || '-'}</div>
                  <div><strong>Estatus revisión:</strong> {detailEvidence.estatus || '-'}</div>
                  <div><strong>Fecha evidencia:</strong> {formatDateTime(detailEvidence.fechaEvidencia)}</div>
                </div>
              </section>

              <section className={styles.detailSection}>
                <h4 className={styles.detailSectionTitle}>Flujo</h4>
                <div className={styles.detailGrid}>
                  <div><strong>Llegada:</strong> {formatDateTime(detailEvidence.entryPhotoUploadedAt || detailEvidence.createdAt)}</div>
                  <div><strong>Salida:</strong> {formatDateTime(detailEvidence.exitPhotoUploadedAt || detailEvidence.completedAt)}</div>
                  <div>
                    <strong>Ubicación llegada:</strong> {formatCoordinates(detailEvidence.entryLatitude, detailEvidence.entryLongitude)}
                    {hasCoordinates(detailEvidence.entryLatitude, detailEvidence.entryLongitude) && (
                      <button
                        type="button"
                        className={styles.detailInlineLink}
                        onClick={() => void openExternalUrl(getMapsUrl(detailEvidence.entryLatitude, detailEvidence.entryLongitude))}
                      >
                        Ver mapa
                      </button>
                    )}
                  </div>
                  <div>
                    <strong>Ubicación salida:</strong> {formatCoordinates(detailEvidence.exitLatitude, detailEvidence.exitLongitude)}
                    {hasCoordinates(detailEvidence.exitLatitude, detailEvidence.exitLongitude) && (
                      <button
                        type="button"
                        className={styles.detailInlineLink}
                        onClick={() => void openExternalUrl(getMapsUrl(detailEvidence.exitLatitude, detailEvidence.exitLongitude))}
                      >
                        Ver mapa
                      </button>
                    )}
                  </div>
                  <div><strong>PDF cargado:</strong> {formatDateTime(detailEvidence.serviceSheetUploadedAt)}</div>
                  <div><strong>Formulario digital:</strong> {formatDateTime(detailEvidence.serviceSheetCompletedAt)}</div>
                </div>
              </section>

              <section className={styles.detailSection}>
                <h4 className={styles.detailSectionTitle}>Archivos</h4>
                <MediaGallery archivos={buildEvidenceFiles(detailEvidence)} getUrl={getAssetUrl} />
                {detailEvidence.serviceSheetPdfUrl && (
                  <div className={styles.detailActionsRow}>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void openExternalUrl(getAssetUrl(detailEvidence.serviceSheetPdfUrl))}
                    >
                      Abrir PDF de evidencia
                    </button>
                  </div>
                )}
              </section>

              <section className={styles.detailSection}>
                <h4 className={styles.detailSectionTitle}>Formulario digital</h4>
                {detailFormFields.length > 0 ? (
                  <div className={styles.detailFormGrid}>
                    {detailFormFields.map((field, index) => (
                      <div key={`${field.label}-${index}`} className={styles.detailFieldCard}>
                        <div className={styles.detailFieldLabel}>{field.label}</div>
                        {field.imageUrl ? (
                          <img src={field.imageUrl} alt={field.label} className={styles.detailFieldImage} />
                        ) : (
                          <div className={styles.detailFieldValue}>{field.value}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.cellSubtext}>No hay información digital capturada.</div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

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
                {canReview && <th>Acciones</th>}
              </tr>
            </thead>

            <tbody className={styles.tableBody}>
              {paginated.map((evi) => {
                const evidenceFiles = buildEvidenceFiles(evi);
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
                      <div className={styles.fileCell}>
                        <MediaGallery
                          archivos={evidenceFiles}
                          getUrl={getAssetUrl}
                        />

                        <div className={styles.fileActions}>
                          <button
                            type="button"
                            className={`button-secondary ${styles.pdfActionBtn}`}
                            onClick={() => setDetailEvidence(evi)}
                          >
                            Detalle
                          </button>
                        {isUserView && (
                            <button
                              type="button"
                              className={`button-secondary ${styles.pdfActionBtn}`}
                              onClick={() => handlePreviewTicketPdf(evi)}
                              disabled={pdfLoadingId === evi.id || bulkReportLoading || !evi.actividad?.id}
                            >
                              {pdfLoadingId === evi.id ? "Procesando..." : "PDF"}
                            </button>
                        )}
                        </div>
                      </div>
                    </td>

                    <td className={styles.dataCell} data-label="Comentarios">
                      <div>{evi.comentarios || "-"}</div>
                      <div className={styles.cellSubtext}>Tipo: {evi.tipoEvidencia}</div>
                    </td>

                    <td className={styles.dataCell} data-label="Ubicación">
                      {getMapsUrl(evi.latitud, evi.longitud) ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => void openExternalUrl(getMapsUrl(evi.latitud, evi.longitud))}
                        >
                          Ver mapa
                        </button>
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

                    {canReview && (
                      <td className={styles.dataCell} data-label="Acciones">
                        {((evi.estatus || "").toLowerCase() !== "pendiente") ? (
                          <div className={styles.cellSubtext}>
                            Revisada: {evi.estatus || "-"}
                          </div>
                        ) : (
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
                            <button className="button-primary" onClick={() => handleReview(evi, true)}>
                              Aprobar
                            </button>
                            <button className="button-secondary" onClick={() => handleReview(evi, false)}>
                              Rechazar
                            </button>
                          </div>
                        </div>
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
