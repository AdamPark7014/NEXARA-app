"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import BottomNav from "@/components/BottomNav";
import { getApiAssetOrigin } from "@/lib/api-base";
import { getAccessiblePanels } from "@/lib/panel-routing";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import BranchesForm from "@/components/BranchesForm";
import TicketsInventoryManager from "@/components/TicketsInventoryManager";
import consoleStyles from "../console/console.module.css";
import styles from "./tickets.module.css";
import { setActivePanel } from "@/lib/panel-routing";
import { triggerBlobDownload } from "@/lib/file-download";
import { openExternalUrl } from "@/lib/open-external-url";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { fetchWithOfflineQueue, isQueuedResponse } from "@/lib/fetch-offline";
import { useCompactBottomNav } from "@/lib/use-compact-bottom-nav";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });

type ClientSession = {
  token: string;
  client: { id: number; name: string; logoUrl?: string | null };
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
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
  branchName?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  responsable?: { nombre: string } | null;
  evidencias?: Array<{ id: number; archivoUrl: string; tipoEvidencia: string; latitud?: number | null; longitud?: number | null; subidoEn?: string | null }>;
  serviceSheet?: { pdfUrl?: string | null; managerName?: string | null; signedName?: string | null } | null;
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

type ClientProfile = {
  id: number;
  name: string;
  logoUrl?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

type Branch = {
  id: number;
  name: string;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeId?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  portalEmail?: string | null;
  logoUrl?: string | null;
  isActive?: boolean;
};

type TicketRequest = {
  id: number;
  description: string;
  urgency: string;
  status: string;
  requestType?: "ISSUE" | "PREVENTIVE_INVENTORY";
  dueAt?: string | null;
  branchName?: string | null;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeId?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  evidenceUrls?: string[];
  activity?: { id: number; anNumber?: string | null } | null;
};

type PendingFeedback = {
  id: number;
  anNumber?: string | null;
  titulo?: string | null;
  responsable?: { nombre?: string | null } | null;
  fechaFinalizacion?: string | null;
};

export default function ClientTicketsPage() {
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const router = useRouter();
  const canAccessTicketsPanel = useMemo(() => getAccessiblePanels(user).some((panel) => panel.key === "tickets"), [user]);
  const canSwitchPanels = useMemo(() => getAccessiblePanels(user).length > 1, [user]);
  // Inicializar sesión desde sessionStorage directamente
  const [session, setSession] = useState<ClientSession | null>(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("clientSession");
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const showCompactBottomNav = useCompactBottomNav();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "nuevo" | "inventarios" | "perfil" | "sucursales">("tickets");
  const [reportRange, setReportRange] = useState<"today" | "7d" | "30d" | "custom">("7d");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);
  const [reportPdfData, setReportPdfData] = useState<Uint8Array | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [evidenceLoadErrors, setEvidenceLoadErrors] = useState<Record<string, boolean>>({});
  const [mapPreviewErrors, setMapPreviewErrors] = useState<Record<string, number>>({});
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback[]>([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, {
    rating: string;
    wasOnTime: string;
    wasFriendly: string;
    wasSolved: string;
    comments: string;
  }>>({});
  const [profileDraft, setProfileDraft] = useState({
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    city: "",
    state: "",
    country: "",
  });
  const [requestDraft, setRequestDraft] = useState({
    requestType: "ISSUE" as "ISSUE" | "PREVENTIVE_INVENTORY",
    branchId: "",
    branchName: "",
    branchNumber: "",
    address: "",
    city: "",
    state: "",
    country: "",
    placeId: "",
    latitud: null as number | null,
    longitud: null as number | null,
    description: "",
    urgency: "Media",
    dueAt: "",
  });

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
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

  const getEvidenceKind = (value?: string | null): "pdf" | "image" | "file" => {
    if (!value) return "file";
    const normalized = value.trim();
    if (!normalized) return "file";

    let pathname = normalized;
    try {
      const parsed = /^https?:\/\//i.test(normalized)
        ? new URL(normalized)
        : new URL(normalized, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      pathname = parsed.pathname || normalized;
    } catch {
      pathname = normalized.split("?")[0] || normalized;
    }

    const lower = pathname.toLowerCase();
    if (lower.endsWith(".pdf")) return "pdf";
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(lower)) return "image";
    return "file";
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
  const shouldReplacePdfWithMap = (file: { label: string; kind: "image" | "pdf" | "file" }, ticket: Ticket) => {
    if (file.kind !== "pdf") return false;
    if (!/(hoja de servicio|pdf adjunto)/i.test(file.label)) return false;
    const { lat, lng } = getTicketMapCoords(ticket);
    return hasCoordinates(lat, lng);
  };
  const clientAvatarUrl = profile?.logoUrl || session?.client?.logoUrl || "";
  const getMapsUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return "";
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };
  const getStaticMapPreviewUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return "";
    if (GOOGLE_MAPS_API_KEY) {
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=1200x420&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    }
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=1200x420&markers=${lat},${lng},red-pushpin`;
  };
  const getFallbackStaticMapPreviewUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return "";
    if (GOOGLE_MAPS_API_KEY) {
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&scale=2&size=1200x420&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    }
    return `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&size=650,420&z=15&l=map&pt=${lng},${lat},pm2rdm`;
  };
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

  // Marcar como mounted después del primer render en el cliente
  useEffect(() => {
    setMounted(true);
    
    // Read tab from URL params after mounting using window.location
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get("tab");
      if (tabParam === "tickets") {
        setActiveTab("tickets");
      } else if (tabParam === "new-ticket") {
        setActiveTab("nuevo");
      } else if (tabParam === "inventories") {
        setActiveTab("inventarios");
      } else if (tabParam === "profile") {
        setActiveTab("perfil");
      } else if (tabParam === "branches" || tabParam === "sucursales") {
        setActiveTab("sucursales");
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (session) return;

    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessTicketsPanel) {
      router.replace("/paneles");
      return;
    }

    const unifiedSession: ClientSession = {
      token: user.token,
      client: {
        id: user.id,
        name: user.nombre || user.email,
        logoUrl: null,
      },
    };
    setSession(unifiedSession);
    window.sessionStorage.setItem("clientSession", JSON.stringify(unifiedSession));
    window.dispatchEvent(new Event("nexara-portal-session-changed"));
  }, [canAccessTicketsPanel, mounted, router, session, user]);

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
  }, [isMobile, mobileMenuOpen]);

  useEffect(() => {
    return () => {
      if (reportPdfUrl) URL.revokeObjectURL(reportPdfUrl);
    };
  }, [reportPdfUrl]);

  const fetchTickets = async (token: string) => {
    setLoading(true);
    const res = await fetch(buildApiUrl("client-portal/tickets"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setTickets(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const fetchBranches = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/branches"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        window.sessionStorage.removeItem("clientSession");
        setSession(null);
        setBranches([]);
      }
      return;
    }
    const data = await res.json().catch(() => []);
    setBranches(Array.isArray(data) ? data : []);
  };

  const fetchProfile = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/profile"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      window.sessionStorage.removeItem("clientSession");
      setSession(null);
      setProfile(null);
      setBranches([]);
      setError(`No se pudo validar la sesión del portal (${res.status}). Inicia sesión nuevamente.`);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data) return;
    setProfile(data);

    if (data.logoUrl !== undefined && session?.client) {
      const normalizedLogoUrl = data.logoUrl || null;
      if ((session.client.logoUrl || null) !== normalizedLogoUrl) {
        const nextSession = {
          ...session,
          client: {
            ...session.client,
            logoUrl: normalizedLogoUrl,
          },
        };
        window.sessionStorage.setItem("clientSession", JSON.stringify(nextSession));
        setSession(nextSession);
      }
    }

    const profileBranches = Array.isArray(data.branches) ? data.branches : [];
    setBranches(profileBranches);

    setProfileDraft({
      contactName: data.contactName || "",
      contactEmail: data.contactEmail || "",
      contactPhone: data.contactPhone || "",
      address: data.address || "",
      city: data.city || "",
      state: data.state || "",
      country: data.country || "",
    });
  };

  const handleBranchSaved = useCallback(() => {
    if (!session?.token) return;
    fetchProfile(session.token);
    fetchBranches(session.token);
  }, [session?.token]);

  const fetchRequests = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/requests"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setRequests(Array.isArray(data) ? data : []);
  };

  const fetchPendingFeedback = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/feedback/pending"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setPendingFeedback(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (session?.token) {
      setActivePanel("tickets");
      fetchTickets(session.token);
      fetchProfile(session.token);
      fetchBranches(session.token);
      fetchRequests(session.token);
      fetchPendingFeedback(session.token);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ["polling", "websocket"] });
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Activity" || payload?.model === "Evidence" || payload?.model === "ClientTicketRequest") {
        fetchTickets(session.token);
        fetchRequests(session.token);
        fetchPendingFeedback(session.token);
      }
      if (payload?.model === "ServiceClientBranch" || payload?.model === "ServiceClient") {
        fetchProfile(session.token);
      }
      if (payload?.model === "ClientActivityFeedback") {
        fetchPendingFeedback(session.token);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [session?.token]);

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const aDate = a.fechaAsignacion || a.fechaInicio || a.fechaFinalizacion || "";
      const bDate = b.fechaAsignacion || b.fechaInicio || b.fechaFinalizacion || "";
      return bDate.localeCompare(aDate);
    });
  }, [tickets]);

  const ticketsByBranch = useMemo(() => {
    const grouped = new Map<string, Ticket[]>();
    for (const ticket of sortedTickets) {
      const key = ticket.branchName || "Sucursal sin nombre";
      const items = grouped.get(key) || [];
      items.push(ticket);
      grouped.set(key, items);
    }
    return Array.from(grouped.entries());
  }, [sortedTickets]);

  const ticketStats = useMemo(() => {
    const normalized = sortedTickets.map((ticket) => String(ticket.estatus || "").toUpperCase());
    return {
      total: sortedTickets.length,
      pending: normalized.filter((status) => status.includes("PEND") || status.includes("ASIGN") || status.includes("PROCES")).length,
      closed: normalized.filter((status) => status.includes("FINAL") || status.includes("CERR") || status.includes("COMPLET")).length,
      requests: requests.length,
    };
  }, [sortedTickets, requests.length]);

  const loadingPlaceholders = useMemo(() => Array.from({ length: 3 }, (_, index) => index), []);

  const resolveReportRange = () => {
    const now = new Date();
    if (reportRange === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    }
    if (reportRange === "7d" || reportRange === "30d") {
      const days = reportRange === "7d" ? 7 : 30;
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return { start, end: now };
    }
    if (!reportStart || !reportEnd) return null;
    return { start: new Date(reportStart), end: new Date(reportEnd) };
  };

  const handleReportDownload = async () => {
    if (!session?.token) return;
    const range = resolveReportRange();
    if (!range) {
      setError("Selecciona un rango valido para el reporte");
      return;
    }
    setReportGenerating(true);
    const query = `?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`;
    const res = await fetch(buildApiUrl(`client-portal/report${query}`), {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) {
      setError("No se pudo descargar el reporte");
      setReportGenerating(false);
      return;
    }
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    setReportPdfData(new Uint8Array(arrayBuffer));
    if (reportPdfUrl) URL.revokeObjectURL(reportPdfUrl);
    setReportPdfUrl(URL.createObjectURL(blob));
    setShowReportModal(true);
    setReportGenerating(false);
  };

  const handleTicketReport = async (ticketId: number) => {
    if (!session?.token) return;
    const res = await fetch(buildApiUrl(`client-portal/tickets/${ticketId}/report`), {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) {
      setError("No se pudo descargar el reporte del ticket");
      return;
    }
    const blob = await res.blob();
    void triggerBlobDownload(blob, `reporte-ticket-${ticketId}.pdf`, { mimeType: "application/pdf" });
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem("clientSession");
    window.sessionStorage.removeItem("branchSession");
    setSession(null);
    setTickets([]);
    setProfile(null);
    setBranches([]);
    setRequests([]);
    setPendingFeedback([]);
    logout();
    router.replace("/login");
  };

  const handleProfileSave = async () => {
    if (!session?.token) return;
    const res = await fetchWithOfflineQueue(
      buildApiUrl("client-portal/profile"),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      },
      () => session?.token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo guardar el perfil");
      return;
    }
    await fetchProfile(session.token);
  };



  const handleRequestSubmit = async () => {
    if (!session?.token) return;
    if (!requestDraft.description.trim()) {
      setError(requestDraft.requestType === "PREVENTIVE_INVENTORY" ? "Describe el alcance del mantenimiento e inventario" : "Describe el problema para levantar el ticket");
      return;
    }
    const payload = {
      requestType: requestDraft.requestType,
      branchId: requestDraft.branchId ? Number(requestDraft.branchId) : undefined,
      branchName: requestDraft.branchName || undefined,
      branchNumber: requestDraft.branchNumber || undefined,
      address: requestDraft.address || undefined,
      city: requestDraft.city || undefined,
      state: requestDraft.state || undefined,
      country: requestDraft.country || undefined,
      placeId: requestDraft.placeId || undefined,
      latitud: requestDraft.latitud,
      longitud: requestDraft.longitud,
      description: requestDraft.description,
      urgency: requestDraft.urgency,
      dueAt: requestDraft.dueAt || undefined,
    };
    const res = await fetchWithOfflineQueue(
      buildApiUrl("client-portal/requests"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      () => session?.token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      const message = Array.isArray(errorData?.message)
        ? errorData.message.join(". ")
        : errorData?.message;
      setError(message || "No se pudo levantar el ticket");
      return;
    }
    setRequestDraft({
      requestType: "ISSUE",
      branchId: "",
      branchName: "",
      branchNumber: "",
      address: "",
      city: "",
      state: "",
      country: "",
      placeId: "",
      latitud: null,
      longitud: null,
      description: "",
      urgency: "Media",
      dueAt: "",
    });
    await fetchRequests(session.token);
  };

  const handleDecision = async (id: number, decision: "APPROVED" | "REJECTED") => {
    if (!session?.token) return;
    const res = await fetchWithOfflineQueue(
      buildApiUrl(`client-portal/requests/${id}/decision`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      },
      () => session?.token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo actualizar la solicitud");
      return;
    }
    await fetchRequests(session.token);
  };

  const handleRequestClose = async (id: number) => {
    if (!session?.token) return;
    const res = await fetchWithOfflineQueue(
      buildApiUrl(`client-portal/requests/${id}/close`),
      { method: "PUT" },
      () => session?.token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo cerrar la solicitud");
      return;
    }
    await fetchRequests(session.token);
  };

  const updateFeedbackDraft = (id: number, changes: Partial<{ rating: string; wasOnTime: string; wasFriendly: string; wasSolved: string; comments: string }>) => {
    const base = {
      rating: "",
      wasOnTime: "",
      wasFriendly: "",
      wasSolved: "",
      comments: "",
    };
    setFeedbackDrafts((prev) => ({
      ...prev,
      [id]: {
        ...base,
        ...(prev[id] || {}),
        ...changes,
      },
    }));
  };

  const handleFeedbackSubmit = async (activityId: number) => {
    if (!session?.token) return;
    const draft = feedbackDrafts[activityId] || {
      rating: "",
      wasOnTime: "",
      wasFriendly: "",
      wasSolved: "",
      comments: "",
    };
    const payload = {
      activityId,
      rating: draft.rating ? Number(draft.rating) : undefined,
      wasOnTime: draft.wasOnTime === "si" ? true : draft.wasOnTime === "no" ? false : null,
      wasFriendly: draft.wasFriendly === "si" ? true : draft.wasFriendly === "no" ? false : null,
      wasSolved: draft.wasSolved === "si" ? true : draft.wasSolved === "no" ? false : null,
      comments: draft.comments || undefined,
    };
    const res = await fetchWithOfflineQueue(
      buildApiUrl("client-portal/feedback"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      () => session?.token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo enviar la encuesta");
      return;
    }
    setFeedbackDrafts((prev) => {
      const next = { ...prev };
      delete next[activityId];
      return next;
    });
    await fetchPendingFeedback(session.token);
  };

  const handleRequestBranchSelect = (id: string) => {
    const nextId = id;
    const branch = branches.find((item) => item.id === Number(nextId));
    if (!branch) {
      setRequestDraft((prev) => ({ ...prev, branchId: nextId }));
      return;
    }
    setRequestDraft((prev) => ({
      ...prev,
      branchId: nextId,
      branchName: branch.name || "",
      branchNumber: branch.branchNumber || "",
      address: branch.address || "",
      city: branch.city || "",
      state: branch.state || "",
      country: branch.country || "",
      placeId: branch.placeId || "",
      latitud: branch.latitud ?? null,
      longitud: branch.longitud ?? null,
    }));
  };

  const arrivalEvidenceFor = (ticket: Ticket) => {
    if (hasCoordinates(ticket.activityEvidence?.entryLatitude, ticket.activityEvidence?.entryLongitude)) {
      return {
        latitud: ticket.activityEvidence?.entryLatitude,
        longitud: ticket.activityEvidence?.entryLongitude,
        subidoEn: ticket.activityEvidence?.entryPhotoUploadedAt,
      };
    }
    const evidences = ticket.evidencias || [];
    const withLocation = evidences
      .filter((ev) => ev.tipoEvidencia === 'Foto llegada')
      .filter((ev) => ev.latitud && ev.longitud);
    if (!withLocation.length) return null;
    const sorted = [...withLocation].sort((a, b) => {
      const aTime = a.subidoEn ? new Date(a.subidoEn).getTime() : 0;
      const bTime = b.subidoEn ? new Date(b.subidoEn).getTime() : 0;
      return aTime - bTime;
    });
    return sorted[sorted.length - 1];
  };

  // No renderizar nada hasta que el componente esté mounted (evita hydration mismatch)
  if (!mounted) {
    return null;
  }

  if (!session) {
    return null;
  }

  const activeViewInfo = {
    tickets: {
      title: "Estado de tickets",
      subtitle: "Seguimiento en vivo, evidencias y reportes desde una sola vista.",
    },
    nuevo: {
      title: "Nueva solicitud",
      subtitle: "Levanta un requerimiento con el contexto correcto y envialo sin friccion.",
    },
    inventarios: {
      title: "Inventarios",
      subtitle: "Consulta mantenimientos, conteos y snapshots operativos por sucursal.",
    },
    perfil: {
      title: "Perfil corporativo",
      subtitle: "Actualiza el punto de contacto y los datos base de tu cuenta.",
    },
    sucursales: {
      title: "Sucursales",
      subtitle: "Gestiona accesos, identidad y operacion de cada sucursal.",
    },
  }[activeTab];

  const clientBottomNavItems = [
    {
      icon: "🏠",
      label: "Estado",
      onPress: () => {
        setActiveTab("tickets");
        setMobileMenuOpen(false);
      },
      active: activeTab === "tickets",
    },
    {
      icon: "✚",
      label: "Nueva",
      onPress: () => {
        setActiveTab("nuevo");
        setMobileMenuOpen(false);
      },
      active: activeTab === "nuevo",
    },
    {
      icon: "🧰",
      label: "Invent.",
      onPress: () => {
        setActiveTab("inventarios");
        setMobileMenuOpen(false);
      },
      active: activeTab === "inventarios",
    },
    {
      icon: "👤",
      label: "Perfil",
      onPress: () => {
        setActiveTab("perfil");
        setMobileMenuOpen(false);
      },
      active: activeTab === "perfil",
    },
    {
      icon: "🏬",
      label: "Sucurs.",
      onPress: () => {
        setActiveTab("sucursales");
        setMobileMenuOpen(false);
      },
      active: activeTab === "sucursales",
      hapticIntent: "medium" as const,
    },
  ];

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.ticketsConsole}`}>
      {isMobile && mobileMenuOpen && (
        <div
          className={consoleStyles.sidebarOverlay}
          onClick={() => setMobileMenuOpen(false)}
          role="presentation"
        ></div>
      )}
      <aside className={consoleStyles.sidebar} data-mobile={isMobile ? "true" : "false"} data-open={mobileMenuOpen ? "true" : "false"}>
        <div className={consoleStyles.sidebarHeader}>
          <div className={consoleStyles.sidebarLogo}>
            <span className={consoleStyles.brandMark}>NEXARA</span>
            <span className={consoleStyles.brandSub}>Portal</span>
          </div>
          {isMobile && mobileMenuOpen && (
            <button
              type="button"
              className={consoleStyles.mobileCloseButton}
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menú"
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>

        <div
          className={consoleStyles.sidebarContent}
          id="tickets-sidebar-menu"
          data-open={isMobile && mobileMenuOpen ? "true" : undefined}
        >
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.superadminAvatarWrap}>
            {clientAvatarUrl ? (
              <img
                className={`${consoleStyles.avatarImage} ${consoleStyles.avatarImageLogo}`}
                src={getAssetUrl(clientAvatarUrl)}
                alt={session.client.name}
                width={64}
                height={64}
              />
            ) : (
              <span className={consoleStyles.sidebarName}>{session.client.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className={consoleStyles.sidebarName}>{session.client.name}</div>
          <div className={consoleStyles.sidebarEmail}>Seguimiento de servicio y soporte</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Cliente</span>
          </div>
        </div>
        <div className={consoleStyles.menuTitle}>Cuenta corporativa</div>
        <ul className={consoleStyles.sidebarMenu}>
          {(!isMobile || (isMobile && !showCompactBottomNav)) && (
            <li className={consoleStyles.sidebarMenuItem}>
              <button
                type="button"
                className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "perfil" ? consoleStyles.active : ""}`}
                onClick={() => {
                  setActiveTab("perfil");
                  setMobileMenuOpen(false);
                }}
              >
                🪪 Mi perfil corporativo
              </button>
            </li>
          )}
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "sucursales" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("sucursales");
                setMobileMenuOpen(false);
              }}
            >
              🏬 Gestión de sucursales
            </button>
          </li>
        </ul>

        {(!isMobile || (isMobile && !showCompactBottomNav)) && (
          <>
            <div className={consoleStyles.menuTitle}>Servicio y solicitudes</div>
            <ul className={consoleStyles.sidebarMenu}>
              <li className={consoleStyles.sidebarMenuItem}>
                <button
                  type="button"
                  className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "tickets" ? consoleStyles.active : ""}`}
                  onClick={() => {
                    setActiveTab("tickets");
                    setMobileMenuOpen(false);
                  }}
                >
                  🎫 Estado de tickets
                </button>
              </li>
              <li className={consoleStyles.sidebarMenuItem}>
                <button
                  type="button"
                  className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "nuevo" ? consoleStyles.active : ""}`}
                  onClick={() => {
                    setActiveTab("nuevo");
                    setMobileMenuOpen(false);
                  }}
                >
                  ➕ Nueva solicitud
                </button>
              </li>
              <li className={consoleStyles.sidebarMenuItem}>
                <button
                  type="button"
                  className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "inventarios" ? consoleStyles.active : ""}`}
                  onClick={() => {
                    setActiveTab("inventarios");
                    setMobileMenuOpen(false);
                  }}
                >
                  🧰 Inventarios
                </button>
              </li>
            </ul>
          </>
        )}

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
          {canSwitchPanels && (
            <li className={consoleStyles.sidebarMenuItem}>
              <a
                href="/paneles"
                className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                ⇄ Cambiar panel
              </a>
            </li>
          )}
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={handleLogout}
            >
              ⎋ Cerrar sesión
            </button>
          </li>
        </ul>
        </div>
      </aside>
      <main className={consoleStyles.consoleMain}>
        <div className={styles.mainStack}>
          {isMobile && (
            <div className={styles.mobileAppChrome}>
              <div className={styles.mobileTopbar}>
                <div className={styles.mobileTopbarContent}>
                  <p className={styles.mobileEyebrow}>NEXARA Tickets</p>
                  <h1 className={styles.mobileTitle}>{activeViewInfo.title}</h1>
                  <p className={styles.mobileSubtitle}>{activeViewInfo.subtitle}</p>
                </div>
                <div className={styles.mobileTopbarActions}>
                  <button
                    type="button"
                    className={styles.mobileTopAction}
                    onClick={toggleDarkMode}
                    aria-label={darkMode ? "Cambiar a vista clara" : "Cambiar a vista oscura"}
                  >
                    {darkMode ? "☀️ Claro" : "🌙 Oscuro"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.mobileTopAction} ${styles.mobileTopActionDanger}`}
                    onClick={handleLogout}
                    aria-label="Cerrar sesión"
                  >
                    ⎋ Salir
                  </button>
                </div>
              </div>

              <div className={styles.mobileIdentityCard}>
                <div className={styles.mobileIdentityRow}>
                  <div className={styles.mobileIdentityAvatar}>
                    {clientAvatarUrl ? (
                      <img
                        src={getAssetUrl(clientAvatarUrl)}
                        alt={session.client.name}
                        className={styles.mobileIdentityAvatarImage}
                      />
                    ) : (
                      <span>{session.client.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className={styles.mobileIdentityMeta}>
                    <div className={styles.mobileIdentityName}>{session.client.name}</div>
                    <div className={styles.mobileIdentityHint}>Portal corporativo de tickets y servicio</div>
                  </div>
                </div>
                <div className={styles.mobilePillRow}>
                  <span className={styles.mobilePill}>Cliente corporativo</span>
                  <span className={styles.mobilePill}>{ticketStats.pending} en proceso</span>
                  <span className={styles.mobilePill}>{requests.length} solicitudes</span>
                </div>
                <div className={styles.mobileMetricsRow}>
                  <div className={styles.mobileMetric}>
                    <span className={styles.mobileMetricValue}>{ticketStats.total}</span>
                    <span className={styles.mobileMetricLabel}>Tickets</span>
                  </div>
                  <div className={styles.mobileMetric}>
                    <span className={styles.mobileMetricValue}>{ticketStats.closed}</span>
                    <span className={styles.mobileMetricLabel}>Cerrados</span>
                  </div>
                  <div className={styles.mobileMetric}>
                    <span className={styles.mobileMetricValue}>{branches.length}</span>
                    <span className={styles.mobileMetricLabel}>Sucursales</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={`card ${styles.panelHero} ${styles.nativeHero}`}>
            <div className={styles.heroHeadingRow}>
              <div className={styles.heroTitleBlock}>
                <p className={styles.heroEyebrow}>NEXARA Tickets</p>
                <h1 className={styles.heroTitle}>Panel de tickets corporativo</h1>
                <p className={styles.heroLead}>
                  Cliente: {session.client.name} · Administra solicitudes, inventarios y seguimiento en un solo flujo.
                </p>
              </div>
              <div className={styles.heroBadgeRow}>
                <span className={styles.heroBadge}>Servicio centralizado</span>
                <span className={styles.heroBadge}>Vista ejecutiva</span>
              </div>
            </div>
            <div className={styles.heroMetricGrid}>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{ticketStats.total}</span><span className={styles.heroMetricLabel}>Tickets</span></div>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{ticketStats.pending}</span><span className={styles.heroMetricLabel}>En proceso</span></div>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{ticketStats.closed}</span><span className={styles.heroMetricLabel}>Cerrados</span></div>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{ticketStats.requests}</span><span className={styles.heroMetricLabel}>Solicitudes</span></div>
            </div>
          </div>

          <div className={styles.panelTabs}>
            <button type="button" className={`${styles.panelTab} ${activeTab === "tickets" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("tickets")}>Estado</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "nuevo" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("nuevo")}>Nueva solicitud</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "inventarios" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("inventarios")}>Inventarios</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "perfil" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("perfil")}>Perfil</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "sucursales" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("sucursales")}>Sucursales</button>
          </div>

          {activeTab === "tickets" && (
            <div className={styles.sectionStack}>
              {pendingFeedback.length > 0 && (
                <div className={`card ${styles.cardPanel}`}>
                  <div>
                    <p className={styles.sectionTitle}>Confirmación de servicio</p>
                    <p className={styles.sectionSubtitle}>Ayúdanos a validar la calidad del servicio recibido.</p>
                  </div>
                  <div className={styles.listStack}>
                    {pendingFeedback.map((activity) => (
                      <div key={activity.id} className={styles.itemCard}>
                        <div className={styles.itemHeader}>
                          <div>
                            <strong>{activity.anNumber || "Ticket"}</strong>
                            <div className={styles.mutedText}>{activity.titulo || "Servicio finalizado"}</div>
                          </div>
                          <span className="badge">Pendiente</span>
                        </div>
                        <div className={styles.mutedText}>
                          Ingeniero: {activity.responsable?.nombre || "-"} · Finalizado: {activity.fechaFinalizacion || "-"}
                        </div>
                        <div className={styles.grid180}>
                          <div>
                            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Calificación (1-5)</label>
                            <select
                              className="input"
                              value={feedbackDrafts[activity.id]?.rating || ""}
                              onChange={(e) => updateFeedbackDraft(activity.id, { rating: e.target.value })}
                            >
                              <option value="">Selecciona</option>
                              {[1, 2, 3, 4, 5].map((value) => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                          </div>
                          {[
                            { key: "wasOnTime", label: "Llego a tiempo" },
                            { key: "wasFriendly", label: "Atención amable" },
                            { key: "wasSolved", label: "Problema resuelto" },
                          ].map((item) => (
                            <div key={item.key}>
                              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.label}</label>
                              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                <button
                                  className="button-secondary"
                                  type="button"
                                  onClick={() => updateFeedbackDraft(activity.id, { [item.key]: "si" } as any)}
                                >
                                  Si
                                </button>
                                <button
                                  className="button-secondary"
                                  type="button"
                                  onClick={() => updateFeedbackDraft(activity.id, { [item.key]: "no" } as any)}
                                >
                                  No
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Comentarios adicionales"
                          value={feedbackDrafts[activity.id]?.comments || ""}
                          onChange={(e) => updateFeedbackDraft(activity.id, { comments: e.target.value })}
                        />
                        <div className={styles.actionRow}>
                          <button className="button-primary" type="button" onClick={() => handleFeedbackSubmit(activity.id)}>
                            Enviar evaluación
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className={`card ${styles.cardSoft}`}>
                <div className={styles.itemHeader}>
                  <div>
                    <p className={styles.sectionTitle}>Tickets activos</p>
                    <p className={styles.sectionSubtitle}>Seguimiento en tiempo real de avances y evidencias.</p>
                  </div>
                  <div className={styles.mutedText}>{loading ? "Sincronizando..." : "Actualizado"}</div>
                </div>
                <div className={styles.grid200}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Rango del reporte</label>
                    <select className="input" value={reportRange} onChange={(e) => setReportRange(e.target.value as typeof reportRange)}>
                      <option value="today">Hoy</option>
                      <option value="7d">Últimos 7 días</option>
                      <option value="30d">Últimos 30 días</option>
                      <option value="custom">Rango personalizado</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Desde</label>
                    <input
                      className="input"
                      type="date"
                      value={reportStart}
                      onChange={(e) => setReportStart(e.target.value)}
                      disabled={reportRange !== "custom"}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Hasta</label>
                    <input
                      className="input"
                      type="date"
                      value={reportEnd}
                      onChange={(e) => setReportEnd(e.target.value)}
                      disabled={reportRange !== "custom"}
                    />
                  </div>
                  <div className={styles.actionRow}>
                    <button className="button-primary" onClick={handleReportDownload} disabled={reportGenerating}>
                      {reportGenerating ? "Generando..." : "Ver reporte consolidado"}
                    </button>
                  </div>
                </div>
                {error && <div className={styles.errorText}>{error}</div>}
              </div>
              {loading && (
                <div className={styles.loadingList}>
                  {loadingPlaceholders.map((item) => (
                    <div key={item} className={styles.loadingCard}>
                      <div className={`${styles.skeleton} ${styles.skeletonTitle}`}></div>
                      <div className={`${styles.skeleton} ${styles.skeletonLine}`}></div>
                      <div className={`${styles.skeleton} ${styles.skeletonLine}`}></div>
                      <div className={`${styles.skeleton} ${styles.skeletonLineShort}`}></div>
                    </div>
                  ))}
                </div>
              )}
              {ticketsByBranch.map(([branchLabel, branchTickets]) => (
                <div key={branchLabel} className={styles.sectionStack}>
                  <div className={`card ${styles.cardSoft}`}>
                    <p className={styles.sectionTitle} style={{ marginBottom: 0 }}>{branchLabel}</p>
                    <p className={styles.mutedText} style={{ margin: 0 }}>{branchTickets.length} ticket(s) en este rango</p>
                  </div>
                  {branchTickets.map((ticket) => (
                <div key={ticket.id} className={`card ${styles.itemCard}`}>
                  <div className={styles.itemHeader}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{ticket.anNumber}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{ticket.titulo}</div>
                    </div>
                    <span className="badge">{ticket.estatus}</span>
                  </div>
                  <div className={styles.metaGrid}>
                    <span>{ticket.branchName || "-"} · {ticket.branchCity || "-"} {ticket.branchState || ""}</span>
                    <span>Tipo: {ticket.ticketType || "-"}</span>
                    <span>Atendio: {ticket.responsable?.nombre || "-"}</span>
                    <span>Inicio: {ticket.fechaInicio || "-"}</span>
                    <span>Cierre: {ticket.fechaFinalizacion || "-"}</span>
                    {arrivalEvidenceFor(ticket)?.latitud && arrivalEvidenceFor(ticket)?.longitud && (
                      <span>
                        Ubicación llegada:{" "}
                        <button
                          type="button"
                          className={styles.ticketInlineLink}
                          onClick={() =>
                            void openExternalUrl(getMapsUrl(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud))
                          }
                        >
                          ver mapa
                        </button>
                      </span>
                    )}
                  </div>
                  <div className={styles.actionRow}>
                    {ticket.estatus === "Finalizada" && ticket.serviceSheet?.pdfUrl && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void openExternalUrl(getAssetUrl(ticket.serviceSheet!.pdfUrl!))}
                      >
                        Hoja de servicio (PDF)
                      </button>
                    )}
                    <button className="button-secondary" type="button" onClick={() => handleTicketReport(ticket.id)}>
                      Exportar ticket (PDF)
                    </button>
                  </div>
                  <div className={styles.grid140}>
                    {(ticket.evidencias || []).map((ev) => (
                      <div key={ev.id} className={`card ${styles.cardSoft}`} style={{ padding: 8 }}>
                        {ev.archivoUrl.endsWith(".pdf") ? (
                          <div className={`card ${styles.cardSoft}`} style={{ minHeight: 140, display: "grid", placeItems: "center", padding: 10 }}>
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void openExternalUrl(getAssetUrl(ev.archivoUrl))}
                            >
                              Abrir PDF
                            </button>
                          </div>
                        ) : (
                          <img src={getAssetUrl(ev.archivoUrl)} alt={ev.tipoEvidencia} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8 }} />
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{ev.tipoEvidencia}</div>
                      </div>
                    ))}
                  </div>
                  <details className={styles.ticketDetailPanel}>
                    <summary className={styles.ticketDetailSummary}>Ver detalle operativo</summary>
                    <div className={styles.ticketDetailBody}>
                      <section className={styles.ticketDetailSection}>
                        <h4 className={styles.ticketDetailTitle}>Flujo de actividad</h4>
                        <div className={styles.ticketDetailGrid}>
                          <div><strong>Llegada:</strong> {formatDateTime(getArrivalTime(ticket))}</div>
                          <div><strong>Salida:</strong> {formatDateTime(getDepartureTime(ticket))}</div>
                          <div><strong>Inicio programado:</strong> {formatDateTime(ticket.fechaInicio)}</div>
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

                      {hasCoordinates(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud) && (
                        <section className={styles.ticketDetailSection}>
                          <h4 className={styles.ticketDetailTitle}>Mapa de llegada</h4>
                          <div className={styles.ticketMapMetaRow}>
                            <span className={styles.ticketMapCoordinates}>
                              Coordenadas: {formatCoordinates(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud)}
                            </span>
                            <button
                              type="button"
                              className={styles.ticketInlineLink}
                              onClick={() =>
                                void openExternalUrl(getMapsUrl(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud))
                              }
                            >
                              Abrir en Google Maps
                            </button>
                          </div>
                          {(() => {
                            const lat = arrivalEvidenceFor(ticket)?.latitud;
                            const lng = arrivalEvidenceFor(ticket)?.longitud;
                            const mapKey = `${ticket.id}-arrival-map`;
                            const failCount = mapPreviewErrors[mapKey] || 0;
                            const src = failCount === 0
                              ? getStaticMapPreviewUrl(lat, lng)
                              : getFallbackStaticMapPreviewUrl(lat, lng);

                            return (
                              <button
                                type="button"
                                className={styles.ticketMapPreviewLink}
                                onClick={() => void openExternalUrl(getMapsUrl(lat, lng))}
                              >
                                {failCount >= 2 ? (
                                  <div className={styles.ticketMapPreviewFallback}>
                                    Vista previa no disponible en este navegador. Haz clic para abrir el mapa completo.
                                  </div>
                                ) : (
                                  <img
                                    className={styles.ticketMapPreviewImage}
                                    src={src}
                                    alt="Vista previa ubicación de llegada"
                                    onError={() => setMapPreviewErrors((prev) => ({ ...prev, [mapKey]: failCount + 1 }))}
                                  />
                                )}
                              </button>
                            );
                          })()}
                        </section>
                      )}
                    </div>
                  </details>
                </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {activeTab === "nuevo" && (
            <div className={styles.sectionStack}>
              <div className={`card ${styles.cardSoft} ${styles.requestFormCard}`}>
                <div className={styles.requestFormHeader}>
                  <p className={styles.requestEyebrow}>Centro de solicitud</p>
                  <p className={styles.sectionTitle}>Nueva solicitud</p>
                  <p className={styles.sectionSubtitle}>Captura el servicio requerido con datos claros de sucursal, prioridad y ubicación para agilizar la asignación.</p>
                  <div className={styles.requestBadgeRow}>
                    <span className={styles.requestBadge}>Flujo: {requestDraft.requestType === "PREVENTIVE_INVENTORY" ? "Mantenimiento e inventario" : "Ticket por problema"}</span>
                    <span className={styles.requestBadge}>Urgencia: {requestDraft.urgency}</span>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.formSectionHeader}>
                    <p className={styles.formSectionTitle}>Definición del servicio</p>
                    <p className={styles.formSectionText}>Selecciona el flujo correcto y, si aplica, establece un compromiso de atención.</p>
                  </div>
                  <div className={styles.grid200}>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Tipo de solicitud</label>
                      <select
                        className="input"
                        value={requestDraft.requestType}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, requestType: e.target.value as "ISSUE" | "PREVENTIVE_INVENTORY" }))}
                      >
                        <option value="ISSUE">Ticket por problema</option>
                        <option value="PREVENTIVE_INVENTORY">Mantenimiento preventivo e inventario</option>
                      </select>
                    </div>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Urgencia</label>
                      <select
                        className="input"
                        value={requestDraft.urgency}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, urgency: e.target.value }))}
                      >
                        <option value="Baja">Baja</option>
                        <option value="Media">Media</option>
                        <option value="Alta">Alta</option>
                      </select>
                    </div>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Fecha limite</label>
                      <input
                        className="input"
                        type="date"
                        value={requestDraft.dueAt}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, dueAt: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.formSectionHeader}>
                    <p className={styles.formSectionTitle}>Datos de sucursal</p>
                    <p className={styles.formSectionText}>Puedes usar una sucursal existente o completar manualmente la información del sitio.</p>
                  </div>
                  <div className={styles.grid200}>
                    <div className={`${styles.fieldStack} ${styles.fullSpan}`}>
                      <label className={styles.fieldLabel}>Sucursal existente</label>
                      <select
                        className="input"
                        value={requestDraft.branchId}
                        onChange={(e) => handleRequestBranchSelect(e.target.value)}
                      >
                        <option value="">Selecciona una sucursal</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Nombre de la sucursal</label>
                      <input
                        className="input"
                        placeholder="Nombre de la sucursal"
                        value={requestDraft.branchName}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, branchName: e.target.value }))}
                      />
                    </div>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Número de sucursal</label>
                      <input
                        className="input"
                        placeholder="Número de sucursal"
                        value={requestDraft.branchNumber}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, branchNumber: e.target.value }))}
                      />
                    </div>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Ciudad</label>
                      <input
                        className="input"
                        placeholder="Ciudad"
                        value={requestDraft.city}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, city: e.target.value }))}
                      />
                    </div>
                    <div className={styles.fieldStack}>
                      <label className={styles.fieldLabel}>Estado</label>
                      <input
                        className="input"
                        placeholder="Estado"
                        value={requestDraft.state}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, state: e.target.value }))}
                      />
                    </div>
                    <div className={`${styles.fieldStack} ${styles.fullSpan}`}>
                      <label className={styles.fieldLabel}>Dirección</label>
                      <input
                        className="input"
                        placeholder="Dirección"
                        value={requestDraft.address}
                        onChange={(e) => setRequestDraft((prev) => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.formSectionHeader}>
                    <p className={styles.formSectionTitle}>Descripción y ubicación</p>
                    <p className={styles.formSectionText}>Describe el requerimiento con el mayor contexto posible y valida la ubicación en mapa si aplica.</p>
                  </div>
                  <div className={styles.fieldStack}>
                    <label className={styles.fieldLabel}>Descripción del servicio</label>
                    <textarea
                      className="input"
                      rows={4}
                      placeholder={requestDraft.requestType === "PREVENTIVE_INVENTORY" ? "Descripción del mantenimiento e inventario a ejecutar" : "Descripción del problema"}
                      value={requestDraft.description}
                      onChange={(e) => setRequestDraft((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className={styles.infoBanner}>
                    <p className={styles.formSectionTitle}>Ubicación del ticket</p>
                    <p className={styles.formSectionText}>Usa el selector para dejar coordenadas y dirección precisas para el equipo de atención.</p>
                  </div>
                  <ClientLocationPicker
                    label="Ubicación del ticket"
                    value={{
                      address: requestDraft.address,
                      placeId: requestDraft.placeId,
                      latitud: requestDraft.latitud,
                      longitud: requestDraft.longitud,
                    }}
                    onChange={(value: ClientLocationValue) =>
                      setRequestDraft((prev) => ({
                        ...prev,
                        address: value.address || prev.address,
                        placeId: value.placeId || prev.placeId,
                        latitud: value.latitud ?? prev.latitud,
                        longitud: value.longitud ?? prev.longitud,
                      }))
                    }
                  />
                </div>

                <div className={`${styles.actionRow} ${styles.submitRow}`}>
                  <div className={styles.submitHint}>Cuando envíes la solicitud, el equipo verá sucursal, prioridad, ubicación y descripción como una sola ficha operativa.</div>
                  <button className="button-primary" type="button" onClick={handleRequestSubmit}>Enviar solicitud</button>
                  {error && <span className={styles.errorText}>{error}</span>}
                </div>
              </div>
              <div className={`card ${styles.cardSoft}`}>
                <p className={styles.sectionTitle}>Solicitudes registradas</p>
                {requests.length === 0 && <div className={styles.mutedText}>No hay solicitudes registradas aún.</div>}
                {requests.map((request) => (
                  <div key={request.id} className={styles.itemCard}>
                    <div className={styles.itemHeader}>
                      <strong>{request.branchName || "Ticket"}</strong>
                      <span className="badge">{request.status}</span>
                    </div>
                    <div className={styles.mutedText}>
                      Flujo: {request.requestType === "PREVENTIVE_INVENTORY" ? "Mantenimiento e inventario" : "Ticket por problema"}
                    </div>
                    <div className={styles.mutedText}>{request.description}</div>
                    <div className={styles.mutedText}>Urgencia: {request.urgency}</div>
                    {request.activity?.anNumber && (
                      <div className={styles.mutedText}>Asignado a: {request.activity.anNumber}</div>
                    )}
                    {request.latitud && request.longitud && (
                      <button
                        type="button"
                        className={styles.ticketInlineLink}
                        style={{ fontSize: 12, justifySelf: "start" }}
                        onClick={() => void openExternalUrl(getMapsUrl(request.latitud, request.longitud))}
                      >
                        Ver ubicación
                      </button>
                    )}
                    {request.latitud && request.longitud && (
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(getMapsUrl(request.latitud, request.longitud))}
                        style={{
                          display: "block",
                          padding: 0,
                          textAlign: "left",
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "1px solid var(--border)",
                          background: "var(--surface-light)",
                          cursor: "pointer",
                        }}
                      >
                        {(() => {
                          const mapKey = `${request.id}-map`;
                          const failCount = mapPreviewErrors[mapKey] || 0;
                          const src = failCount === 0
                            ? getStaticMapPreviewUrl(request.latitud, request.longitud)
                            : getFallbackStaticMapPreviewUrl(request.latitud, request.longitud);

                          if (failCount >= 2) {
                            return (
                              <div style={{ height: 180, display: "grid", placeItems: "center", color: "var(--text-secondary)", fontSize: 12 }}>
                                Vista previa de mapa no disponible
                              </div>
                            );
                          }

                          return (
                            <img
                              src={src}
                              alt="Vista previa de ubicación"
                              style={{ display: "block", width: "100%", height: 180, objectFit: "cover" }}
                              onError={() => setMapPreviewErrors((prev) => ({ ...prev, [mapKey]: failCount + 1 }))}
                            />
                          );
                        })()}
                      </button>
                    )}
                    {Array.isArray(request.evidenceUrls) && request.evidenceUrls.length > 0 && (
                      <div className={styles.grid120}>
                        {request.evidenceUrls.map((url, idx) => (
                          <div key={`${request.id}-${idx}`} className={styles.mediaTile} style={{ display: "grid", placeItems: "center", padding: 8, minHeight: 140 }}>
                            {getEvidenceKind(url) === "pdf" ? (
                              <div className={`card ${styles.cardSoft}`} style={{ minHeight: 120, display: "grid", placeItems: "center", padding: 10 }}>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => void openExternalUrl(getAssetUrl(url))}
                                >
                                  Abrir PDF
                                </button>
                              </div>
                            ) : !evidenceLoadErrors[`${request.id}-${idx}`] ? (
                              <img
                                src={getAssetUrl(url)}
                                alt="evidencia"
                                className={styles.mediaImg}
                                style={{ width: "100%", maxHeight: 220, objectFit: "contain", background: "var(--surface-light)" }}
                                onError={() => setEvidenceLoadErrors((prev) => ({ ...prev, [`${request.id}-${idx}`]: true }))}
                              />
                            ) : (
                              <div className={`card ${styles.cardSoft}`} style={{ minHeight: 120, display: "grid", placeItems: "center", padding: 10 }}>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => void openExternalUrl(getAssetUrl(url))}
                                >
                                  Abrir archivo
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {request.status !== "CLOSED" && (
                      <div className={styles.actionRow}>
                        <button className="button-secondary" type="button" onClick={() => handleRequestClose(request.id)}>Cerrar solicitud</button>
                        {request.status === "NEW" && (
                          <>
                            <button className="button-primary" type="button" onClick={() => handleDecision(request.id, "APPROVED")}>Autorizar</button>
                            <button className="button-secondary" type="button" onClick={() => handleDecision(request.id, "REJECTED")}>Rechazar</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === "inventarios" && session?.token && (
            <TicketsInventoryManager
              token={session.token}
              apiUrl={API_URL}
              mode="client"
              branches={branches.map((branch) => ({
                id: branch.id,
                name: branch.name,
                branchNumber: branch.branchNumber,
              }))}
            />
          )}
          {activeTab === "perfil" && (
            <div className={styles.sectionStack}>
              <div className={`card ${styles.heroRow}`}>
                {clientAvatarUrl && (
                  <img src={getAssetUrl(clientAvatarUrl)} alt={session.client.name} className={styles.heroLogo} />
                )}
                <div>
                  <h3 style={{ margin: 0 }}>{session.client.name}</h3>
                  <p className={styles.mutedText} style={{ margin: 0 }}>Acceso para consulta de tickets, reportes y seguimiento de sucursales.</p>
                </div>
              </div>
              <div className={`card ${styles.cardSoft}`}>
                <p className={styles.sectionTitle}>Datos de contacto corporativo</p>
                <div className={styles.grid200}>
                  <input className="input" placeholder="Contacto" value={profileDraft.contactName} onChange={(e) => setProfileDraft((prev) => ({ ...prev, contactName: e.target.value }))} />
                  <input className="input" placeholder="Correo electrónico" value={profileDraft.contactEmail} onChange={(e) => setProfileDraft((prev) => ({ ...prev, contactEmail: e.target.value }))} />
                  <input className="input" placeholder="Teléfono" value={profileDraft.contactPhone} onChange={(e) => setProfileDraft((prev) => ({ ...prev, contactPhone: e.target.value }))} />
                  <input className="input" placeholder="Dirección" value={profileDraft.address} onChange={(e) => setProfileDraft((prev) => ({ ...prev, address: e.target.value }))} />
                  <input className="input" placeholder="Ciudad" value={profileDraft.city} onChange={(e) => setProfileDraft((prev) => ({ ...prev, city: e.target.value }))} />
                  <input className="input" placeholder="Estado" value={profileDraft.state} onChange={(e) => setProfileDraft((prev) => ({ ...prev, state: e.target.value }))} />
                  <input className="input" placeholder="País" value={profileDraft.country} onChange={(e) => setProfileDraft((prev) => ({ ...prev, country: e.target.value }))} />
                </div>
                <div className={styles.actionRow}>
                  <button className="button-primary" type="button" onClick={handleProfileSave}>Guardar cambios</button>
                </div>
              </div>
            </div>
          )}
          {activeTab === "sucursales" && (
            <div className={styles.sectionStack}>
              <div className={`card ${styles.cardSoft}`}>
                <p className={styles.sectionTitle}>Gestión de sucursales</p>
                <p className={styles.mutedText} style={{ margin: 0 }}>
                  Administra aquí mismo tus sucursales, logos y credenciales de acceso.
                </p>
                {session?.token && (
                  <BranchesForm
                    token={session.token}
                    branches={branches}
                    onBranchSaved={handleBranchSaved}
                    clientLogoUrl={clientAvatarUrl || null}
                    companyLogoUrl={clientAvatarUrl || null}
                    apiUrl={API_URL}
                  />
                )}
              </div>
            </div>
          )}
          {isMobile && showCompactBottomNav && <div className={styles.mobileBottomSpacer} aria-hidden="true" />}
        </div>
      </main>
      {isMobile && showCompactBottomNav && <BottomNav items={clientBottomNavItems} />}
      {showReportModal && reportPdfUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowReportModal(false)}
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
              <span style={{ fontWeight: 600 }}>Reporte consolidado de tickets</span>
              <button onClick={() => setShowReportModal(false)} style={{ padding: "6px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>✕ Cerrar</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <PDFViewer
                pdfUrl={reportPdfUrl}
                pdfData={reportPdfData}
                fileName={`reporte-tickets-${new Date().toISOString().slice(0, 10)}.pdf`}
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


