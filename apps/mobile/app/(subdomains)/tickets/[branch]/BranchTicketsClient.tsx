"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import { getApiAssetOrigin } from "@/lib/api-base";
import { getAccessiblePanels } from "@/lib/panel-routing";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import TicketsInventoryManager from "@/components/TicketsInventoryManager";
import consoleStyles from "../../console/console.module.css";
import styles from "../tickets.module.css";

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
};

export default function BranchTicketsPage() {
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const canAccessTicketsPanel = Boolean(user && getAccessiblePanels(user).some((panel) => panel.key === "tickets"));
  const [session, setSession] = useState<BranchSession | null>(null);
  const [hasCheckedStoredSession, setHasCheckedStoredSession] = useState(false);
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

  const requestStats = {
    total: requests.length,
    pending: requests.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return status.includes('PEND') || status.includes('PROCES') || status.includes('ASIGN');
    }).length,
    completed: requests.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return status.includes('FINAL') || status.includes('CERR') || status.includes('COMPLET');
    }).length,
    evidences: requests.reduce((acc, item) => acc + (Array.isArray(item.evidenceUrls) ? item.evidenceUrls.length : 0), 0),
  };
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
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (parsed.pathname.startsWith("/uploads/")) {
          return `${base}${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // Keep original URL if parsing fails.
      }
      return raw;
    }

    return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
  };
  const branchAvatarUrl = profile?.logoUrl || profile?.client?.logoUrl || session?.branch?.logoUrl || "";

  useEffect(() => {
    setAvatarLoadError(false);
  }, [branchAvatarUrl]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("branchSession") : null;
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch {
        window.sessionStorage.removeItem("branchSession");
      }
    }
    setHasCheckedStoredSession(true);
  }, []);

  useEffect(() => {
    if (!hasCheckedStoredSession) return;
    if (session) return;

    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessTicketsPanel) {
      router.replace("/paneles");
      return;
    }

    const unifiedSession: BranchSession = {
      token: user.token,
      branch: {
        id: user.id,
        name: user.nombre || user.email,
        branchNumber: branchSlug || null,
        clientId: user.id,
        clientName: user.nombre || user.email,
      },
    };
    setSession(unifiedSession);
    window.sessionStorage.setItem("branchSession", JSON.stringify(unifiedSession));
  }, [branchSlug, canAccessTicketsPanel, hasCheckedStoredSession, router, session, user]);

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
      setError("No se pudo generar el reporte del ticket");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-ticket-${ticketId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!session?.branch) return;
    const expectedSlug = session.branch.branchNumber || `branch-${session.branch.id}`;
    if (branchSlug && branchSlug !== expectedSlug) {
      router.replace(`/${expectedSlug}`);
    }
  }, [branchSlug, router, session?.branch]);

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
    setSession(null);
    logout();
    router.replace("/login");
  };

  if (!session) {
    return null;
  }

  const activeViewInfo = {
    profile: {
      title: "Perfil de sucursal",
      subtitle: "Consulta la identidad y la informacion base del punto operativo.",
    },
    tickets: {
      title: "Mis tickets",
      subtitle: "Revisa avances, hojas de servicio y tickets exportables.",
    },
    request: {
      title: "Nueva solicitud",
      subtitle: "Crea un ticket o mantenimiento con evidencia y ubicacion precisa.",
    },
    inventories: {
      title: "Inventarios",
      subtitle: "Valida snapshots, mantenimientos e historial de inventario.",
    },
  }[activeTab];

  const branchBottomNavItems = [
    {
      icon: "🎫",
      label: "Tickets",
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
        setActiveTab("request");
        setMobileMenuOpen(false);
      },
      active: activeTab === "request",
    },
    {
      icon: "🧰",
      label: "Invent.",
      onPress: () => {
        setActiveTab("inventories");
        setMobileMenuOpen(false);
      },
      active: activeTab === "inventories",
    },
    {
      icon: "👤",
      label: "Perfil",
      onPress: () => {
        setActiveTab("profile");
        setMobileMenuOpen(false);
      },
      active: activeTab === "profile",
    },
    {
      icon: mobileMenuOpen ? "✕" : "☰",
      label: "Menu",
      onPress: () => setMobileMenuOpen((prev) => !prev),
      active: mobileMenuOpen,
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
            <span className={consoleStyles.brandSub}>Sucursal</span>
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

        {(!isMobile || mobileMenuOpen) && (
        <div
          className={consoleStyles.sidebarContent}
          id="tickets-branch-sidebar-menu"
          data-open={isMobile && mobileMenuOpen ? "true" : undefined}
        >
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.superadminAvatarWrap}>
            {branchAvatarUrl && !avatarLoadError ? (
              <img
                className={`${consoleStyles.avatarImage} ${consoleStyles.avatarImageLogo}`}
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
          {isMobile && (
            <div className={styles.mobileAppChrome}>
              <div className={styles.mobileTopbar}>
                <div className={styles.mobileTopbarContent}>
                  <p className={styles.mobileEyebrow}>Sucursal conectada</p>
                  <h1 className={styles.mobileTitle}>{activeViewInfo.title}</h1>
                  <p className={styles.mobileSubtitle}>{activeViewInfo.subtitle}</p>
                </div>
                <button
                  type="button"
                  className={styles.mobileMenuButton}
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
                  aria-expanded={mobileMenuOpen}
                  aria-controls="tickets-branch-sidebar-menu"
                >
                  {mobileMenuOpen ? "✕" : "☰"}
                </button>
              </div>

              <div className={styles.mobileIdentityCard}>
                <div className={styles.mobileIdentityRow}>
                  <div className={styles.mobileIdentityAvatar}>
                    {branchAvatarUrl && !avatarLoadError ? (
                      <img
                        src={getAssetUrl(branchAvatarUrl)}
                        alt={profile?.name || session.branch.name}
                        className={styles.mobileIdentityAvatarImage}
                      />
                    ) : (
                      <span>{(profile?.name || session.branch.name).slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className={styles.mobileIdentityMeta}>
                    <div className={styles.mobileIdentityName}>{profile?.name || session.branch.name}</div>
                    <div className={styles.mobileIdentityHint}>{profile?.client?.name || session.branch.clientName || "Cliente corporativo"}</div>
                  </div>
                </div>
                <div className={styles.mobilePillRow}>
                  <span className={styles.mobilePill}>Sucursal</span>
                  <span className={styles.mobilePill}>{requestStats.pending} en proceso</span>
                  <span className={styles.mobilePill}>{requestStats.evidences} evidencias</span>
                </div>
                <div className={styles.mobileMetricsRow}>
                  <div className={styles.mobileMetric}>
                    <span className={styles.mobileMetricValue}>{requestStats.total}</span>
                    <span className={styles.mobileMetricLabel}>Solicitudes</span>
                  </div>
                  <div className={styles.mobileMetric}>
                    <span className={styles.mobileMetricValue}>{tickets.length}</span>
                    <span className={styles.mobileMetricLabel}>Tickets</span>
                  </div>
                  <div className={styles.mobileMetric}>
                    <span className={styles.mobileMetricValue}>{requestStats.completed}</span>
                    <span className={styles.mobileMetricLabel}>Cerradas</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={`card ${styles.panelHero} ${styles.nativeHero}`}>
            <div className={styles.heroHeadingRow}>
              <div className={styles.heroTitleBlock}>
                <p className={styles.heroEyebrow}>Portal operativo</p>
                <h1 className={styles.heroTitle}>Portal de tickets de sucursal</h1>
                <p className={styles.heroLead}>
                  Sucursal: {profile?.name || session.branch.name} · Registra solicitudes y da seguimiento al inventario de mantenimiento.
                </p>
              </div>
              <div className={styles.heroBadgeRow}>
                <span className={styles.heroBadge}>Operacion local</span>
                <span className={styles.heroBadge}>Flujo nativo</span>
              </div>
            </div>
            <div className={styles.heroMetricGrid}>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{requestStats.total}</span><span className={styles.heroMetricLabel}>Solicitudes</span></div>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{requestStats.pending}</span><span className={styles.heroMetricLabel}>En proceso</span></div>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{requestStats.completed}</span><span className={styles.heroMetricLabel}>Completadas</span></div>
              <div className={styles.heroMetricCard}><span className={styles.heroMetricValue}>{requestStats.evidences}</span><span className={styles.heroMetricLabel}>Evidencias</span></div>
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
                      <a className="button-secondary" href={getAssetUrl(ticket.serviceSheet.pdfUrl)} target="_blank" rel="noreferrer">
                        Hoja de servicio (PDF)
                      </a>
                    )}
                    <button className="button-secondary" type="button" onClick={() => handleTicketReport(ticket.id)}>
                      Exportar ticket (PDF)
                    </button>
                  </div>
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
            {requests.length === 0 && <div className={styles.mutedText}>No hay solicitudes registradas aún.</div>}
            {requests.map((request) => (
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
                            <a className="button-secondary" href={getAssetUrl(url)} target="_blank" rel="noreferrer">
                              Abrir PDF
                            </a>
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
      {isMobile && <BottomNav items={branchBottomNavItems} />}
      {showPdfModal && pdfUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPdfModal(false)}
        >
          <div
            style={{ background: "var(--surface, #fff)", borderRadius: 12, width: "100%", maxWidth: 980, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600 }}>Reporte de tickets de sucursal</span>
              <button onClick={() => setShowPdfModal(false)} style={{ padding: "6px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>✕ Cerrar</button>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              <PDFViewer
                pdfUrl={pdfUrl}
                pdfData={pdfData}
                fileName={`reporte-sucursal-${new Date().toISOString().slice(0, 10)}.pdf`}
                height="800px"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
