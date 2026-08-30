"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Socket } from "socket.io-client";
import { usePortalSession } from "@/components/portal/PortalShell";
import { writeClientSession } from "@/lib/portal-session";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import BranchesForm from "@/components/BranchesForm";
import TicketsInventoryManager from "@/components/TicketsInventoryManager";
import { buildApiUrl, getSocketBaseUrl, getApiAssetOrigin } from "@/lib/api-base";
import { fetchWithOfflineQueue, isQueuedResponse } from "@/lib/fetch-offline";
import { openExternalUrl } from "@/lib/open-external-url";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import styles from "./tickets.module.css";
import { createRealtimeSocket } from '@/lib/realtime-socket';
import { getIntegraUrl } from "@/lib/panel-urls";

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
  project?: { id: number; title: string; status: string; projectType?: string | null } | null;
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

type ClientProject = {
  id: number;
  title: string;
  status: string;
  activityCount: number;
  completedActivities: number;
  progressPercent: number;
  siteCount?: number | null;
  scopeSummary?: string | null;
};

export default function ClientTicketsPage() {
  const { client: session, token, refresh } = usePortalSession();
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "nuevo" | "inventarios" | "perfil" | "sucursales">("tickets");
  const [reportRange, setReportRange] = useState<"today" | "7d" | "30d" | "custom">("7d");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);
  const [reportPdfData, setReportPdfData] = useState<Uint8Array | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportModalTitle, setReportModalTitle] = useState("Reporte consolidado de tickets");
  const [reportFileName, setReportFileName] = useState(`reporte-tickets-${new Date().toISOString().slice(0, 10)}.pdf`);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [evidenceLoadErrors, setEvidenceLoadErrors] = useState<Record<string, boolean>>({});
  const [mapPreviewErrors, setMapPreviewErrors] = useState<Record<string, number>>({});
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback[]>([]);
  const [clientProjects, setClientProjects] = useState<ClientProject[]>([]);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("");
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

  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
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

  const SLA_RESOLUTION_HOURS_BY_PRIORITY: Record<string, number> = { Alta: 8, Media: 24, Baja: 72 };

  const getSlaStatus = (ticket: Ticket): { label: string; color: string; detail: string } | null => {
    if (!ticket.fechaAsignacion) return null;
    const start = new Date(ticket.fechaAsignacion).getTime();
    if (Number.isNaN(start)) return null;
    const slaHours = SLA_RESOLUTION_HOURS_BY_PRIORITY[ticket.prioridad || "Media"] ?? 24;
    const deadline = start + slaHours * 3600000;

    if (ticket.fechaFinalizacion) {
      const closedAt = new Date(ticket.fechaFinalizacion).getTime();
      if (Number.isNaN(closedAt)) return null;
      const tookHours = (closedAt - start) / 3600000;
      const onTime = closedAt <= deadline;
      return onTime
        ? { label: "SLA cumplido", color: "#16a34a", detail: `Resuelto en ${tookHours.toFixed(1)}h · meta ${slaHours}h` }
        : { label: "SLA excedido", color: "#dc2626", detail: `Resuelto en ${tookHours.toFixed(1)}h · meta ${slaHours}h` };
    }

    const remainingH = (deadline - Date.now()) / 3600000;
    if (remainingH < 0) {
      return { label: `Vencido hace ${Math.abs(remainingH).toFixed(1)}h`, color: "#dc2626", detail: `Meta de resolución: ${slaHours}h (prioridad ${ticket.prioridad || "Media"})` };
    }
    if (remainingH <= 4) {
      return { label: `Vence en ${remainingH.toFixed(1)}h`, color: "#f59e0b", detail: `Meta de resolución: ${slaHours}h (prioridad ${ticket.prioridad || "Media"})` };
    }
    return { label: `${remainingH.toFixed(0)}h para SLA`, color: "#3b82f6", detail: `Meta de resolución: ${slaHours}h (prioridad ${ticket.prioridad || "Media"})` };
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
    (ticket.activityEvidence?.evidencePhotos || []).forEach((photoUrl, index) => {
      pushFile(`Evidencia ${index + 1}`, photoUrl);
    });
    pushFile("PDF hoja de servicio", ticket.activityEvidence?.serviceSheetPdfUrl || ticket.serviceSheet?.pdfUrl);
    pushFile("Foto salida", ticket.activityEvidence?.exitPhotoUrl);
    (ticket.evidencias || []).forEach((evidence) => {
      pushFile(evidence.tipoEvidencia || "Archivo", evidence.archivoUrl);
    });
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
  const clientAvatarUrl = profile?.logoUrl || session?.client?.logoUrl || "";

  useEffect(() => {
    setAvatarLoadError(false);
  }, [clientAvatarUrl]);

  // Marcar como mounted después del primer render en el cliente
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get("tab");
      if (tabParam === "tickets") {
        setActiveTab("tickets");
      } else if (tabParam === "new-ticket") {
        setActiveTab("nuevo");
      } else if (tabParam === "inventories" || tabParam === "inventarios") {
        setActiveTab("inventarios");
      } else if (tabParam === "profile") {
        setActiveTab("perfil");
      } else if (tabParam === "branches" || tabParam === "sucursales") {
        setActiveTab("sucursales");
      }
    }
  }, []);

  useEffect(() => {
    if (token) {
      window.dispatchEvent(new Event("nexara-portal-session-changed"));
    }
  }, [token]);

  useEffect(() => {
    return () => {
      if (reportPdfUrl) URL.revokeObjectURL(reportPdfUrl);
    };
  }, [reportPdfUrl]);

  const fetchTickets = async (token: string) => {
    setLoading(true);
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = now;
    if (reportRange === "today") {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (reportRange === "7d" || reportRange === "30d") {
      const days = reportRange === "7d" ? 7 : 30;
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    } else if (reportStart && reportEnd) {
      startDate = new Date(reportStart);
      endDate = new Date(reportEnd);
    }

    const params = new URLSearchParams();
    if (startDate && endDate) {
      params.set("start", startDate.toISOString());
      params.set("end", endDate.toISOString());
    }
    if (selectedProjectFilter) {
      params.set("projectId", selectedProjectFilter);
    }
    const query = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(buildApiUrl(`client-portal/tickets${query}`), {
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
        refresh();
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
      if (res.status === 401 || res.status === 403) {
        window.sessionStorage.removeItem("clientSession");
        refresh();
        setProfile(null);
        setBranches([]);
        setError("La sesión ha expirado. Inicia sesión nuevamente.");
      } else {
        setError(`No se pudo cargar el perfil (error ${res.status}). Intenta recargar la página.`);
      }
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data) return;
    setProfile(data);

    if (data.logoUrl !== undefined && session?.client && token) {
      const normalizedLogoUrl = data.logoUrl || null;
      if ((session.client.logoUrl || null) !== normalizedLogoUrl) {
        writeClientSession({
          token,
          client: {
            ...session.client,
            logoUrl: normalizedLogoUrl,
          },
        });
        refresh();
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
    if (!token) return;
    fetchProfile(token);
    fetchBranches(token);
  }, [token]);

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

  const fetchClientProjects = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/projects"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setClientProjects(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (token) {
      fetchTickets(token);
      fetchProfile(token);
      fetchBranches(token);
      fetchRequests(token);
      fetchPendingFeedback(token);
      fetchClientProjects(token);
    }
  }, [token, reportRange, reportStart, reportEnd, selectedProjectFilter]);

  useEffect(() => {
    if (!token) return undefined;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ["polling", "websocket"] });
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Activity" || payload?.model === "Evidence" || payload?.model === "ClientTicketRequest") {
        fetchTickets(token);
        fetchRequests(token);
        fetchPendingFeedback(token);
      }
      if (payload?.model === "ServiceClientBranch" || payload?.model === "ServiceClient") {
        fetchProfile(token);
      }
      if (payload?.model === "ClientActivityFeedback") {
        fetchPendingFeedback(token);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

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

  const openRequests = useMemo(() => {
    return requests.filter((request) => String(request.status || "").toUpperCase() !== "CLOSED");
  }, [requests]);

  const ticketStats = useMemo(() => {
    const isClosedTicket = (ticket: Ticket) => {
      const status = String(ticket.estatus || "").toUpperCase();
      return (
        status.includes("FINAL") ||
        status.includes("CERR") ||
        status.includes("COMPLET") ||
        status.includes("APROBAD") ||
        Boolean(ticket.fechaFinalizacion)
      );
    };

    const normalized = sortedTickets.map((ticket) => String(ticket.estatus || "").toUpperCase());
    return {
      total: sortedTickets.length,
      pending: sortedTickets.filter((ticket) => {
        const status = String(ticket.estatus || "").toUpperCase();
        return !isClosedTicket(ticket) && (status.includes("PEND") || status.includes("ASIGN") || status.includes("PROCES"));
      }).length,
      closed: sortedTickets.filter((ticket) => isClosedTicket(ticket)).length,
      requests: openRequests.length,
    };
  }, [sortedTickets, openRequests.length]);

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
    if (!token) return;
    const range = resolveReportRange();
    if (!range) {
      setError("Selecciona un rango valido para el reporte");
      return;
    }
    setReportGenerating(true);
    const query = `?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`;
    const res = await fetch(buildApiUrl(`client-portal/report${query}`), {
      headers: { Authorization: `Bearer ${token}` },
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
    setReportModalTitle("Reporte consolidado de tickets");
    setReportFileName(`reporte-tickets-${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowReportModal(true);
    setReportGenerating(false);
  };

  const handleTicketReport = async (ticketId: number) => {
    if (!token) return;
    const res = await fetch(buildApiUrl(`client-portal/tickets/${ticketId}/report`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("No se pudo previsualizar el reporte del ticket");
      return;
    }
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const selected = tickets.find((ticket) => ticket.id === ticketId);
    const ticketLabel = selected?.anNumber || `Ticket #${ticketId}`;

    setReportPdfData(new Uint8Array(arrayBuffer));
    if (reportPdfUrl) URL.revokeObjectURL(reportPdfUrl);
    setReportPdfUrl(URL.createObjectURL(blob));
    setReportModalTitle(`Reporte individual: ${ticketLabel}`);
    setReportFileName(`reporte-ticket-${ticketLabel.replace(/[^a-zA-Z0-9-_]+/g, "-")}.pdf`);
    setShowReportModal(true);
  };

  const handleProfileSave = async () => {
    if (!token) return;
    const res = await fetchWithOfflineQueue(
      buildApiUrl("client-portal/profile"),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      },
      () => token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo guardar el perfil");
      return;
    }
    await fetchProfile(token);
  };

  const handleLogoUpload = async (file: File) => {
    if (!token || !file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(buildApiUrl("client-portal/profile/logo"), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        setError("No se pudo subir el logo");
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.logoUrl && session && token) {
        writeClientSession({
          token,
          client: { ...session.client, logoUrl: data.logoUrl },
        });
        refresh();
      }
      await fetchProfile(token);
    } catch {
      setError("No se pudo subir el logo");
    } finally {
      setLogoUploading(false);
    }
  };



  const handleRequestSubmit = async () => {
    if (!token) return;
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
      () => token,
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
    await fetchRequests(token);
  };

  const handleDecision = async (id: number, decision: "APPROVED" | "REJECTED") => {
    if (!token) return;
    const res = await fetchWithOfflineQueue(
      buildApiUrl(`client-portal/requests/${id}/decision`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      },
      () => token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo actualizar la solicitud");
      return;
    }
    await fetchRequests(token);
  };

  const handleRequestClose = async (id: number) => {
    if (!token) return;
    const res = await fetchWithOfflineQueue(
      buildApiUrl(`client-portal/requests/${id}/close`),
      { method: "PUT" },
      () => token,
    );
    if (isQueuedResponse(res)) {
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("No se pudo cerrar la solicitud");
      return;
    }
    await fetchRequests(token);
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
    if (!token) return;
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
      () => token,
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
    await fetchPendingFeedback(token);
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

  if (!session) return null;

  return (
    <div className={styles.mainStack}>
          <div className={`card ${styles.panelHero}`}>
            <p className={styles.panelHeroTitle}>Panel de tickets corporativo</p>
            <p className={styles.panelHeroMeta}>
              Cliente: {session.client.name} · Administra solicitudes, inventarios y seguimiento en un solo flujo.
            </p>
            <div className={styles.panelKpis}>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{ticketStats.total}</span><span className={styles.panelKpiLabel}>Tickets</span></div>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{ticketStats.pending}</span><span className={styles.panelKpiLabel}>En proceso</span></div>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{ticketStats.closed}</span><span className={styles.panelKpiLabel}>Cerrados</span></div>
              <div className={styles.panelKpi}><span className={styles.panelKpiValue}>{ticketStats.requests}</span><span className={styles.panelKpiLabel}>Solicitudes</span></div>
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
              <a
                href={getIntegraUrl("/")}
                className={`card ${styles.cardSoft}`}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <p className={styles.sectionTitle} style={{ marginBottom: 4 }}>Mi seguridad</p>
                <p className={styles.mutedText} style={{ margin: 0 }}>
                  Cámaras, accesos y estado del sitio en Integra →
                </p>
              </a>
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
              {clientProjects.length > 0 && (
                <div className={`card ${styles.cardPanel}`}>
                  <p className={styles.sectionTitle}>Proyectos en curso</p>
                  <p className={styles.sectionSubtitle}>Instalaciones y servicios activos en sus sucursales.</p>
                  <div className={styles.listStack}>
                    {clientProjects.map((p) => (
                      <div key={p.id} className={styles.itemCard}>
                        <div className={styles.itemHeader}>
                          <strong>{p.title}</strong>
                          <span className="badge">{p.progressPercent}%</span>
                        </div>
                        <div className={styles.mutedText}>
                          {p.completedActivities}/{p.activityCount} OT completadas
                          {p.siteCount ? ` · ${p.siteCount} sitio(s)` : ""}
                        </div>
                        {p.scopeSummary && <div className={styles.mutedText}>{p.scopeSummary}</div>}
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
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Proyecto</label>
                    <select
                      className="input"
                      value={selectedProjectFilter}
                      onChange={(e) => setSelectedProjectFilter(e.target.value)}
                    >
                      <option value="">Todos los proyectos</option>
                      {clientProjects.map((p) => (
                        <option key={p.id} value={String(p.id)}>{p.title}</option>
                      ))}
                    </select>
                  </div>
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
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span className="badge">{ticket.estatus}</span>
                      {(() => {
                        const sla = getSlaStatus(ticket);
                        return sla ? (
                          <span
                            title={sla.detail}
                            style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${sla.color}22`, color: sla.color }}
                          >
                            {sla.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <div className={styles.metaGrid}>
                    {ticket.project?.title && (
                      <span>Proyecto: {ticket.project.title}</span>
                    )}
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
                          onClick={() => void openExternalUrl(getMapsUrl(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud))}
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
                      Ver ticket (PDF)
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
                              onClick={() => void openExternalUrl(getMapsUrl(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud))}
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
                {openRequests.length === 0 && <div className={styles.mutedText}>No hay solicitudes activas.</div>}
                {openRequests.map((request) => (
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
          {activeTab === "inventarios" && token && (
            <TicketsInventoryManager
              token={token}
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
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {clientAvatarUrl ? (
                    <img src={getAssetUrl(clientAvatarUrl)} alt={session.client.name} className={styles.heroLogo} style={{ display: "block" }} />
                  ) : (
                    <div className={styles.heroLogo} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", color: "var(--text-2)", fontWeight: 700, fontSize: 24, borderRadius: 12 }}>
                      {session.client.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{session.client.name}</h3>
                  <p className={styles.mutedText} style={{ margin: 0 }}>Acceso para consulta de tickets, reportes y seguimiento de sucursales.</p>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, cursor: logoUploading ? "default" : "pointer", opacity: logoUploading ? 0.6 : 1 }}>
                    <span className="button-secondary" style={{ padding: "4px 12px", fontSize: "0.8rem" }}>
                      {logoUploading ? "Subiendo..." : "📷 Cambiar logo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={logoUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
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
                {token && (
                  <BranchesForm
                    token={token}
                    branches={branches}
                    onBranchSaved={handleBranchSaved}
                    clientLogoUrl={profile?.logoUrl || session.client.logoUrl || null}
                    companyLogoUrl={profile?.logoUrl || null}
                  />
                )}
              </div>
            </div>
          )}
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
              <span style={{ fontWeight: 600 }}>{reportModalTitle}</span>
              <button onClick={() => setShowReportModal(false)} style={{ padding: "6px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>✕ Cerrar</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <PDFViewer
                pdfUrl={reportPdfUrl}
                pdfData={reportPdfData}
                fileName={reportFileName}
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


