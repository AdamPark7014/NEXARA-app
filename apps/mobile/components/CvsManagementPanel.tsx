"use client";

import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from 'socket.io-client';
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { triggerBlobDownload } from "@/lib/file-download";
import { openExternalUrl } from "@/lib/open-external-url";
import styles from "./CvsManagementPanel.module.css";

type CvRow = {
  id: number;
  fullName: string;
  email?: string | null;
  whatsapp?: string | null;
  category: string;
  tags: string[];
  employmentStatus: "NEW_CANDIDATE" | "CURRENT_EMPLOYEE" | "FORMER_EMPLOYEE";
  stage:
    | "INBOX"
    | "RECRUITER_SHORTLIST"
    | "RECRUITER_REJECTED"
    | "ADMIN_SHORTLIST"
    | "ADMIN_REJECTED"
    | "SUPERADMIN_SHORTLIST"
    | "SUPERADMIN_REJECTED"
    | "APPROVED";
  recruiterDecision: "PENDING" | "APPROVED" | "REJECTED";
  adminDecision: "PENDING" | "APPROVED" | "REJECTED";
  superadminDecision: "PENDING" | "APPROVED" | "REJECTED";
  recruiterNotes?: string | null;
  adminNotes?: string | null;
  superadminNotes?: string | null;
  cvFileUrl: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { nombre?: string | null; email?: string | null } | null;
  recruiterReviewedBy?: { nombre?: string | null; email?: string | null } | null;
  adminReviewedBy?: { nombre?: string | null; email?: string | null } | null;
  superadminReviewedBy?: { nombre?: string | null; email?: string | null } | null;
};

const STAGE_LABELS: Record<CvRow["stage"], string> = {
  INBOX: "Inbox",
  RECRUITER_SHORTLIST: "Preselección RRHH",
  RECRUITER_REJECTED: "Descartados RRHH",
  ADMIN_SHORTLIST: "Preselección Admin",
  ADMIN_REJECTED: "Descartados Admin",
  SUPERADMIN_SHORTLIST: "En revisión final",
  SUPERADMIN_REJECTED: "Descartados Dirección",
  APPROVED: "Aprobados",
};

const EMPLOYMENT_LABELS: Record<CvRow["employmentStatus"], string> = {
  NEW_CANDIDATE: "Candidato nuevo",
  CURRENT_EMPLOYEE: "Ya trabaja con nosotros",
  FORMER_EMPLOYEE: "Trabajó con nosotros",
};

const STAGE_ORDER: CvRow["stage"][] = [
  "INBOX",
  "RECRUITER_SHORTLIST",
  "ADMIN_SHORTLIST",
  "SUPERADMIN_SHORTLIST",
  "APPROVED",
  "RECRUITER_REJECTED",
  "ADMIN_REJECTED",
  "SUPERADMIN_REJECTED",
];

const toApi = (path: string) => buildApiUrl(path);

