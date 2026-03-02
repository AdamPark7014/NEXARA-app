"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

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
  createdBy?: { id?: number; nombre?: string | null; email?: string | null } | null;
  recruiterReviewedBy?: { id?: number; nombre?: string | null; email?: string | null } | null;
  adminReviewedBy?: { id?: number; nombre?: string | null; email?: string | null } | null;
  superadminReviewedBy?: { id?: number; nombre?: string | null; email?: string | null } | null;
};

type Summary = {
  totals: {
    all: number;
    recruiterApproved: number;
    adminApproved: number;
    superadminApproved: number;
    rejected: number;
  };
  byStage: Record<string, number>;
  byCategory: Record<string, number>;
};

const STAGE_LABELS: Record<CvRow["stage"], string> = {
  INBOX: "Inbox",
  RECRUITER_SHORTLIST: "Preselección RRHH",
  RECRUITER_REJECTED: "Descartados RRHH",
  ADMIN_SHORTLIST: "Preselección Admin",
  ADMIN_REJECTED: "Descartados Admin",
  SUPERADMIN_SHORTLIST: "En revisión Dirección",
  SUPERADMIN_REJECTED: "Descartados Dirección",
  APPROVED: "Aprobados finales",
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

const EMPLOYMENT_LABELS: Record<CvRow["employmentStatus"], string> = {
  NEW_CANDIDATE: "Candidato nuevo",
  CURRENT_EMPLOYEE: "Ya trabaja con nosotros",
  FORMER_EMPLOYEE: "Trabajó con nosotros",
};

const DEFAULT_CATEGORIES = [
  "Finanzas",
  "RRHH",
  "Arquitectura",
  "Ingeniería en Sistemas",
  "Instalación CCTV",
  "Administrativos",
  "Operaciones",
  "Soporte Técnico",
];

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
const toApi = (path: string) => `${apiBase}/${path.replace(/^\/+/, "")}`;

export default function CvsManagementPanel() {
  const { user } = useUser();
  const router = useRouter();
  const fileInputId = "cv-upload-file";

  const [rows, setRows] = useState<CvRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stage, setStage] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState<"ALL" | "POTENTIAL" | "REJECTED">("ALL");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [focusStage, setFocusStage] = useState<"ALL" | CvRow["stage"]>("ALL");
  const [isCompact, setIsCompact] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);

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
  const [uploadDropActive, setUploadDropActive] = useState(false);

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [dragged, setDragged] = useState<{ id: number; fromStage: CvRow["stage"] } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CvRow["stage"] | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<number | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    src: string;
    title: string;
    fileName: string;
    kind: "pdf" | "image";
  } | null>(null);

  const canRecruiter = Boolean(user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.CVS_MANAGE)));
  const canAdmin = Boolean(user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.CVS_ADMIN_REVIEW) || hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)));
  const canSuperadmin = Boolean(user?.isSuperAdmin || (user && hasPermission(user, PERMISSIONS.CVS_SUPERADMIN_REVIEW)));
  const canUsersManage = Boolean(user && hasPermission(user, PERMISSIONS.USERS_MANAGE));

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${user?.token || ""}` }),
    [user?.token],
  );

  useEffect(() => {
    return () => {
      if (preview?.src) {
        URL.revokeObjectURL(preview.src);
      }
    };
  }, [preview]);

  const categoryOptions = useMemo(() => {
    const observed = Array.from(new Set(rows.map((row) => row.category).filter(Boolean)));
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...observed]));
    return merged.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const loadAll = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError("");
    try {
      const [rowsRes, summaryRes] = await Promise.all([
        fetch(toApi("cvs"), { headers }),
        fetch(toApi("cvs/summary/stats"), { headers }),
      ]);

      if (!rowsRes.ok) throw new Error("No se pudo cargar la base de CVs");
      const rowData = await rowsRes.json();
      setRows(Array.isArray(rowData) ? rowData : []);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData || null);
      } else {
        setSummary(null);
      }
    } catch (err: any) {
      setError(err?.message || "Error cargando CVs");
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user?.token]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 920px)");
    const update = () => setIsCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term) {
        const bag = [row.fullName, row.email || "", row.whatsapp || "", row.category, row.tags?.join(" ") || ""].join(" ").toLowerCase();
        if (!bag.includes(term)) return false;
      }

      if (category && row.category !== category) return false;
      if (stage && row.stage !== stage) return false;
      if (employmentStatus && row.employmentStatus !== employmentStatus) return false;

      if (onlyMine) {
        const mine = [row.createdBy?.id, row.recruiterReviewedBy?.id, row.adminReviewedBy?.id, row.superadminReviewedBy?.id].some(
          (id) => id && id === user?.id,
        );
        if (!mine) return false;
      }

      if (decisionFilter === "POTENTIAL") {
        const isPotential = row.recruiterDecision === "APPROVED" || row.adminDecision === "APPROVED" || row.stage === "APPROVED";
        if (!isPotential) return false;
      }
      if (decisionFilter === "REJECTED" && !row.stage.includes("REJECTED")) return false;

      return true;
    });
  }, [rows, search, category, stage, employmentStatus, onlyMine, decisionFilter, user?.id]);

  const grouped = useMemo(() => {
    const map = new Map<CvRow["stage"], CvRow[]>();
    STAGE_ORDER.forEach((value) => map.set(value, []));
    filteredRows.forEach((row) => {
      if (!map.has(row.stage)) map.set(row.stage, []);
      map.get(row.stage)?.push(row);
    });
    map.forEach((items, key) => {
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      map.set(key, items);
    });
    return map;
  }, [filteredRows]);

  const stageCounters = useMemo(() => {
    return STAGE_ORDER.reduce<Record<CvRow["stage"], number>>((acc, stageKey) => {
      acc[stageKey] = grouped.get(stageKey)?.length || 0;
      return acc;
    }, {} as Record<CvRow["stage"], number>);
  }, [grouped]);

  const visibleStageOrder = useMemo(() => {
    if (focusStage === "ALL") return STAGE_ORDER;
    return STAGE_ORDER.filter((stageKey) => stageKey === focusStage);
  }, [focusStage]);

  const orderedListRows = useMemo(() => {
    const list: CvRow[] = [];
    visibleStageOrder.forEach((stageKey) => {
      list.push(...(grouped.get(stageKey) || []));
    });
    return list;
  }, [grouped, visibleStageOrder]);

  const callReview = async (
    row: CvRow,
    lane: "recruiter" | "admin" | "superadmin",
    decision: "APPROVED" | "REJECTED" | "PENDING",
  ) => {
    setBusy(true);
    setError("");
    try {
      const noteKey = `${lane}:${row.id}`;
      const notes = (reviewNotes[noteKey] || "").trim();
      const endpoint = lane === "recruiter" ? "recruiter-review" : lane === "admin" ? "admin-review" : "superadmin-review";
      const payload: Record<string, any> = { decision, notes };

      if (lane === "recruiter") {
        payload.category = row.category;
        payload.tags = row.tags || [];
        payload.employmentStatus = row.employmentStatus;
      }

      const response = await fetch(toApi(`cvs/${row.id}/${endpoint}`), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo actualizar la revisión");
      }

      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la revisión");
    } finally {
      setBusy(false);
    }
  };

  const moveCard = async (cvId: number, targetStage: CvRow["stage"], reorderIds?: number[]) => {
    setBusy(true);
    setError("");
    try {
      const moveRes = await fetch(toApi(`cvs/${cvId}/move`), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!moveRes.ok) {
        const text = await moveRes.text();
        throw new Error(text || "No se pudo mover el CV");
      }

      if (reorderIds?.length) {
        const reorderRes = await fetch(toApi("cvs/reorder/stage"), {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ stage: targetStage, orderedIds: reorderIds }),
        });
        if (!reorderRes.ok) {
          const text = await reorderRes.text();
          throw new Error(text || "No se pudo reordenar la columna");
        }
      }

      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo mover el CV");
    } finally {
      setBusy(false);
      setDragged(null);
    }
  };

  const reorderInsideStage = async (stageValue: CvRow["stage"], sourceId: number, targetId: number) => {
    const sourceList = [...(grouped.get(stageValue) || [])];
    const sourceIndex = sourceList.findIndex((item) => item.id === sourceId);
    const targetIndex = sourceList.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const [moved] = sourceList.splice(sourceIndex, 1);
    sourceList.splice(targetIndex, 0, moved);

    const orderedIds = sourceList.map((item) => item.id);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(toApi("cvs/reorder/stage"), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ stage: stageValue, orderedIds }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo reordenar la etapa");
      }
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo reordenar la etapa");
    } finally {
      setBusy(false);
      setDragged(null);
    }
  };

  const onUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadFile) return setError("Debes seleccionar un archivo PDF o imagen");
    if (!upload.fullName.trim() || !upload.category.trim()) {
      return setError("Nombre y categoría son requeridos");
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
        const text = await response.text();
        throw new Error(text || "No se pudo subir el CV");
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
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "No se pudo subir el CV");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadCandidateFile = (file?: File | null) => {
    if (!file) {
      setUploadFile(null);
      return;
    }

    const lowerName = String(file.name || "").toLowerCase();
    const isPdf = file.type.includes("pdf") || lowerName.endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(lowerName);
    if (!isPdf && !isImage) {
      setError("Solo se permiten archivos PDF o imagen");
      return;
    }

    setError("");
    setUploadFile(file);
  };

  const previewSelectedUpload = () => {
    if (!uploadFile) return;
    const kind = getFileKind(uploadFile.name, uploadFile.type);
    const src = URL.createObjectURL(uploadFile);
    setPreview((current) => {
      if (current?.src) {
        URL.revokeObjectURL(current.src);
      }
      return {
        src,
        title: "Archivo por subir",
        fileName: uploadFile.name,
        kind,
      };
    });
  };

  const closePreview = () => {
    setPreview((current) => {
      if (current?.src) {
        URL.revokeObjectURL(current.src);
      }
      return null;
    });
  };

  const openPreview = async (row: CvRow) => {
    setError("");
    setPreviewLoadingId(row.id);
    try {
      const response = await fetch(toApi(`cvs/${row.id}/download`), { headers });
      if (!response.ok) {
        throw new Error("No se pudo cargar el archivo para preview");
      }

      const originalBlob = await response.blob();
      const fileName = String(row.cvFileUrl || `cv-${row.id}`).split("/").pop() || `cv-${row.id}`;
      const cleanFileName = fileName.split("?")[0].toLowerCase();
      const isImage = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(cleanFileName);

      const blob = isImage
        ? new Blob([await originalBlob.arrayBuffer()], { type: getImageMime(cleanFileName) })
        : originalBlob;
      const src = URL.createObjectURL(blob);

      setPreview((current) => {
        if (current?.src) {
          URL.revokeObjectURL(current.src);
        }
        return {
          src,
          title: row.fullName,
          fileName,
          kind: isImage ? "image" : "pdf",
        };
      });
    } catch (err: any) {
      setError(err?.message || "No se pudo abrir el preview");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const downloadCv = async (id: number) => {
    const response = await fetch(toApi(`cvs/${id}/download`), { headers });
    if (!response.ok) {
      setError("No se pudo descargar el CV");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cv-${id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openWhatsapp = (phone?: string | null) => {
    if (!phone) return;
    const digits = String(phone).replace(/[^\d]/g, "");
    if (!digits) return;
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  const openEmail = (email?: string | null) => {
    if (!email) return;
    window.open(`mailto:${email}`, "_self");
  };

  const goCreateUser = async (id: number) => {
    try {
      const response = await fetch(toApi(`cvs/${id}/user-prefill`), { headers });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No autorizado para crear usuario");
      }
      const payload = await response.json();
      const params = new URLSearchParams({
        prefillName: payload.fullName || "",
        prefillEmail: payload.suggestedEmail || "",
        prefillRoleName: `Gestión ${payload.category || "Operativo"}`,
      });
      router.push(`/users?${params.toString()}`);
    } catch (err: any) {
      setError(err?.message || "No autorizado para crear usuario");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...cardStyle, gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <h2 style={{ fontSize: "2rem", color: "var(--primary)", margin: 0 }}>Ecosistema corporativo de CVs</h2>
            <span style={{ fontSize: 13, opacity: 0.82 }}>
              Flujo completo de reclutamiento, revisión por etapas y conversión directa a usuario.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={viewMode === "board" ? buttonPrimary : buttonGhost} onClick={() => setViewMode("board")}>Tablero</button>
            <button type="button" style={viewMode === "list" ? buttonPrimary : buttonGhost} onClick={() => setViewMode("list")}>Lista</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={focusStage === "ALL" ? buttonPrimary : buttonGhost}
            onClick={() => setFocusStage("ALL")}
          >
            Todas ({filteredRows.length})
          </button>
          {STAGE_ORDER.map((stageKey) => (
            <button
              key={`stage-filter-${stageKey}`}
              type="button"
              style={focusStage === stageKey ? buttonPrimary : buttonGhost}
              onClick={() => setFocusStage(stageKey)}
            >
              {STAGE_LABELS[stageKey]} ({stageCounters[stageKey] || 0})
            </button>
          ))}
        </div>
      </div>

      <div style={metricsGrid}>
        <Metric title="Total CVs" value={summary?.totals?.all ?? rows.length} />
        <Metric title="Aptos RRHH" value={summary?.totals?.recruiterApproved ?? rows.filter((row) => row.recruiterDecision === "APPROVED").length} />
        <Metric title="Aptos Admin" value={summary?.totals?.adminApproved ?? rows.filter((row) => row.adminDecision === "APPROVED").length} />
        <Metric title="Aprobados Final" value={summary?.totals?.superadminApproved ?? rows.filter((row) => row.superadminDecision === "APPROVED").length} />
        <Metric title="Rechazados" value={summary?.totals?.rejected ?? rows.filter((row) => row.stage.includes("REJECTED")).length} />
      </div>

      <div style={cardStyle}>
        <div style={filterGrid}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, email, whatsapp, tags" style={inputStyle} />
          <select value={category} onChange={(event) => setCategory(event.target.value)} style={inputStyle}>
            <option value="">Todas las categorías</option>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={stage} onChange={(event) => setStage(event.target.value)} style={inputStyle}>
            <option value="">Todas las etapas</option>
            {STAGE_ORDER.map((key) => (
              <option key={key} value={key}>
                {STAGE_LABELS[key]}
              </option>
            ))}
          </select>
          <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)} style={inputStyle}>
            <option value="">Todos los estados laborales</option>
            {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value as any)} style={inputStyle}>
            <option value="ALL">Todos</option>
            <option value="POTENTIAL">Potenciales</option>
            <option value="REJECTED">Descartados</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
            Solo CVs gestionados por mí
          </label>
          <button
            type="button"
            style={buttonGhost}
            onClick={() => {
              setSearch("");
              setCategory("");
              setStage("");
              setEmploymentStatus("");
              setOnlyMine(false);
              setDecisionFilter("ALL");
              setFocusStage("ALL");
            }}
          >
            Limpiar filtros
          </button>
          <button type="button" style={buttonGhost} onClick={loadAll} disabled={busy || loading}>
            Refrescar
          </button>
        </div>
      </div>

      {canRecruiter && (
        <form onSubmit={onUpload} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Alta de candidato (PDF/Imagen)</h3>
            <button type="button" style={buttonGhost} onClick={() => setUploadOpen((current) => !current)}>
              {uploadOpen ? "Contraer" : "Expandir"}
            </button>
          </div>
          {uploadOpen ? (
            <>
          <div style={filterGrid}>
            <input value={upload.fullName} onChange={(event) => setUpload((prev) => ({ ...prev, fullName: event.target.value }))} placeholder="Nombre completo" style={inputStyle} required />
            <input value={upload.email} onChange={(event) => setUpload((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" style={inputStyle} />
            <input value={upload.whatsapp} onChange={(event) => setUpload((prev) => ({ ...prev, whatsapp: event.target.value }))} placeholder="WhatsApp" style={inputStyle} />
            <input value={upload.category} onChange={(event) => setUpload((prev) => ({ ...prev, category: event.target.value }))} placeholder="Categoría" style={inputStyle} required />
            <input value={upload.tags} onChange={(event) => setUpload((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags (coma)" style={inputStyle} />
            <select value={upload.employmentStatus} onChange={(event) => setUpload((prev) => ({ ...prev, employmentStatus: event.target.value }))} style={inputStyle}>
              {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categoryOptions.map((preset) => (
              <button
                key={preset}
                type="button"
                style={{ ...chipStyle, opacity: upload.category === preset ? 1 : 0.7 }}
                onClick={() => setUpload((prev) => ({ ...prev, category: preset }))}
              >
                {preset}
              </button>
            ))}
          </div>

          <textarea
            value={upload.recruiterNotes}
            onChange={(event) => setUpload((prev) => ({ ...prev, recruiterNotes: event.target.value }))}
            placeholder="Notas iniciales de reclutamiento"
            style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
          />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              id={fileInputId}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/avif"
              onChange={(event) => handleUploadCandidateFile(event.target.files?.[0] || null)}
              required
              style={hiddenInputStyle}
            />
            <div
              style={{
                ...fileDropZoneStyle,
                ...(uploadDropActive ? fileDropZoneActiveStyle : null),
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setUploadDropActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setUploadDropActive(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setUploadDropActive(false);
                handleUploadCandidateFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <label htmlFor={fileInputId} style={filePickerStyle}>
                <span style={filePickerButtonStyle}>Seleccionar archivo</span>
                <span style={filePickerNameStyle}>{uploadFile?.name || "Ningún archivo seleccionado"}</span>
              </label>
              <span style={fileDropHintStyle}>o arrastra y suelta aquí</span>
            </div>
            {uploadFile ? (
              <button type="button" style={buttonGhost} onClick={previewSelectedUpload}>
                Ver preview
              </button>
            ) : null}
            <button type="submit" style={buttonPrimary} disabled={busy}>
              Subir CV
            </button>
          </div>
            </>
          ) : null}
        </form>
      )}

      {error ? <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div> : null}
      {loading ? <div>Cargando CVs...</div> : null}

      {viewMode === "board" ? (
      <div style={boardGrid}>
        {visibleStageOrder.map((stageKey) => {
          const cards = grouped.get(stageKey) || [];
          return (
            <section
              key={stageKey}
              style={{
                ...columnStyle,
                ...(dragOverStage === stageKey ? columnActiveStyle : null),
                ...(dragged?.fromStage === stageKey ? columnSourceStyle : null),
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragOverStage(stageKey);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOverStage((current) => (current === stageKey ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragged) return;
                const stageItems = grouped.get(stageKey) || [];
                const orderedIds = [...stageItems.map((item) => item.id), dragged.id];
                setDragOverStage(null);
                setDragOverCardId(null);
                moveCard(dragged.id, stageKey, Array.from(new Set(orderedIds)));
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{STAGE_LABELS[stageKey]}</strong>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{cards.length}</span>
              </header>

              {dragged ? <div style={dropHintStyle}>Arrastra y suelta aquí</div> : null}

              {cards.map((row) => {
                const recruiterNoteKey = `recruiter:${row.id}`;
                const adminNoteKey = `admin:${row.id}`;
                const superadminNoteKey = `superadmin:${row.id}`;

                return (
                  <article
                    key={row.id}
                    style={{
                      ...rowCardStyle,
                      ...(dragged?.id === row.id ? rowDraggingStyle : null),
                      ...(dragOverCardId === row.id ? rowDropTargetStyle : null),
                    }}
                    draggable={canRecruiter || canAdmin || canSuperadmin}
                    onDragStart={() => {
                      setDragged({ id: row.id, fromStage: row.stage });
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDragOverStage(null);
                      setDragOverCardId(null);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (dragged?.id !== row.id) {
                        setDragOverCardId(row.id);
                      }
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDragOverCardId((current) => (current === row.id ? null : current));
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!dragged) return;
                      setDragOverCardId(null);
                      setDragOverStage(null);
                      if (dragged.fromStage === stageKey) {
                        reorderInsideStage(stageKey, dragged.id, row.id);
                      } else {
                        const stageItems = grouped.get(stageKey) || [];
                        const targetIndex = stageItems.findIndex((item) => item.id === row.id);
                        const ids = stageItems.map((item) => item.id);
                        ids.splice(Math.max(targetIndex, 0), 0, dragged.id);
                        moveCard(dragged.id, stageKey, Array.from(new Set(ids)));
                      }
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{row.fullName}</strong>
                      <span style={{ fontSize: 11, opacity: 0.78 }}>{EMPLOYMENT_LABELS[row.employmentStatus]}</span>
                    </div>

                    {isCompact ? (
                      <button type="button" style={buttonGhost} onClick={() => setExpandedCardId((current) => (current === row.id ? null : row.id))}>
                        {expandedCardId === row.id ? "Contraer" : "Expandir"}
                      </button>
                    ) : null}

                    {isCompact && expandedCardId !== row.id ? (
                      <div style={{ display: "grid", gap: 4, fontSize: 12, opacity: 0.86 }}>
                        <span>{row.category}</span>
                        <span>{row.tags?.length ? row.tags.join(" · ") : "Sin tags"}</span>
                      </div>
                    ) : (
                      <>

                    <div style={{ fontSize: 12, opacity: 0.92 }}>{row.category}</div>
                    {row.tags?.length ? <div style={{ fontSize: 12, opacity: 0.78 }}>{row.tags.join(" · ")}</div> : null}

                    <div style={{ display: "grid", gap: 2, fontSize: 12 }}>
                      <span>Filtró RRHH: {row.recruiterReviewedBy?.nombre || row.createdBy?.nombre || "-"}</span>
                      <span>Filtró Admin: {row.adminReviewedBy?.nombre || "-"}</span>
                      <span>Decisión final: {row.superadminReviewedBy?.nombre || "-"}</span>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" style={buttonGhost} onClick={() => openPreview(row)} disabled={previewLoadingId === row.id}>
                        {previewLoadingId === row.id ? "Abriendo..." : "Preview archivo"}
                      </button>
                      <button type="button" style={buttonGhost} onClick={() => downloadCv(row.id)}>
                        Redescargar
                      </button>
                      <button type="button" style={buttonGhost} disabled={!row.whatsapp} onClick={() => openWhatsapp(row.whatsapp)}>
                        WhatsApp
                      </button>
                      <button type="button" style={buttonGhost} disabled={!row.email} onClick={() => openEmail(row.email)}>
                        Email
                      </button>
                    </div>

                    {canRecruiter && (
                      <>
                        <textarea
                          value={reviewNotes[recruiterNoteKey] ?? row.recruiterNotes ?? ""}
                          onChange={(event) => setReviewNotes((prev) => ({ ...prev, [recruiterNoteKey]: event.target.value }))}
                          placeholder="Notas RRHH"
                          style={{ ...inputStyle, minHeight: 52, resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" style={buttonPrimary} onClick={() => callReview(row, "recruiter", "APPROVED")}>RRHH aprueba</button>
                          <button type="button" style={buttonGhost} onClick={() => callReview(row, "recruiter", "REJECTED")}>RRHH descarta</button>
                        </div>
                      </>
                    )}

                    {canAdmin && (
                      <>
                        <textarea
                          value={reviewNotes[adminNoteKey] ?? row.adminNotes ?? ""}
                          onChange={(event) => setReviewNotes((prev) => ({ ...prev, [adminNoteKey]: event.target.value }))}
                          placeholder="Notas Admin"
                          style={{ ...inputStyle, minHeight: 52, resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" style={buttonPrimary} onClick={() => callReview(row, "admin", "APPROVED")}>Admin recomienda</button>
                          <button type="button" style={buttonGhost} onClick={() => callReview(row, "admin", "REJECTED")}>Admin descarta</button>
                        </div>
                      </>
                    )}

                    {canSuperadmin && (
                      <>
                        <textarea
                          value={reviewNotes[superadminNoteKey] ?? row.superadminNotes ?? ""}
                          onChange={(event) => setReviewNotes((prev) => ({ ...prev, [superadminNoteKey]: event.target.value }))}
                          placeholder="Notas Dirección"
                          style={{ ...inputStyle, minHeight: 52, resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" style={buttonPrimary} onClick={() => callReview(row, "superadmin", "APPROVED")}>Dirección aprueba</button>
                          <button type="button" style={buttonGhost} onClick={() => callReview(row, "superadmin", "REJECTED")}>Dirección descarta</button>
                        </div>
                      </>
                    )}

                    {(canUsersManage || canSuperadmin) && row.stage === "APPROVED" && (
                      <button type="button" style={buttonPrimary} onClick={() => goCreateUser(row.id)}>
                        Crear usuario
                      </button>
                    )}
                      </>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      ) : (
        <div style={{ ...cardStyle, gap: 8 }}>
          <div style={{ fontSize: 13, opacity: 0.82 }}>
            Mostrando {orderedListRows.length} CV(s) en vista lista.
          </div>
          {orderedListRows.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.82 }}>No hay CVs que coincidan con tus filtros actuales.</div>
          ) : (
            orderedListRows.map((row) => (
              <article key={`list-${row.id}`} style={{ ...rowCardStyle, cursor: "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{row.fullName}</strong>
                  <span style={{ fontSize: 12, opacity: 0.82 }}>{STAGE_LABELS[row.stage]}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, opacity: 0.9 }}>
                  <span>{row.category}</span>
                  <span>{EMPLOYMENT_LABELS[row.employmentStatus]}</span>
                  <span>{row.tags?.length ? row.tags.join(" · ") : "Sin tags"}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" style={buttonGhost} onClick={() => openPreview(row)} disabled={previewLoadingId === row.id}>
                    {previewLoadingId === row.id ? "Abriendo..." : "Preview"}
                  </button>
                  <button type="button" style={buttonGhost} onClick={() => downloadCv(row.id)}>Descargar</button>
                  <button type="button" style={buttonGhost} disabled={!row.whatsapp} onClick={() => openWhatsapp(row.whatsapp)}>WhatsApp</button>
                  <button type="button" style={buttonGhost} disabled={!row.email} onClick={() => openEmail(row.email)}>Email</button>
                  {(canUsersManage || canSuperadmin) && row.stage === "APPROVED" ? (
                    <button type="button" style={buttonPrimary} onClick={() => goCreateUser(row.id)}>Crear usuario</button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {preview ? (
        <div style={previewBackdropStyle} onClick={closePreview}>
          <div style={previewModalStyle} onClick={(event) => event.stopPropagation()}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 14 }}>Vista previa: {preview.title}</strong>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{preview.fileName}</span>
              </div>
              <button type="button" style={buttonGhost} onClick={closePreview}>
                Cerrar
              </button>
            </header>

            <div style={previewBodyStyle}>
              {preview.kind === "image" ? (
                <img src={preview.src} alt={`Vista previa de ${preview.title}`} style={previewImageStyle} />
              ) : (
                <iframe src={preview.src} title={`Preview ${preview.title}`} style={previewFrameStyle} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getImageMime(fileName: string) {
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".gif")) return "image/gif";
  if (fileName.endsWith(".bmp")) return "image/bmp";
  if (fileName.endsWith(".svg")) return "image/svg+xml";
  if (fileName.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

function getFileKind(fileName: string, mimeType?: string): "pdf" | "image" {
  const lowerName = String(fileName || "").toLowerCase();
  if (String(mimeType || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(lowerName)) {
    return "image";
  }
  return "pdf";
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ ...cardStyle, minHeight: 76, justifyContent: "center" }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{title}</span>
      <strong style={{ fontSize: 22, color: "var(--primary)" }}>{value}</strong>
    </div>
  );
}

const metricsGrid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  background: "var(--surface)",
  padding: 12,
  display: "grid",
  gap: 10,
};

const boardGrid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "start",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
};

const columnStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: 12,
  background: "var(--surface)",
  padding: 10,
  display: "grid",
  gap: 8,
  minHeight: 180,
};

const columnSourceStyle: React.CSSProperties = {
  opacity: 0.92,
};

const columnActiveStyle: React.CSSProperties = {
  border: "1px dashed var(--primary)",
  transform: "translateY(-1px)",
};

const rowCardStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 10,
  background: "var(--background)",
  padding: 10,
  display: "grid",
  gap: 6,
  cursor: "grab",
  transition: "transform 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
};

const rowDraggingStyle: React.CSSProperties = {
  opacity: 0.6,
  border: "1px solid var(--primary)",
};

const rowDropTargetStyle: React.CSSProperties = {
  border: "1px solid var(--primary)",
  transform: "translateY(-1px)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.4)",
  borderRadius: 8,
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: 13,
  padding: "10px 12px",
  width: "100%",
  boxSizing: "border-box",
};

const buttonPrimary: React.CSSProperties = {
  border: "1px solid transparent",
  borderRadius: 8,
  background: "var(--primary)",
  color: "white",
  fontWeight: 600,
  fontSize: 12,
  padding: "8px 10px",
  cursor: "pointer",
};

const buttonGhost: React.CSSProperties = {
  border: "1px solid rgba(59, 130, 246, 0.42)",
  borderRadius: 8,
  background: "rgba(15, 23, 42, 0.45)",
  color: "var(--foreground)",
  fontWeight: 500,
  fontSize: 12,
  padding: "8px 10px",
  cursor: "pointer",
};

const hiddenInputStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  border: 0,
};

const filePickerStyle: React.CSSProperties = {
  border: "1px solid rgba(59, 130, 246, 0.35)",
  borderRadius: 9,
  background: "rgba(15, 23, 42, 0.35)",
  minWidth: 300,
  maxWidth: 540,
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 6,
  cursor: "pointer",
};

const filePickerButtonStyle: React.CSSProperties = {
  borderRadius: 7,
  background: "var(--primary)",
  color: "white",
  fontWeight: 600,
  fontSize: 12,
  padding: "8px 12px",
  whiteSpace: "nowrap",
};

const filePickerNameStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--foreground)",
  opacity: 0.9,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const fileDropZoneStyle: React.CSSProperties = {
  border: "1px dashed rgba(59, 130, 246, 0.45)",
  borderRadius: 10,
  padding: 8,
  minWidth: 320,
  maxWidth: 560,
  width: "100%",
  display: "grid",
  gap: 6,
  background: "rgba(15, 23, 42, 0.22)",
};

const fileDropZoneActiveStyle: React.CSSProperties = {
  border: "1px solid var(--primary)",
  transform: "translateY(-1px)",
};

const fileDropHintStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.78,
  paddingLeft: 4,
};

const chipStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 999,
  background: "transparent",
  color: "var(--foreground)",
  fontWeight: 500,
  fontSize: 12,
  padding: "6px 12px",
  cursor: "pointer",
};

const dropHintStyle: React.CSSProperties = {
  border: "1px dashed rgba(148, 163, 184, 0.45)",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 11,
  opacity: 0.75,
  textAlign: "center",
};

const previewBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.72)",
  display: "grid",
  placeItems: "center",
  zIndex: 1200,
  padding: 16,
};

const previewModalStyle: React.CSSProperties = {
  width: "min(1100px, 96vw)",
  height: "min(82vh, 860px)",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  background: "var(--surface)",
  padding: 12,
  display: "grid",
  gap: 10,
};

const previewBodyStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 10,
  overflow: "hidden",
  background: "var(--background)",
  height: "100%",
};

const previewFrameStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
};

const previewImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};
