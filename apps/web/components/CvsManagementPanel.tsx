"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
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

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
const toApi = (path: string) => `${apiBase}/${path.replace(/^\/+/, "")}`;

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
    window.open(toApi(`cvs/${id}/preview`), "_blank", "noopener,noreferrer");
  };

  const downloadCv = async (id: number) => {
    const response = await fetch(toApi(`cvs/${id}/download`), { headers });
    if (!response.ok) {
      setError("No se pudo descargar el CV");
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `cv-${id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  const openWhatsapp = (phone?: string | null) => {
    if (!phone) return;
    const normalized = phone.replace(/[^\d]/g, "");
    if (!normalized) return;
    window.open(`https://wa.me/${normalized}`, "_blank", "noopener,noreferrer");
  };

  const openEmail = (email?: string | null) => {
    if (!email) return;
    window.open(`mailto:${email}`, "_self");
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
          <input className="input" type="file" accept="application/pdf" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} required />
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
