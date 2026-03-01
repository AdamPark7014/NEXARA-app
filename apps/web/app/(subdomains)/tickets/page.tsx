"use client";
import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import PanelLogin from "@/components/PanelLogin";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import consoleStyles from "../console/console.module.css";
import styles from "./tickets.module.css";

type ClientSession = {
  token: string;
  client: { id: number; name: string; logoUrl?: string | null };
};

type BranchSession = {
  token: string;
  branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null };
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
};

type TicketRequest = {
  id: number;
  description: string;
  urgency: string;
  status: string;
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
  // Inicializar sesión desde sessionStorage directamente
  const [session, setSession] = useState<ClientSession | null>(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("clientSession");
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [mounted, setMounted] = useState(false);
  const [loginMode, setLoginMode] = useState<"client" | "branch">("client");
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "nuevo" | "perfil">("tickets");
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
      } else if (tabParam === "profile") {
        setActiveTab("perfil");
      }
    }
  }, []);

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
      fetchTickets(session.token);
      fetchProfile(session.token);
      fetchRequests(session.token);
      fetchPendingFeedback(session.token);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ["websocket"] });
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

  const handleClientLogin = (data: { access_token: string; client: { id: number; name: string; logoUrl?: string | null } }) => {
    const nextSession = { token: data.access_token, client: data.client };
    window.sessionStorage.setItem("clientSession", JSON.stringify(nextSession));
    setSession(nextSession);
    setError(null);
  };

  const handleBranchLogin = (data: { access_token: string; branch: BranchSession["branch"] }) => {
    const nextSession: BranchSession = { token: data.access_token, branch: data.branch };
    window.sessionStorage.setItem("branchSession", JSON.stringify(nextSession));
    setError(null);
    const slug = data.branch.branchNumber || `branch-${data.branch.id}`;
    window.location.replace(`/${slug}`);
  };

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const aDate = a.fechaAsignacion || a.fechaInicio || a.fechaFinalizacion || "";
      const bDate = b.fechaAsignacion || b.fechaInicio || b.fechaFinalizacion || "";
      return bDate.localeCompare(aDate);
    });
  }, [tickets]);

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
    setSession(null);
    setTickets([]);
    setProfile(null);
    setBranches([]);
    setRequests([]);
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
      setError("Describe el problema para levantar el ticket");
      return;
    }
    const payload = {
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
    return (
      <div className={styles.authWrap}>
        <div className={styles.authSwitch}>
          <button
            className={loginMode === "client" ? "button-primary" : "button-secondary"}
            type="button"
            onClick={() => setLoginMode("client")}
          >
            Cliente
          </button>
          <button
            className={loginMode === "branch" ? "button-primary" : "button-secondary"}
            type="button"
            onClick={() => setLoginMode("branch")}
          >
            Sucursal
          </button>
        </div>
        {loginMode === "client" ? (
          <PanelLogin
            mode="client"
            redirectTo="/"
            onClientLogin={handleClientLogin}
            title="Portal de Tickets"
            subtitle="Ingresa con tu cuenta de cliente"
          />
        ) : (
          <PanelLogin
            mode="branch"
            redirectTo="/"
            onBranchLogin={handleBranchLogin}
            title="Portal de sucursal"
            subtitle="Acceso para levantar tickets de tu tienda"
          />
        )}
      </div>
    );
  }

  return (
    <div className={consoleStyles.consoleLayout}>
      <aside className={consoleStyles.sidebar}>
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Portal</span>
        </div>
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            {session.client.logoUrl ? (
              <img className={consoleStyles.avatarImage} src={getAssetUrl(session.client.logoUrl)} alt={session.client.name} width={64} height={64} />
            ) : (
              <span className={consoleStyles.sidebarName}>{session.client.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className={consoleStyles.sidebarName}>{session.client.name}</div>
          <div className={consoleStyles.sidebarEmail}>Portal de tickets Nexara</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Cliente</span>
          </div>
        </div>
        <div className={consoleStyles.menuTitle}>Menu cliente</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "tickets" ? consoleStyles.active : ""}`}
              onClick={() => setActiveTab("tickets")}
            >
              Tickets
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "nuevo" ? consoleStyles.active : ""}`}
              onClick={() => setActiveTab("nuevo")}
            >
              Levantar ticket
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "perfil" ? consoleStyles.active : ""}`}
              onClick={() => setActiveTab("perfil")}
            >
              Perfil
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <a
              href="mis-sucursales"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
            >
              Mis sucursales
            </a>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}
              onClick={handleLogout}
            >
              Cerrar sesion
            </button>
          </li>
        </ul>
      </aside>
      <main className={consoleStyles.consoleMain}>
        <div className={styles.mainStack}>
          {activeTab === "tickets" && (
            <div className={styles.sectionStack}>
              {pendingFeedback.length > 0 && (
                <div className={`card ${styles.cardPanel}`}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Confirma tu servicio</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Ayudanos a validar que todo quedo resuelto.</div>
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
                            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Calificacion (1-5)</label>
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
                            { key: "wasFriendly", label: "Atencion amable" },
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
                            Enviar encuesta
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
                    <div style={{ fontWeight: 700 }}>Tickets activos</div>
                    <div className={styles.mutedText}>Actualiza en tiempo real conforme se suben evidencias.</div>
                  </div>
                  <div className={styles.mutedText}>{loading ? "Sincronizando..." : "Actualizado"}</div>
                </div>
                <div className={styles.grid200}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Rango del reporte</label>
                    <select className="input" value={reportRange} onChange={(e) => setReportRange(e.target.value as typeof reportRange)}>
                      <option value="today">Hoy</option>
                      <option value="7d">Ultimos 7 dias</option>
                      <option value="30d">Ultimos 30 dias</option>
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
                      Descargar reporte
                    </button>
                  </div>
                </div>
                {error && <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div>}
              </div>
              {loading && <div>cargando...</div>}
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
                        Ubicacion llegada: <a href={getMapsUrl(arrivalEvidenceFor(ticket)?.latitud, arrivalEvidenceFor(ticket)?.longitud)} target="_blank" rel="noreferrer">ver mapa</a>
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
                      Reporte del ticket (PDF)
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
                <div style={{ fontWeight: 700 }}>Levantar ticket</div>
                <div className={styles.mutedText}>Describe el problema y selecciona la ubicacion.</div>
                <div className={styles.grid200}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Sucursal existente</label>
                    <select
                      className="input"
                      value={requestDraft.branchId}
                      onChange={(e) => handleRequestBranchSelect(e.target.value)}
                    >
                      <option value="">Selecciona</option>
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
                    placeholder="Numero de sucursal"
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
                  placeholder="Direccion"
                  value={requestDraft.address}
                  onChange={(e) => setRequestDraft((prev) => ({ ...prev, address: e.target.value }))}
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Descripcion del problema"
                  value={requestDraft.description}
                  onChange={(e) => setRequestDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
                <ClientLocationPicker
                  label="Ubicacion del ticket"
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
                  <button className="button-primary" type="button" onClick={handleRequestSubmit}>Levantar ticket</button>
                  {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
                </div>
              </div>
              <div className={`card ${styles.cardSoft}`}>
                <div style={{ fontWeight: 700 }}>Tickets levantados</div>
                {requests.length === 0 && <div className={styles.mutedText}>No hay solicitudes aun.</div>}
                {requests.map((request) => (
                  <div key={request.id} className={styles.itemCard}>
                    <div className={styles.itemHeader}>
                      <strong>{request.branchName || "Ticket"}</strong>
                      <span className="badge">{request.status}</span>
                    </div>
                    <div className={styles.mutedText}>{request.description}</div>
                    <div className={styles.mutedText}>Urgencia: {request.urgency}</div>
                    {request.activity?.anNumber && (
                      <div className={styles.mutedText}>Asignado a: {request.activity.anNumber}</div>
                    )}
                    {request.latitud && request.longitud && (
                      <a href={getMapsUrl(request.latitud, request.longitud)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Ver ubicacion</a>
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
                            <button className="button-primary" type="button" onClick={() => handleDecision(request.id, "APPROVED")}>Aprobar</button>
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
          {activeTab === "perfil" && (
            <div className={styles.sectionStack}>
              <div className={`card ${styles.heroRow}`}>
                {session.client.logoUrl && (
                  <img src={getAssetUrl(session.client.logoUrl)} alt={session.client.name} className={styles.heroLogo} />
                )}
                <div>
                  <h3 style={{ margin: 0 }}>{session.client.name}</h3>
                  <p className={styles.mutedText} style={{ margin: 0 }}>Acceso exclusivo para consultar tickets y reportes.</p>
                </div>
              </div>
              <div className={`card ${styles.cardSoft}`}>
                <div style={{ fontWeight: 700 }}>Datos de contacto</div>
                <div className={styles.grid200}>
                  <input className="input" placeholder="Contacto" value={profileDraft.contactName} onChange={(e) => setProfileDraft((prev) => ({ ...prev, contactName: e.target.value }))} />
                  <input className="input" placeholder="Email" value={profileDraft.contactEmail} onChange={(e) => setProfileDraft((prev) => ({ ...prev, contactEmail: e.target.value }))} />
                  <input className="input" placeholder="Telefono" value={profileDraft.contactPhone} onChange={(e) => setProfileDraft((prev) => ({ ...prev, contactPhone: e.target.value }))} />
                  <input className="input" placeholder="Direccion" value={profileDraft.address} onChange={(e) => setProfileDraft((prev) => ({ ...prev, address: e.target.value }))} />
                  <input className="input" placeholder="Ciudad" value={profileDraft.city} onChange={(e) => setProfileDraft((prev) => ({ ...prev, city: e.target.value }))} />
                  <input className="input" placeholder="Estado" value={profileDraft.state} onChange={(e) => setProfileDraft((prev) => ({ ...prev, state: e.target.value }))} />
                  <input className="input" placeholder="Pais" value={profileDraft.country} onChange={(e) => setProfileDraft((prev) => ({ ...prev, country: e.target.value }))} />
                </div>
                <div className={styles.actionRow}>
                  <button className="button-primary" type="button" onClick={handleProfileSave}>Guardar perfil</button>
                </div>
              </div>
              <div className={`card ${styles.cardSoft}`}>
                <div style={{ fontWeight: 700 }}>Gestión de sucursales</div>
                <p className={styles.mutedText} style={{ margin: 0 }}>
                  Para crear, editar o eliminar sucursales y configurar su logo, dirígete a la sección Mis sucursales en el menú.
                </p>
                <a href="mis-sucursales" className={`button-primary ${styles.linkCta}`}>
                  Ir a Mis Sucursales
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
