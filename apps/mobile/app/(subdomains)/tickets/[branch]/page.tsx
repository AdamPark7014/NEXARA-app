"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getAccessiblePanels } from "@/lib/panel-routing";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import TicketsInventoryManager from "@/components/TicketsInventoryManager";
import consoleStyles from "../../console/console.module.css";
import styles from "../tickets.module.css";

type BranchSession = {
  token: string;
  branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null };
};

type BranchProfile = {
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
  client?: { name?: string | null } | null;
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

export default function BranchTicketsPage() {
  const { user, logout } = useUser();
  const canAccessTicketsPanel = Boolean(user && getAccessiblePanels(user).some((panel) => panel.key === "tickets"));
  const [session, setSession] = useState<BranchSession | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<BranchProfile | null>(null);
  const [requests, setRequests] = useState<BranchRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"request" | "inventories">("request");
  const [files, setFiles] = useState<{ file: File; url: string; kind: "image" | "pdf" }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
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
    if (url.startsWith("http")) return url;
    const base = API_URL.replace(/\/+api\/?$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("branchSession") : null;
    if (saved) setSession(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessTicketsPanel) {
      router.replace("/paneles");
      return;
    }
    if (session) return;

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
  }, [branchSlug, canAccessTicketsPanel, router, session, user]);

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

  useEffect(() => {
    if (!session?.token) return;
    fetchProfile(session.token);
    fetchRequests(session.token);
  }, [session?.token]);

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
            style={{ zIndex: 12001 }}
          ></div>
        )}

        {(!isMobile || mobileMenuOpen) && (
        <div
          className={consoleStyles.sidebarContent}
          id="tickets-branch-sidebar-menu"
          data-open={isMobile && mobileMenuOpen ? "true" : undefined}
          style={
            isMobile && mobileMenuOpen
              ? {
                  position: "fixed",
                  top: "64px",
                  left: "8px",
                  right: "8px",
                  zIndex: 12002,
                  display: "flex",
                  opacity: 1,
                  visibility: "visible",
                  transform: "translateY(0) scale(1)",
                  pointerEvents: "auto",
                }
              : undefined
          }
        >
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Sucursal</span>
        </div>
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            <span className={consoleStyles.sidebarName}>{(profile?.name || session.branch.name).slice(0, 2).toUpperCase()}</span>
          </div>
          <div className={consoleStyles.sidebarName}>{profile?.name || session.branch.name}</div>
          <div className={consoleStyles.sidebarEmail}>{profile?.client?.name || session.branch.clientName || "Cliente corporativo"}</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Sucursal</span>
          </div>
        </div>
        <div className={consoleStyles.menuTitle}>Servicio y solicitudes</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${activeTab === "request" ? consoleStyles.active : ""}`}
              onClick={() => {
                setActiveTab("request");
                setMobileMenuOpen(false);
              }}
            >
              Nueva solicitud
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
              Inventarios
            </button>
          </li>
        </ul>

        <div className={consoleStyles.menuTitle}>Sesión</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <button type="button" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`} onClick={handleLogout}>
              Cerrar sesión
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
            <button type="button" className={`${styles.panelTab} ${activeTab === "request" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("request")}>Nueva solicitud</button>
            <button type="button" className={`${styles.panelTab} ${activeTab === "inventories" ? styles.panelTabActive : ""}`} onClick={() => setActiveTab("inventories")}>Inventarios</button>
          </div>

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
          <div className={`card ${styles.cardSoft}`}>
            <p className={styles.sectionTitle}>Registrar solicitud</p>
            <div className={styles.mutedText}>
              Sucursal: {profile?.name || session.branch.name} {profile?.branchNumber ? `(${profile.branchNumber})` : ""}
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder={draft.requestType === "PREVENTIVE_INVENTORY" ? "Describe el alcance del mantenimiento e inventario" : "Describe el problema o requerimiento"}
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
            <div className={styles.grid200}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Tipo de solicitud</label>
                <select className="input" value={draft.requestType} onChange={(e) => setDraft((prev) => ({ ...prev, requestType: e.target.value as "ISSUE" | "PREVENTIVE_INVENTORY" }))}>
                  <option value="ISSUE">Ticket por problema</option>
                  <option value="PREVENTIVE_INVENTORY">Mantenimiento e inventario</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Urgencia</label>
                <select className="input" value={draft.urgency} onChange={(e) => setDraft((prev) => ({ ...prev, urgency: e.target.value }))}>
                  <option value="Baja">Baja</option>
                  <option value="Media">Media</option>
                  <option value="Alta">Alta</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Fecha limite</label>
                <input className="input" type="date" value={draft.dueAt} onChange={(e) => setDraft((prev) => ({ ...prev, dueAt: e.target.value }))} />
              </div>
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
              <div className={styles.mutedText} style={{ marginBottom: 8 }}>
                Arrastra tus archivos aqui o
              </div>
              <label htmlFor="branch-evidence-file" className="button-secondary" style={{ cursor: "pointer" }}>
                Seleccionar archivo
              </label>
              <div className={styles.mutedText} style={{ marginTop: 8 }}>
                {files.length > 0 ? `${files.length} archivo(s) seleccionados` : "Ningún archivo seleccionado"}
              </div>
            </div>
            {files.length > 0 && (
              <div className={styles.cardSoft} style={{ gap: 10 }}>
                <div className={styles.previewGrid}>
                  {files.map((entry, index) => (
                    <div
                      key={`${entry.file.name}-${index}`}
                      className={`${styles.previewTile} ${entry.kind === "pdf" ? styles.previewTilePdf : ""}`}
                    >
                      {entry.kind === "image" ? (
                        <img src={entry.url} alt={entry.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            <div className={styles.actionRow}>
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
              </div>
            ))}
          </div>
          </>
          )}
        </div>
      </main>
    </div>
  );
}
