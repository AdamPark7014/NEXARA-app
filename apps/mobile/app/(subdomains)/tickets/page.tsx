"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import { getAccessiblePanels } from "@/lib/panel-routing";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import BranchesForm from "@/components/BranchesForm";
import TicketsInventoryManager from "@/components/TicketsInventoryManager";
import consoleStyles from "../console/console.module.css";
import styles from "./tickets.module.css";
import { setActivePanel } from "@/lib/panel-routing";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "nuevo" | "inventarios" | "perfil">("tickets");
  const [reportRange, setReportRange] = useState<"today" | "7d" | "30d" | "custom">("7d");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [requests, setRequests] = useState<TicketRequest[]>([]);
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
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
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
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessTicketsPanel) {
      router.replace("/paneles");
      return;
    }
    if (session) return;

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
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, mobileMenuOpen]);

  const fetchTickets = async (token: string) => {
    setLoading(true);
    const res = await fetch(buildApiUrl("client-portal/tickets"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setTickets(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const fetchProfile = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/profile"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (!data) return;
    setProfile(data);
    setBranches(Array.isArray(data.branches) ? data.branches : []);
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
    setLoading(true);
    const query = `?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`;
    const res = await fetch(buildApiUrl(`client-portal/report${query}`), {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) {
      setError("No se pudo descargar el reporte");
      setLoading(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-tickets-${session.client.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setLoading(false);
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-ticket-${ticketId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
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
    const res = await fetch(buildApiUrl("client-portal/profile"), {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(profileDraft),
    });
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
    const res = await fetch(buildApiUrl("client-portal/requests"), {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError("No se pudo levantar el ticket");
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
    const res = await fetch(buildApiUrl(`client-portal/requests/${id}/decision`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      setError("No se pudo actualizar la solicitud");
      return;
    }
    await fetchRequests(session.token);
  };

  const handleRequestClose = async (id: number) => {
    if (!session?.token) return;
    const res = await fetch(buildApiUrl(`client-portal/requests/${id}/close`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
    });
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
    const res = await fetch(buildApiUrl("client-portal/feedback"), {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.ticketsConsole}`}>
      <aside className={consoleStyles.sidebar} data-mobile={isMobile ? "true" : "false"} data-open={mobileMenuOpen ? "true" : "false"}>
        <div className={consoleStyles.sidebarHeader}>
          <div className={consoleStyles.sidebarLogo}>
            <span className={consoleStyles.brandMark}>NEXARA</span>
            <span className={consoleStyles.brandSub}>Portal</span>
          </div>
          {isMobile && (
            <button
              type="button"
              className={consoleStyles.hamburgerButton}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
              aria-controls="tickets-sidebar-menu"
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
          id="tickets-sidebar-menu"
          data-open={isMobile && mobileMenuOpen ? "true" : undefined}
        >
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            {session.client.logoUrl ? (
              <img className={consoleStyles.avatarImage} src={getAssetUrl(session.client.logoUrl)} alt={session.client.name} width={64} height={64} />
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
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "perfil" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("perfil");
                setMobileMenuOpen(false);
              }}
            >
              🏬 Gestión de sucursales
            </button>
          </li>
        </ul>

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
        )}
      </aside>
      <main className={consoleStyles.consoleMain}>
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
                    <button className="button-primary" onClick={handleReportDownload} disabled={loading}>
                      Descargar reporte consolidado
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
              {sortedTickets.map((ticket) => (
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
                        Ubicación llegada: <a href={getMapsUrl(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud)} target="_blank" rel="noreferrer">ver mapa</a>
                      </span>
                    )}
                  </div>
                  <div className={styles.actionRow}>
                    {ticket.estatus === "Finalizada" && ticket.serviceSheet?.pdfUrl && (
                      <a className="button-secondary" href={getAssetUrl(ticket.serviceSheet.pdfUrl)} target="_blank" rel="noreferrer">
                        Hoja de servicio (PDF)
                      </a>
                    )}
                    <button className="button-secondary" type="button" onClick={() => handleTicketReport(ticket.id)}>
                      Exportar ticket (PDF)
                    </button>
                  </div>
                  <div className={styles.grid140}>
                    {(ticket.evidencias || []).map((ev) => (
                      <div key={ev.id} className={`card ${styles.cardSoft}`} style={{ padding: 8 }}>
                        {ev.archivoUrl.endsWith(".pdf") ? (
                          <object data={getAssetUrl(ev.archivoUrl)} type="application/pdf" width="100%" height="140">
                            <embed src={getAssetUrl(ev.archivoUrl)} type="application/pdf" />
                          </object>
                        ) : (
                          <img src={getAssetUrl(ev.archivoUrl)} alt={ev.tipoEvidencia} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8 }} />
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{ev.tipoEvidencia}</div>
                      </div>
                    ))}
                  </div>
                  {arrivalEvidenceFor(ticket)?.latitud && arrivalEvidenceFor(ticket)?.longitud && (
                    <iframe
                      title={`arrival-${ticket.id}`}
                      src={`https://maps.google.com/maps?q=${arrivalEvidenceFor(ticket)?.latitud},${arrivalEvidenceFor(ticket)?.longitud}&z=15&output=embed`}
                      width="100%"
                      height="200"
                      style={{ border: 0, borderRadius: 12 }}
                      loading="lazy"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {activeTab === "nuevo" && (
            <div className={styles.sectionStack}>
              <div className={`card ${styles.cardSoft}`}>
                <p className={styles.sectionTitle}>Nueva solicitud</p>
                <p className={styles.sectionSubtitle}>Elige el tipo de flujo y selecciona la ubicación del servicio.</p>
                <div className={styles.grid200}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Tipo de solicitud</label>
                    <select
                      className="input"
                      value={requestDraft.requestType}
                      onChange={(e) => setRequestDraft((prev) => ({ ...prev, requestType: e.target.value as "ISSUE" | "PREVENTIVE_INVENTORY" }))}
                    >
                      <option value="ISSUE">Ticket por problema</option>
                      <option value="PREVENTIVE_INVENTORY">Mantenimiento preventivo e inventario</option>
                    </select>
                  </div>
                </div>
                <div className={styles.grid200}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Sucursal existente</label>
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
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Urgencia</label>
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
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Fecha limite</label>
                    <input
                      className="input"
                      type="date"
                      value={requestDraft.dueAt}
                      onChange={(e) => setRequestDraft((prev) => ({ ...prev, dueAt: e.target.value }))}
                    />
                  </div>
                </div>
                <div className={styles.grid200}>
                  <input
                    className="input"
                    placeholder="Nombre de la sucursal"
                    value={requestDraft.branchName}
                    onChange={(e) => setRequestDraft((prev) => ({ ...prev, branchName: e.target.value }))}
                  />
                  <input
                    className="input"
                    placeholder="Número de sucursal"
                    value={requestDraft.branchNumber}
                    onChange={(e) => setRequestDraft((prev) => ({ ...prev, branchNumber: e.target.value }))}
                  />
                  <input
                    className="input"
                    placeholder="Ciudad"
                    value={requestDraft.city}
                    onChange={(e) => setRequestDraft((prev) => ({ ...prev, city: e.target.value }))}
                  />
                  <input
                    className="input"
                    placeholder="Estado"
                    value={requestDraft.state}
                    onChange={(e) => setRequestDraft((prev) => ({ ...prev, state: e.target.value }))}
                  />
                </div>
                <input
                  className="input"
                  placeholder="Dirección"
                  value={requestDraft.address}
                  onChange={(e) => setRequestDraft((prev) => ({ ...prev, address: e.target.value }))}
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder={requestDraft.requestType === "PREVENTIVE_INVENTORY" ? "Descripción del mantenimiento e inventario a ejecutar" : "Descripción del problema"}
                  value={requestDraft.description}
                  onChange={(e) => setRequestDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
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
                <div className={styles.actionRow}>
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
                      <a href={getMapsUrl(request.latitud, request.longitud)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Ver ubicación</a>
                    )}
                    {request.latitud && request.longitud && (
                      <iframe
                        title={`request-${request.id}`}
                        src={`https://maps.google.com/maps?q=${request.latitud},${request.longitud}&z=15&output=embed`}
                        width="100%"
                        height="160"
                        style={{ border: 0, borderRadius: 12 }}
                        loading="lazy"
                      />
                    )}
                    {Array.isArray(request.evidenceUrls) && request.evidenceUrls.length > 0 && (
                      <div className={styles.grid120}>
                        {request.evidenceUrls.map((url, idx) => (
                          <div key={`${request.id}-${idx}`} className={styles.mediaTile}>
                            {url.toLowerCase().endsWith(".pdf") ? (
                              <object data={getAssetUrl(url)} type="application/pdf" width="100%" height="120">
                                <embed src={getAssetUrl(url)} type="application/pdf" />
                              </object>
                            ) : (
                              <img src={getAssetUrl(url)} alt="evidencia" className={styles.mediaImg} />
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
                {session.client.logoUrl && (
                  <img src={getAssetUrl(session.client.logoUrl)} alt={session.client.name} className={styles.heroLogo} />
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
                    clientLogoUrl={profile?.logoUrl || session.client.logoUrl || null}
                    companyLogoUrl={profile?.logoUrl || null}
                    apiUrl={API_URL}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