export default function CvsManagementPanel() {
  const { user } = useUser();
  const router = useRouter();

  const [rows, setRows] = useState<CvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stage, setStage] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const [upload, setUpload] = useState({
    fullName: "",
    email: "",
    whatsapp: "",
    category: "",
    tags: "",
    employmentStatus: "NEW_CANDIDATE",
    recruiterNotes: "",
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File | null) => {
    if (file && file.type !== "application/pdf") {
      setError("Solo se aceptan archivos PDF");
      return;
    }
    setUploadFile(file);
    setError("");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const removeFile = useCallback(() => {
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const canRecruiter = Boolean(user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.CVS_MANAGE) || hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)));
  const canAdmin = Boolean(user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.CVS_ADMIN_REVIEW) || hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)));
  const canSuperadmin = Boolean(user?.isSuperAdmin || (user && hasPermission(user, PERMISSIONS.CVS_SUPERADMIN_REVIEW)));
  const canUsersManage = Boolean(user && hasPermission(user, PERMISSIONS.USERS_MANAGE));

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${user?.token || ""}`,
    }),
    [user?.token],
  );

  const categories = useMemo(() => {
    const all = rows.map((row) => row.category).filter(Boolean);
    return Array.from(new Set(all)).sort((left, right) => left.localeCompare(right));
  }, [rows]);

  const fetchRows = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      if (stage) params.set("stage", stage);
      if (employmentStatus) params.set("employmentStatus", employmentStatus);
      if (onlyMine) params.set("onlyMine", "true");

      const response = await fetch(toApi(`cvs?${params.toString()}`), { headers });
      if (!response.ok) {
        throw new Error("No se pudo cargar la base de CVs");
      }
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Error cargando CVs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchRows();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['CvRecord', 'Cv', 'User'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, search, category, stage, employmentStatus, onlyMine]);

  const grouped = useMemo(() => {
    const map = new Map<CvRow["stage"], CvRow[]>();
    STAGE_ORDER.forEach((key) => map.set(key, []));
    rows.forEach((row) => {
      if (!map.has(row.stage)) map.set(row.stage, []);
      map.get(row.stage)?.push(row);
    });
    return map;
  }, [rows]);

  const onUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadFile) {
      setError("Debes seleccionar un PDF");
      return;
    }
    if (!upload.fullName.trim() || !upload.category.trim()) {
      setError("Nombre y categoría son requeridos");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("fullName", upload.fullName.trim());
      formData.append("email", upload.email.trim());
      formData.append("whatsapp", upload.whatsapp.trim());
      formData.append("category", upload.category.trim());
      formData.append("tags", upload.tags.trim());
      formData.append("employmentStatus", upload.employmentStatus);
      formData.append("recruiterNotes", upload.recruiterNotes.trim());
      formData.append("file", uploadFile);

      const response = await fetch(toApi("cvs"), {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(responseText || "No se pudo subir el CV");
      }

      setUpload({
        fullName: "",
        email: "",
        whatsapp: "",
        category: "",
        tags: "",
        employmentStatus: "NEW_CANDIDATE",
        recruiterNotes: "",
      });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchRows();
    } catch (err: any) {
      setError(err?.message || "No se pudo subir el CV");
    } finally {
      setBusy(false);
    }
  };

  const runReview = async (
    id: number,
    lane: "recruiter" | "admin" | "superadmin",
    decision: "APPROVED" | "REJECTED" | "PENDING",
  ) => {
    setBusy(true);
    setError("");
    try {
      const endpoint = lane === "recruiter" ? "recruiter-review" : lane === "admin" ? "admin-review" : "superadmin-review";
      const response = await fetch(toApi(`cvs/${id}/${endpoint}`), {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(responseText || "No se pudo actualizar la revisión");
      }
      await fetchRows();
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la revisión");
    } finally {
      setBusy(false);
    }
  };

  const moveToStage = async (id: number, targetStage: CvRow["stage"]) => {
    if (!canRecruiter && !canAdmin) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(toApi(`cvs/${id}/move`), {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(responseText || "No se pudo mover el CV");
      }
      await fetchRows();
    } catch (err: any) {
      setError(err?.message || "No se pudo mover el CV");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = (id: number) => {
    void openExternalUrl(toApi(`cvs/${id}/preview`));
  };

  const downloadCv = async (id: number) => {
    const response = await fetch(toApi(`cvs/${id}/download`), { headers });
    if (!response.ok) {
      setError("No se pudo descargar el CV");
      return;
    }
    const blob = await response.blob();
    void triggerBlobDownload(blob, `cv-${id}.pdf`, { mimeType: "application/pdf" });
  };

  const openWhatsapp = (phone?: string | null) => {
    if (!phone) return;
    const normalized = phone.replace(/[^\d]/g, "");
    if (!normalized) return;
    void openExternalUrl(`https://wa.me/${normalized}`);
  };

  const openEmail = (email?: string | null) => {
    if (!email) return;
    void openExternalUrl(`mailto:${email}`);
  };

  const handleCreateUser = async (id: number) => {
    try {
      const response = await fetch(toApi(`cvs/${id}/user-prefill`), { headers });
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(responseText || "No autorizado para crear usuario");
      }
      const payload = await response.json();
      const params = new URLSearchParams({
        prefillName: payload.fullName || "",
        prefillEmail: payload.suggestedEmail || "",
        prefillRoleName: `Colaborador ${payload.category || "Operativo"}`,
      });
      router.push(`/users?${params.toString()}`);
    } catch (err: any) {
      setError(err?.message || "No autorizado para crear usuario");
    }
  };

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>Gestión corporativa de CVs</h2>

      <div className={styles.panel}>
        <div className={styles.filterGrid}>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre/email/whatsapp" />
          <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select className="input" value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="">Todas las etapas</option>
            {STAGE_ORDER.map((item) => (
              <option key={item} value={item}>
                {STAGE_LABELS[item]}
              </option>
            ))}
          </select>
          <select className="input" value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)}>
            <option value="">Todos los estados laborales</option>
            {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterActions}>
          <label className={styles.mineLabel}>
            <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
            Solo CVs gestionados por mí
          </label>
          <button type="button" onClick={fetchRows} className="button-primary" disabled={loading || busy}>
            Aplicar filtros
          </button>
        </div>
      </div>

      {canRecruiter && (
        <form onSubmit={onUpload} className={styles.uploadForm}>
          <h3 className={styles.sectionTitle}>Alta de CV (PDF)</h3>
          <div className={styles.uploadGrid}>
            <input className="input" value={upload.fullName} onChange={(event) => setUpload((prev) => ({ ...prev, fullName: event.target.value }))} placeholder="Nombre completo" required />
            <input className="input" value={upload.email} onChange={(event) => setUpload((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" />
            <input className="input" value={upload.whatsapp} onChange={(event) => setUpload((prev) => ({ ...prev, whatsapp: event.target.value }))} placeholder="WhatsApp" />
            <input className="input" value={upload.category} onChange={(event) => setUpload((prev) => ({ ...prev, category: event.target.value }))} placeholder="Categoría (Finanzas, RRHH...)" required />
            <input className="input" value={upload.tags} onChange={(event) => setUpload((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags separados por coma" />
            <select className="input" value={upload.employmentStatus} onChange={(event) => setUpload((prev) => ({ ...prev, employmentStatus: event.target.value }))}>
              {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className={`input ${styles.notesInput}`}
            value={upload.recruiterNotes}
            onChange={(event) => setUpload((prev) => ({ ...prev, recruiterNotes: event.target.value }))}
            placeholder="Notas iniciales"
          />

          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneDragOver : ""} ${uploadFile ? styles.dropZoneHasFile : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className={styles.dropZoneInput}
              onChange={(event) => handleFileSelect(event.target.files?.[0] || null)}
            />
            {uploadFile ? (
              <div className={styles.filePreview}>
                <svg className={styles.fileIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>{uploadFile.name}</span>
                  <span className={styles.fileSize}>{(uploadFile.size / 1024).toFixed(0)} KB</span>
                </div>
                <button
                  type="button"
                  className={styles.fileRemove}
                  onClick={(e) => { e.stopPropagation(); removeFile(); }}
                  title="Quitar archivo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className={styles.dropZonePlaceholder}>
                <svg className={styles.dropZoneIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className={styles.dropZoneText}>Arrastra tu PDF aquí o haz clic para seleccionar</span>
                <span className={styles.dropZoneHint}>Solo archivos PDF</span>
              </div>
            )}
          </div>

          <div className={styles.uploadFooter}>
            <button type="submit" disabled={busy} className="button-primary">
              Subir CV
            </button>
          </div>
        </form>
      )}

      {error && <div className={styles.errorText}>{error}</div>}
      {loading ? <div className={styles.loadingText}>Cargando CVs...</div> : null}

      <div className={styles.boardGrid}>
        {STAGE_ORDER.map((stageKey) => {
          const cards = grouped.get(stageKey) || [];
          return (
            <section
              key={stageKey}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                const raw = event.dataTransfer.getData("text/plain");
                const id = Number(raw);
                if (Number.isFinite(id)) {
                  moveToStage(id, stageKey);
                }
              }}
              className={styles.column}
            >
              <header className={styles.columnHeader}>
                <strong className={styles.columnTitle}>{STAGE_LABELS[stageKey]}</strong>
                <span className={styles.columnCount}>{cards.length}</span>
              </header>

              {cards.length === 0 && (
                <div className={styles.emptyColumn}>Sin CVs en esta etapa</div>
              )}

              {cards.map((row) => (
                <article
                  key={row.id}
                  draggable={canRecruiter || canAdmin}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", String(row.id))}
                  className={styles.cvCard}
                >
                  <div className={styles.cardTop}>
                    <strong className={styles.cardName}>{row.fullName}</strong>
                    <span className={styles.cardStatus}>{EMPLOYMENT_LABELS[row.employmentStatus]}</span>
                  </div>
                  <div className={styles.cardCategory}>{row.category}</div>
                  {row.tags?.length ? <div className={styles.cardTags}>{row.tags.join(" · ")}</div> : null}

                  <div className={styles.reviewers}>
                    <span>RRHH: {row.recruiterReviewedBy?.nombre || "-"}</span>
                    <span>Admin: {row.adminReviewedBy?.nombre || "-"}</span>
                    <span>Dirección: {row.superadminReviewedBy?.nombre || "-"}</span>
                  </div>

                  <div className={styles.actionRow}>
                    <button type="button" onClick={() => openPreview(row.id)} className="button-secondary">
                      Preview PDF
                    </button>
                    <button type="button" onClick={() => downloadCv(row.id)} className="button-secondary">
                      Descargar
                    </button>
                    <button type="button" onClick={() => openWhatsapp(row.whatsapp)} className="button-secondary" disabled={!row.whatsapp}>
                      WhatsApp
                    </button>
                    <button type="button" onClick={() => openEmail(row.email)} className="button-secondary" disabled={!row.email}>
                      Email
                    </button>
                  </div>

                  <div className={styles.actionRow}>
                    {canRecruiter && (
                      <>
                        <button type="button" onClick={() => runReview(row.id, "recruiter", "APPROVED")} className="button-primary">
                          RRHH aprueba
                        </button>
                        <button type="button" onClick={() => runReview(row.id, "recruiter", "REJECTED")} className="button-secondary">
                          RRHH descarta
                        </button>
                      </>
                    )}

                    {canAdmin && (
                      <>
                        <button type="button" onClick={() => runReview(row.id, "admin", "APPROVED")} className="button-primary">
                          Admin recomienda
                        </button>
                        <button type="button" onClick={() => runReview(row.id, "admin", "REJECTED")} className="button-secondary">
                          Admin descarta
                        </button>
                      </>
                    )}

                    {canSuperadmin && (
                      <>
                        <button type="button" onClick={() => runReview(row.id, "superadmin", "APPROVED")} className="button-primary">
                          Dirección aprueba
                        </button>
                        <button type="button" onClick={() => runReview(row.id, "superadmin", "REJECTED")} className="button-secondary">
                          Dirección descarta
                        </button>
                      </>
                    )}

                    {(canUsersManage || canSuperadmin) && row.stage === "APPROVED" && (
                      <button type="button" onClick={() => handleCreateUser(row.id)} className="button-primary">
                        Crear usuario
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
