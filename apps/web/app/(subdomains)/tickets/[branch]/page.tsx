"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter } from "next/navigation";
import PanelLogin from "@/components/PanelLogin";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import TicketsInventoryManager from "@/components/TicketsInventoryManager";
import { getApiAssetOrigin } from "@/lib/api-base";
import { useTheme } from "@/components/ThemeContext";
import consoleStyles from "../../console/console.module.css";
import styles from "../tickets.module.css";
import { openExternalUrl } from "@/lib/open-external-url";
import { isCapacitorNative } from "@/lib/capacitor-env";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });

type BranchSession = {
  token: string;
  branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null; logoUrl?: string | null };
};

type BranchProfile = {
  id: number;
  name: string;
  branchNumber?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeId?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  client?: { name?: string | null; logoUrl?: string | null } | null;
};

type BranchRequest = {
  id: number;
  description: string;
  urgency: string;
  status: string;
  requestType?: "ISSUE" | "PREVENTIVE_INVENTORY";
  dueAt?: string | null;
  evidenceUrls?: string[];
};

type Ticket = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  prioridad: string;
  ticketType?: string | null;
  fechaAsignacion?: string | null;
  fechaInicio?: string | null;
  fechaFinalizacion?: string | null;
  responsable?: { nombre: string } | null;
  serviceSheet?: { pdfUrl?: string | null } | null;
  evidencias?: Array<{ id: number; archivoUrl: string; tipoEvidencia: string; latitud?: number | null; longitud?: number | null; subidoEn?: string | null }>;
  activityEvidence?: {
    id: number;
    status: string;
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
  } | null;
};

export default function BranchTicketsPage() {
  const { darkMode, toggleDarkMode } = useTheme();
  const [session, setSession] = useState<BranchSession | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<BranchProfile | null>(null);
  const [requests, setRequests] = useState<BranchRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "tickets" | "request" | "inventories">("tickets");
  const [files, setFiles] = useState<{ file: File; url: string; kind: "image" | "pdf" }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfModalTitle, setPdfModalTitle] = useState("Reporte de tickets de sucursal");
  const [pdfFileName, setPdfFileName] = useState(`reporte-sucursal-${new Date().toISOString().slice(0, 10)}.pdf`);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [draft, setDraft] = useState({
    requestType: "ISSUE" as "ISSUE" | "PREVENTIVE_INVENTORY",
    description: "",
    urgency: "Media",
    dueAt: "",
    placeId: "",
    latitud: null as number | null,
    longitud: null as number | null,
    address: "",
  });
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const openRequests = requests.filter((request) => String(request.status || '').toUpperCase() !== 'CLOSED');

  const requestStats = {
    total: openRequests.length,
    pending: openRequests.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return status.includes('PEND') || status.includes('PROCES') || status.includes('ASIGN');
    }).length,
    completed: openRequests.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return status.includes('FINAL') || status.includes('CERR') || status.includes('COMPLET');
    }).length,
    evidences: openRequests.reduce((acc, item) => acc + (Array.isArray(item.evidenceUrls) ? item.evidenceUrls.length : 0), 0),
  };
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const branchSlug = Array.isArray(params?.branch) ? params.branch[0] : (params?.branch as string | undefined);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
  const getAssetUrl = (url?: string | null) => {
    if (!url) return "";
    const raw = url.trim();
    if (!raw) return "";
    if (/^(data:|blob:|\/\/)/i.test(raw)) return raw;

    const base = getApiAssetOrigin();
    let search = "";
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (!/^\/(uploads|activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(parsed.pathname)) {
          return raw;
        }
        search = parsed.search;
      } catch {
        // Keep original URL if parsing fails.
        return raw;
      }
    }

    const normalizedPath = raw
      .replace(/\\+/g, "/")
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/api(?=\/uploads\/)/i, "")
      .replace(/^\/?uploads\//i, "")
      .replace(/^\/+/, "")
      .replace(/\?.*$/, "");
    const normalized = `/uploads/${normalizedPath}`.replace(/\/uploads\/+/, "/uploads/");
    return `${base}${encodeURI(normalized)}${search}`;
  };

  const humanizeTicketKey = (value: string) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const flattenTicketFields = (value: unknown, prefix = ""): Array<{ label: string; value: string; imageUrl?: string | null }> => {
    if (value == null) return [];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (/^data:image\//i.test(trimmed)) {
        return [{ label: prefix || "Imagen", value: "Imagen capturada", imageUrl: trimmed }];
      }
      return [{ label: prefix || "Valor", value: trimmed }];
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return [{ label: prefix || "Valor", value: String(value) }];
    }
    if (Array.isArray(value)) {
      if (!value.length) return [];
      if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
        return [{ label: prefix || "Valores", value: value.join(", ") }];
      }
      return value.flatMap((item, index) => flattenTicketFields(item, prefix ? `${prefix} ${index + 1}` : `Elemento ${index + 1}`));
    }
    if (typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
        flattenTicketFields(nested, prefix ? `${prefix} / ${humanizeTicketKey(key)}` : humanizeTicketKey(key)),
      );
    }
    return [];
  };

  const getEvidenceKind = (value?: string | null): "pdf" | "image" | "file" => {
    if (!value) return "file";
    const normalized = value.trim().toLowerCase();
    if (normalized.endsWith(".pdf")) return "pdf";
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(normalized)) return "image";
    return "file";
  };

  const hasCoordinates = (latitude?: number | null, longitude?: number | null) => latitude != null && longitude != null;
  const formatCoordinates = (latitude?: number | null, longitude?: number | null) => {
    if (!hasCoordinates(latitude, longitude)) return "-";
    return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
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

  const getArrivalTime = (ticket: Ticket) => ticket.activityEvidence?.entryPhotoUploadedAt || ticket.activityEvidence?.createdAt || undefined;
  const getDepartureTime = (ticket: Ticket) => ticket.activityEvidence?.exitPhotoUploadedAt || ticket.activityEvidence?.completedAt || ticket.fechaFinalizacion || undefined;

  const buildTicketEvidenceFiles = (ticket: Ticket) => {
    const files: Array<{ label: string; url: string; kind: "image" | "pdf" | "file" }> = [];
    const pushFile = (label: string, value?: string | null) => {
      const resolved = getAssetUrl(value);
      if (!resolved) return;
      if (files.some((file) => file.url === resolved)) return;
      files.push({ label, url: resolved, kind: getEvidenceKind(resolved) });
    };

    pushFile("Foto llegada", ticket.activityEvidence?.entryPhotoUrl);
    (ticket.activityEvidence?.evidencePhotos || []).forEach((photoUrl, index) => pushFile(`Evidencia ${index + 1}`, photoUrl));
    pushFile("PDF hoja de servicio", ticket.activityEvidence?.serviceSheetPdfUrl || ticket.serviceSheet?.pdfUrl);
    pushFile("Foto salida", ticket.activityEvidence?.exitPhotoUrl);
    (ticket.evidencias || []).forEach((evidence) => pushFile(evidence.tipoEvidencia || "Archivo", evidence.archivoUrl));
    return files;
  };

  const getTicketMapCoords = (ticket: Ticket) => {
    const lat = ticket.activityEvidence?.entryLatitude ?? ticket.activityEvidence?.exitLatitude ?? null;
    const lng = ticket.activityEvidence?.entryLongitude ?? ticket.activityEvidence?.exitLongitude ?? null;
    return { lat, lng };
  };

  const getStaticMapPreviewUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return "";
    if (GOOGLE_MAPS_API_KEY) {
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=1200x420&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    }
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=1200x420&markers=${lat},${lng},red-pushpin`;
  };

  const shouldReplacePdfWithMap = (file: { label: string; kind: "image" | "pdf" | "file" }, ticket: Ticket) => {
    if (file.kind !== "pdf") return false;
    if (!/(hoja de servicio|pdf adjunto)/i.test(file.label)) return false;
    const { lat, lng } = getTicketMapCoords(ticket);
    return hasCoordinates(lat, lng);
  };

  const getMapsUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return "";
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };
  const branchAvatarUrl = profile?.logoUrl || profile?.client?.logoUrl || session?.branch?.logoUrl || "";

  useEffect(() => {
    setAvatarLoadError(false);
  }, [branchAvatarUrl]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("branchSession") : null;
    if (!saved) return;
    try {
      setSession(JSON.parse(saved));
    } catch {
      window.sessionStorage.removeItem("branchSession");
    }
  }, []);

  useEffect(() => {
    if (session?.token) {
      window.dispatchEvent(new Event("nexara-portal-session-changed"));
    }
  }, [session?.token]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
      return;
    }
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, mobileMenuOpen]);

  useEffect(() => {
    return () => {
      files.forEach((entry) => URL.revokeObjectURL(entry.url));
    };
  }, [files]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const fetchProfile = async (token: string) => {
    const res = await fetch(buildApiUrl("branch-portal/profile"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (data) {
      setProfile(data);
      setDraft((prev) => ({
        ...prev,
        address: data.address || prev.address,
        placeId: data.placeId || prev.placeId,
        latitud: data.latitud ?? prev.latitud,
        longitud: data.longitud ?? prev.longitud,
      }));
    }
  };

  const fetchRequests = async (token: string) => {
    const res = await fetch(buildApiUrl("branch-portal/requests"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setRequests(Array.isArray(data) ? data : []);
  };

  const fetchTickets = async (token: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.append("start", `${fromDate}T00:00:00.000Z`);
    if (toDate) params.append("end", `${toDate}T23:59:59.999Z`);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(buildApiUrl(`branch-portal/tickets${query}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setTickets(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (!session?.token) return;
    fetchProfile(session.token);
    fetchRequests(session.token);
    fetchTickets(session.token);
  }, [session?.token, fromDate, toDate]);

  const handleViewPdf = async () => {
    if (!session?.token) return;
    setGeneratingPdf(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append("start", `${fromDate}T00:00:00.000Z`);
      if (toDate) params.append("end", `${toDate}T23:59:59.999Z`);
      const res = await fetch(buildApiUrl(`branch-portal/report?${params.toString()}`), {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        setError("No se pudo generar el reporte PDF");
        return;
      }
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      setPdfData(new Uint8Array(arrayBuffer));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
      setPdfModalTitle("Reporte de tickets de sucursal");
      setPdfFileName(`reporte-sucursal-${new Date().toISOString().slice(0, 10)}.pdf`);
      setShowPdfModal(true);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleTicketReport = async (ticketId: number) => {
    if (!session?.token) return;
    const res = await fetch(buildApiUrl(`branch-portal/tickets/${ticketId}/report`), {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) {
      setError("No se pudo previsualizar el reporte del ticket");
      return;
    }
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const selected = tickets.find((ticket) => ticket.id === ticketId);
    const ticketLabel = selected?.anNumber || `Ticket #${ticketId}`;

    setPdfData(new Uint8Array(arrayBuffer));
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(URL.createObjectURL(blob));
    setPdfModalTitle(`Reporte individual: ${ticketLabel}`);
    setPdfFileName(`reporte-ticket-${ticketLabel.replace(/[^a-zA-Z0-9-_]+/g, "-")}.pdf`);
    setShowPdfModal(true);
  };

  useEffect(() => {
    if (!session?.branch) return;
    const expectedSlug = session.branch.branchNumber || `branch-${session.branch.id}`;
    if (branchSlug && branchSlug !== expectedSlug) {
      router.replace(`/${expectedSlug}`);
    }
  }, [branchSlug, router, session?.branch]);

  const handleBranchLogin = (data: { access_token: string; branch: BranchSession["branch"] }) => {
    const next = { token: data.access_token, branch: data.branch };
    window.sessionStorage.setItem("branchSession", JSON.stringify(next));
    window.dispatchEvent(new Event("nexara-portal-session-changed"));
    setSession(next);
    setError(null);
    const expectedSlug = data.branch.branchNumber || `branch-${data.branch.id}`;
    router.replace(`/${expectedSlug}`);
  };

  const isSupportedFile = (file: File) => file.type.startsWith("image/") || file.type === "application/pdf";

  const handleFileSelect = (selected?: File[] | null) => {
    if (!selected || selected.length === 0) return;
    const next = selected.filter(isSupportedFile).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      kind: (file.type === "application/pdf" ? "pdf" : "image") as "pdf" | "image",
    }));
    if (!next.length) return;
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleSubmit = async () => {
    if (!session?.token) return;
    if (!draft.description.trim()) {
      setError(draft.requestType === "PREVENTIVE_INVENTORY" ? "Describe el alcance del mantenimiento e inventario" : "Describe el problema para levantar el ticket");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("Sin conexión: las solicitudes con archivos requieren internet. Conéctate e inténtalo de nuevo.");
      return;
    }
    setLoading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((entry) => formData.append("files", entry.file));
    formData.append("description", draft.description);
    formData.append("requestType", draft.requestType);
    formData.append("urgency", draft.urgency);
    if (draft.dueAt) formData.append("dueAt", draft.dueAt);
    if (draft.placeId) formData.append("placeId", draft.placeId);
    if (draft.latitud) formData.append("latitud", String(draft.latitud));
    if (draft.longitud) formData.append("longitud", String(draft.longitud));

    const res = await fetch(buildApiUrl("branch-portal/requests"), {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: formData,
    });

    if (!res.ok) {
      setError("No se pudo levantar el ticket");
      setLoading(false);
      return;
    }

    files.forEach((entry) => URL.revokeObjectURL(entry.url));
    setFiles([]);
    setDraft((prev) => ({ ...prev, requestType: "ISSUE", description: "", urgency: "Media", dueAt: "" }));
    await fetchRequests(session.token);
    setLoading(false);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem("branchSession");
    window.sessionStorage.removeItem("clientSession");
    window.dispatchEvent(new Event("nexara-portal-session-changed"));
    setSession(null);
    window.location.replace("/tickets");
  };

  if (!session) {
    return (
      <PanelLogin
        mode="branch"
        redirectTo={pathname || "/"}
        onBranchLogin={handleBranchLogin}
        title="Portal de sucursal"
        subtitle="Acceso operativo para reportar solicitudes de servicio"
      />
    );
  }

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.ticketsConsole}`}>
      <aside className={consoleStyles.sidebar} data-mobile={isMobile ? "true" : "false"} data-open={mobileMenuOpen ? "true" : "false"}>
        <div className={consoleStyles.sidebarHeader}>
          <div className={consoleStyles.sidebarLogo}>
            <span className={consoleStyles.brandMark}>NEXARA</span>
            <span className={consoleStyles.brandSub}>Sucursal</span>
          </div>
          {isMobile && (
            <button
              type="button"
              className={consoleStyles.hamburgerButton}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
              aria-controls="tickets-branch-sidebar-menu"
              data-open={mobileMenuOpen ? "true" : "false"}
            >
              <span className={consoleStyles.hamburgerLine}></span>
              <span className={consoleStyles.hamburgerLine}></span>
              <span className={consoleStyles.hamburgerLine}></span>
            </button>
          )}
        </div>

        {isMobile && mobileMenuOpen && (
          <div
            className={consoleStyles.sidebarOverlay}
            onClick={() => setMobileMenuOpen(false)}
            role="presentation"
          ></div>
        )}

        {(!isMobile || mobileMenuOpen) && (
        <div
          className={consoleStyles.sidebarContent}
          id="tickets-branch-sidebar-menu"
          data-open={isMobile && mobileMenuOpen ? "true" : undefined}
        >
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            {branchAvatarUrl && !avatarLoadError ? (
              <img
                className={consoleStyles.avatarImage}
                src={getAssetUrl(branchAvatarUrl)}
                alt={profile?.name || session.branch.name}
                width={64}
                height={64}
                onError={() => setAvatarLoadError(true)}
              />
            ) : (
              <span className={consoleStyles.sidebarName}>{(profile?.name || session.branch.name).slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className={consoleStyles.sidebarName}>{profile?.name || session.branch.name}</div>
          <div className={consoleStyles.sidebarEmail}>{profile?.client?.name || session.branch.clientName || "Cliente corporativo"}</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Sucursal</span>
          </div>
        </div>
        <div className={consoleStyles.menuTitle}>Sucursal</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "profile" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("profile");
                setMobileMenuOpen(false);
              }}
            >
              🪪 Mi perfil
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "tickets" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("tickets");
                setMobileMenuOpen(false);
              }}
            >
              🎫 Mis tickets
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "request" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("request");
                setMobileMenuOpen(false);
              }}
            >
              ➕ Nueva solicitud
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "inventories" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("inventories");
                setMobileMenuOpen(false);
              }}
            >
              🧰 Inventarios
            </button>
          </li>
        </ul>

        <div className={consoleStyles.menuTitle}>Sesión</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={toggleDarkMode}
            >
              {darkMode ? "☀️ Vista clara" : "🌙 Vista oscura"}
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button type="button" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`} onClick={handleLogout}>
              ⎋ Cerrar sesión
            </button>
          </li>
        </ul>
        </div>
        )}
      </aside>
      <main className={consoleStyles.consoleMain}>
        <div className={styles.mainStack}>
          <div className={`card ${styles.panelHero}`}>
            <p className={styles.panelHeroTitle}>Portal de tickets de sucursal</p>
            <p className={styles.panelHeroMeta}>
              Sucursal: {profile?.name || session.branch.name} · Registra solicitudes y da seguimiento al inventario de mantenimiento.
            </p>
            <div className={styles.panelKpis}>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{requestStats.total}</span><span className={styles.panelKpiLabel}>Solicitudes</span></div>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{requestStats.pending}</span><span className={styles.panelKpiLabel}>En proceso</span></div>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{requestStats.completed}</span><span className={styles.panelKpiLabel}>Completadas</span></div>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{requestStats.evidences}</span><span className={styles.panelKpiLabel}>Evidencias</span></div>
            </div>
          </div>

          <div className={styles.panelTabs}>
            <button type="button" className={`${styles.panelTab} ${activeTab === "profile" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("profile")}>Mi perfil</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "tickets" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("tickets")}>Mis tickets</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "request" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("request")}>Nueva solicitud</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "inventories" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("inventories")}>Inventarios</button>
          </div>

          {activeTab === "profile" && (
            <div className={`card ${styles.cardSoft}`}>
              <p className={styles.sectionTitle}>Mi perfil de sucursal</p>
              <div className={styles.grid200}>
                <input className="input" value={profile?.name || session.branch.name} readOnly />
                <input className="input" value={profile?.branchNumber || session.branch.branchNumber || ""} readOnly />
                <input className="input" value={profile?.address || ""} readOnly placeholder="Dirección" />
                <input className="input" value={profile?.city || ""} readOnly placeholder="Ciudad" />
                <input className="input" value={profile?.state || ""} readOnly placeholder="Estado" />
                <input className="input" value={profile?.country || ""} readOnly placeholder="País" />
              </div>
            </div>
          )}

          {activeTab === "tickets" && (
            <div className={styles.sectionStack}>
              <div className={`card ${styles.cardSoft}`}>
                <div className={styles.grid200}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Desde</label>
                    <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Hasta</label>
                    <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                  </div>
                  <div className={styles.actionRow}>
                    <button className="button-primary" type="button" onClick={() => session?.token && fetchTickets(session.token)}>
                      Filtrar tickets
                    </button>
                    <button className="button-secondary" type="button" onClick={handleViewPdf} disabled={generatingPdf}>
                      {generatingPdf ? "Generando..." : "Ver PDF"}
                    </button>
                  </div>
                </div>
              </div>
              {tickets.length === 0 && <div className={styles.mutedText}>No hay tickets para el rango seleccionado.</div>}
              {tickets.map((ticket) => (
                <div key={ticket.id} className={`card ${styles.itemCard}`}>
                  <div className={styles.itemHeader}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{ticket.anNumber || `Ticket #${ticket.id}`}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{ticket.titulo}</div>
                    </div>
                    <span className="badge">{ticket.estatus}</span>
                  </div>
                  <div className={styles.metaGrid}>
                    <span>Prioridad: {ticket.prioridad || "-"}</span>
                    <span>Tipo: {ticket.ticketType || "-"}</span>
                    <span>Atendió: {ticket.responsable?.nombre || "-"}</span>
                    <span>Inicio: {ticket.fechaInicio || "-"}</span>
                    <span>Cierre: {ticket.fechaFinalizacion || "-"}</span>
                  </div>
                  <div className={styles.actionRow}>
                    {ticket.serviceSheet?.pdfUrl && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void openExternalUrl(getAssetUrl(ticket.serviceSheet!.pdfUrl!))}
                      >
                        Hoja de servicio (PDF)
                      </button>
                    )}
                    <button className="button-secondary" type="button" onClick={() => handleTicketReport(ticket.id)}>
                      Ver ticket (PDF)
                    </button>
                  </div>
                  <details className={styles.ticketDetailPanel}>
                    <summary className={styles.ticketDetailSummary}>Ver detalle operativo</summary>
                    <div className={styles.ticketDetailBody}>
                      <section className={styles.ticketDetailSection}>
                        <h4 className={styles.ticketDetailTitle}>Flujo de actividad</h4>
                        <div className={styles.ticketDetailGrid}>
                          <div><strong>Llegada:</strong> {formatDateTime(getArrivalTime(ticket))}</div>
                          <div><strong>Salida:</strong> {formatDateTime(getDepartureTime(ticket))}</div>
                          <div><strong>Inicio:</strong> {formatDateTime(ticket.fechaInicio)}</div>
                          <div><strong>Cierre:</strong> {formatDateTime(ticket.fechaFinalizacion)}</div>
                          <div>
                            <strong>Ubicación llegada:</strong> {formatCoordinates(ticket.activityEvidence?.entryLatitude, ticket.activityEvidence?.entryLongitude)}
                            {hasCoordinates(ticket.activityEvidence?.entryLatitude, ticket.activityEvidence?.entryLongitude) && (
                              <button
                                type="button"
                                className={styles.ticketInlineLink}
                                onClick={() => void openExternalUrl(getMapsUrl(ticket.activityEvidence?.entryLatitude, ticket.activityEvidence?.entryLongitude))}
                              >
                                Ver mapa
                              </button>
                            )}
                          </div>
                          <div>
                            <strong>Ubicación salida:</strong> {formatCoordinates(ticket.activityEvidence?.exitLatitude, ticket.activityEvidence?.exitLongitude)}
                            {hasCoordinates(ticket.activityEvidence?.exitLatitude, ticket.activityEvidence?.exitLongitude) && (
                              <button
                                type="button"
                                className={styles.ticketInlineLink}
                                onClick={() => void openExternalUrl(getMapsUrl(ticket.activityEvidence?.exitLatitude, ticket.activityEvidence?.exitLongitude))}
                              >
                                Ver mapa
                              </button>
                            )}
                          </div>
                          <div><strong>PDF generado:</strong> {formatDateTime(ticket.activityEvidence?.serviceSheetUploadedAt)}</div>
                          <div><strong>Formulario digital:</strong> {formatDateTime(ticket.activityEvidence?.serviceSheetCompletedAt)}</div>
                        </div>
                      </section>

                      <section className={styles.ticketDetailSection}>
                        <h4 className={styles.ticketDetailTitle}>Archivos y evidencias</h4>
                        <div className={styles.ticketFileGrid}>
                          {buildTicketEvidenceFiles(ticket).map((file) => {
                            const mapReplacement = shouldReplacePdfWithMap(file, ticket);
                            const coords = getTicketMapCoords(ticket);
                            const mapUrl = getMapsUrl(coords.lat, coords.lng);
                            const mapPreviewUrl = getStaticMapPreviewUrl(coords.lat, coords.lng);

                            const fileHref = mapReplacement ? mapUrl : file.url;
                            return (
                              <a
                                key={`${ticket.id}-${file.label}-${file.url}`}
                                className={styles.ticketFileCard}
                                href={fileHref}
                                rel="noreferrer"
                                onClick={(e) => {
                                  if (!isCapacitorNative()) return;
                                  e.preventDefault();
                                  void openExternalUrl(fileHref);
                                }}
                              >
                                <span className={styles.ticketFileLabel}>{mapReplacement ? "Mapa de llegada" : file.label}</span>
                                {mapReplacement ? (
                                  <img src={mapPreviewUrl} alt="Mapa de llegada" className={styles.ticketFileImage} />
                                ) : file.kind === "image" ? (
                                  <img src={file.url} alt={file.label} className={styles.ticketFileImage} />
                                ) : (
                                  <span className={styles.ticketFileMeta}>{file.kind === "pdf" ? "Abrir PDF" : "Abrir archivo"}</span>
                                )}
                              </a>
                            );
                          })}
                          {buildTicketEvidenceFiles(ticket).length === 0 && <div className={styles.mutedText}>Sin archivos de evidencia.</div>}
                        </div>
                      </section>

                      <section className={styles.ticketDetailSection}>
                        <h4 className={styles.ticketDetailTitle}>Formulario digital</h4>
                        <div className={styles.ticketFormGrid}>
                          {flattenTicketFields(ticket.activityEvidence?.serviceSheetData).map((field, index) => (
                            <div key={`${ticket.id}-${field.label}-${index}`} className={styles.ticketFormCard}>
                              <span className={styles.ticketFormLabel}>{field.label}</span>
                              {field.imageUrl ? (
                                <img
                                  src={field.imageUrl}
                                  alt={field.label}
                                  className={`${styles.ticketFormImage} ${/(signature|firma)/i.test(field.label) ? styles.ticketFormImageSignature : ""}`}
                                />
                              ) : (
                                <span className={styles.ticketFormValue}>{field.value}</span>
                              )}
                            </div>
                          ))}
                          {flattenTicketFields(ticket.activityEvidence?.serviceSheetData).length === 0 && <div className={styles.mutedText}>No hay datos del formulario digital.</div>}
                        </div>
                      </section>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {activeTab === "inventories" && session?.token && (
            <TicketsInventoryManager
              token={session.token}
              apiUrl={API_URL}
              mode="branch"
              fixedBranch={{
                id: session.branch.id,
                name: profile?.name || session.branch.name,
                branchNumber: profile?.branchNumber || session.branch.branchNumber,
              }}
            />
          )}

          {activeTab === "request" && (
          <>
          <div className={`card ${styles.cardSoft} ${styles.requestFormCard}`}>
            <div className={styles.requestFormHeader}>
              <p className={styles.requestEyebrow}>Portal operativo</p>
              <p className={styles.sectionTitle}>Registrar solicitud</p>
              <p className={styles.sectionSubtitle}>Genera tickets o mantenimientos desde tu sucursal con información suficiente para acelerar el despacho.</p>
              <div className={styles.requestBadgeRow}>
                <span className={styles.requestBadge}>Sucursal: {profile?.name || session.branch.name}</span>
                <span className={styles.requestBadge}>Urgencia: {draft.urgency}</span>
              </div>
            </div>

            <div className={styles.infoBanner}>
              <p className={styles.formSectionTitle}>Punto de origen</p>
              <p className={styles.formSectionText}>Sucursal: {profile?.name || session.branch.name} {profile?.branchNumber ? `(${profile.branchNumber})` : ""}</p>
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>
                <p className={styles.formSectionTitle}>Contexto de la solicitud</p>
                <p className={styles.formSectionText}>Define el tipo de requerimiento y el nivel de prioridad antes de enviarlo al equipo.</p>
              </div>
              <div className={styles.fieldStack}>
                <label className={styles.fieldLabel}>Descripción del requerimiento</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder={draft.requestType === "PREVENTIVE_INVENTORY" ? "Describe el alcance del mantenimiento e inventario" : "Describe el problema o requerimiento"}
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className={styles.grid200}>
                <div className={styles.fieldStack}>
                  <label className={styles.fieldLabel}>Tipo de solicitud</label>
                  <select className="input" value={draft.requestType} onChange={(e) => setDraft((prev) => ({ ...prev, requestType: e.target.value as "ISSUE" | "PREVENTIVE_INVENTORY" }))}>
                    <option value="ISSUE">Ticket por problema</option>
                    <option value="PREVENTIVE_INVENTORY">Mantenimiento e inventario</option>
                  </select>
                </div>
                <div className={styles.fieldStack}>
                  <label className={styles.fieldLabel}>Urgencia</label>
                  <select className="input" value={draft.urgency} onChange={(e) => setDraft((prev) => ({ ...prev, urgency: e.target.value }))}>
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
                <div className={styles.fieldStack}>
                  <label className={styles.fieldLabel}>Fecha limite</label>
                  <input className="input" type="date" value={draft.dueAt} onChange={(e) => setDraft((prev) => ({ ...prev, dueAt: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>
                <p className={styles.formSectionTitle}>Ubicación y evidencia inicial</p>
                <p className={styles.formSectionText}>Adjunta archivos y confirma ubicación para evitar aclaraciones posteriores.</p>
              </div>
              <ClientLocationPicker
                label="Ubicación de la solicitud"
                value={{
                  address: draft.address,
                  placeId: draft.placeId,
                  latitud: draft.latitud,
                  longitud: draft.longitud,
                }}
                onChange={(value: ClientLocationValue) =>
                  setDraft((prev) => ({
                    ...prev,
                    address: value.address || prev.address,
                    placeId: value.placeId || prev.placeId,
                    latitud: value.latitud ?? prev.latitud,
                    longitud: value.longitud ?? prev.longitud,
                  }))
                }
              />
              <div className={styles.uploadPanel}>
                <div className={styles.formSectionHeader}>
                  <p className={styles.formSectionTitle}>Archivos de apoyo</p>
                  <p className={styles.formSectionText}>Puedes adjuntar imágenes o PDF con referencias del problema o del inventario a revisar.</p>
                </div>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    handleFileSelect(Array.from(event.dataTransfer.files || []));
                  }}
                  className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
                >
                  <input
                    id="branch-evidence-file"
                    className="input"
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
                    style={{ display: "none" }}
                  />
                  <div className={styles.uploadActions}>
                    <label htmlFor="branch-evidence-file" className="button-secondary" style={{ cursor: "pointer" }}>
                      Seleccionar archivo
                    </label>
                    <span className={styles.mutedText}>o arrastra tus archivos directamente a esta área</span>
                  </div>
                  <div className={styles.mutedText}>
                    {files.length > 0 ? `${files.length} archivo(s) seleccionados` : "Ningún archivo seleccionado"}
                  </div>
                </div>
              </div>
            </div>
            {files.length > 0 && (
              <div className={styles.cardSoft} style={{ gap: 10 }}>
                <div className={styles.previewGrid}>
                  {files.map((entry, index) => (
                    <div
                      key={`${entry.file.name}-${index}`}
                      className={`${styles.previewTile} ${entry.kind === "pdf" ? styles.previewTilePdf : ""}`}
                      style={entry.kind === "image" ? { minHeight: 120, maxHeight: 260 } : { height: "clamp(160px, 28vw, 260px)", maxHeight: 260 }}
                    >
                      {entry.kind === "image" ? (
                        <img src={entry.url} alt={entry.file.name} style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "var(--surface-light)" }} />
                      ) : (
                        <object data={entry.url} type="application/pdf" width="100%" height="100%">
                          <embed src={entry.url} type="application/pdf" />
                          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 12, padding: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>PDF</div>
                            <div style={{ wordBreak: "break-word" }}>{entry.file.name}</div>
                          </div>
                        </object>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className={styles.previewDelete}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={`${styles.actionRow} ${styles.submitRow}`}>
              <div className={styles.submitHint}>La solicitud se enviará con descripción, prioridad, ubicación y evidencias iniciales para que el equipo la tome sin pérdida de contexto.</div>
              <button className="button-primary" type="button" onClick={handleSubmit} disabled={loading}>Enviar solicitud</button>
              {error && <span className={styles.errorText}>{error}</span>}
            </div>
          </div>

          <div className={`card ${styles.cardSoft}`}>
            <p className={styles.sectionTitle}>Solicitudes enviadas</p>
            {openRequests.length === 0 && <div className={styles.mutedText}>No hay solicitudes activas.</div>}
            {openRequests.map((request) => (
              <div key={request.id} className={styles.itemCard}>
                <div className={styles.itemHeader}>
                  <strong>Ticket #{request.id}</strong>
                  <span className="badge">{request.status}</span>
                </div>
                <div className={styles.mutedText}>
                  Flujo: {request.requestType === "PREVENTIVE_INVENTORY" ? "Mantenimiento e inventario" : "Ticket por problema"}
                </div>
                <div className={styles.mutedText}>{request.description}</div>
                <div className={styles.mutedText}>Urgencia: {request.urgency}</div>
                {Array.isArray(request.evidenceUrls) && request.evidenceUrls.length > 0 && (
                  <div className={styles.grid120}>
                    {request.evidenceUrls.map((url, idx) => (
                      <div key={`${request.id}-${idx}`} className={styles.mediaTile} style={{ display: "grid", placeItems: "center", padding: 8, minHeight: 140 }}>
                        {url.toLowerCase().endsWith(".pdf") ? (
                          <div className={`card ${styles.cardSoft}`} style={{ minHeight: 120, display: "grid", placeItems: "center", padding: 10 }}>
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void openExternalUrl(getAssetUrl(url))}
                            >
                              Abrir PDF
                            </button>
                          </div>
                        ) : (
                          <img
                            src={getAssetUrl(url)}
                            alt="evidencia"
                            className={styles.mediaImg}
                            style={{ width: "100%", maxHeight: 220, objectFit: "contain", background: "var(--surface-light)" }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          </>
          )}
        </div>
      </main>
      {showPdfModal && pdfUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPdfModal(false)}
        >
          <div
            style={{
              background: "var(--surface, #fff)",
              borderRadius: 12,
              width: "100%",
              maxWidth: 980,
              maxHeight: "min(92dvh, 920px)",
              height: "min(92dvh, 920px)",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontWeight: 600 }}>{pdfModalTitle}</span>
              <button onClick={() => setShowPdfModal(false)} style={{ padding: "6px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>✕ Cerrar</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <PDFViewer
                pdfUrl={pdfUrl}
                pdfData={pdfData}
                fileName={pdfFileName}
                height="800px"
                fillParent
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
