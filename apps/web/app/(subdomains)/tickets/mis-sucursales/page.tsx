"use client";
import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import PanelLogin from "@/components/PanelLogin";
import BranchesForm, { Branch } from "../../../../components/BranchesForm";
import consoleStyles from "../../console/console.module.css";
import styles from "../tickets.module.css";

type ClientSession = {
  token: string;
  client: { id: number; name: string; logoUrl?: string | null };
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

export default function MyBranchesPage() {
  // Inicializar sesión desde sessionStorage directamente
  const [session, setSession] = useState<ClientSession | null>(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("clientSession");
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

  const getAssetUrl = (url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = getSocketBaseUrl();
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  // Marcar como mounted después del primer render en el cliente
  useEffect(() => {
    setMounted(true);
  }, []);

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

  const fetchProfile = async (token: string) => {
    try {
      const res = await fetch(buildApiUrl("client-portal/profile"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (data) {
        setProfile(data);
        setBranches(Array.isArray(data.branches) ? data.branches : []);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchProfile(session.token);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ["websocket"] });
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "ServiceClientBranch" || payload?.model === "ServiceClient") {
        fetchProfile(session.token);
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

  const handleLogout = () => {
    window.sessionStorage.removeItem("clientSession");
    window.sessionStorage.removeItem("branchSession");
    setSession(null);
    setProfile(null);
    setBranches([]);
    window.location.replace("/tickets");
  };

  // No renderizar nada hasta que el componente esté mounted (evita hydration mismatch)
  if (!mounted) {
    return null;
  }

  if (!session) {
    return (
      <div className={styles.authWrap}>
        <PanelLogin
          mode="client"
          redirectTo="mis-sucursales"
          onClientLogin={handleClientLogin}
          title="Mis sucursales"
          subtitle="Administra las sucursales de tu empresa desde un solo lugar"
        />
      </div>
    );
  }

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.ticketsConsole}`}>
      {/* Sidebar */}
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
              aria-controls="tickets-branches-sidebar-menu"
              data-open={mobileMenuOpen ? "true" : "false"}
            >
              <span className={consoleStyles.hamburgerLine}></span>
              <span className={consoleStyles.hamburgerLine}></span>
              <span className={consoleStyles.hamburgerLine}></span>
            </button>
          )}
        </div>

        {isMobile && mobileMenuOpen && (
          <div className={consoleStyles.sidebarOverlay} onClick={() => setMobileMenuOpen(false)} role="presentation"></div>
        )}

        {(!isMobile || mobileMenuOpen) && (
        <div
          className={consoleStyles.sidebarContent}
          id="tickets-branches-sidebar-menu"
          data-open={isMobile && mobileMenuOpen ? "true" : undefined}
        >
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Portal</span>
        </div>

        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            {session.client.logoUrl ? (
              <img
                className={consoleStyles.avatarImage}
                src={getAssetUrl(session.client.logoUrl)}
                alt={session.client.name}
                width={64}
                height={64}
              />
            ) : (
              <span className={consoleStyles.sidebarName}>{session.client.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className={consoleStyles.sidebarName}>{session.client.name}</div>
          <div className={consoleStyles.sidebarEmail}>Administración de sucursales</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Cliente</span>
          </div>
        </div>

        <div className={consoleStyles.menuTitle}>Cuenta corporativa</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <a href="..?tab=profile" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}>
              Mi perfil corporativo
            </a>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <a href="." className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${consoleStyles.active}`}>
              Gestión de sucursales
            </a>
          </li>
        </ul>

        <div className={consoleStyles.menuTitle}>Servicio y solicitudes</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <a href="..?tab=tickets" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}>
              Estado de tickets
            </a>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <a href="..?tab=new-ticket" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}>
              Nueva solicitud
            </a>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <a href="..?tab=profile" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`}>
              Perfil corporativo
            </a>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <a href="." className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${consoleStyles.active}`}>
              Mis sucursales
            </a>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button type="button" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`} onClick={handleLogout}>
              Cerrar sesión
            </button>
          </li>
        </ul>
        </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={consoleStyles.consoleMain}>
        <div className={styles.sectionStack} style={{ gap: 24 }}>
          {/* Header Card */}
          <div className={`card ${styles.gradientHeader}`}>
            <div className={styles.headerSplit}>
              <div>
                <h1 style={{ margin: "0 0 4px 0", fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>Mis sucursales</h1>
                <p className={styles.mutedText} style={{ margin: 0, fontSize: 13 }}>
                  Administra todas las sucursales de tu empresa en una vista centralizada
                </p>
              </div>
              {profile && (
                <div className={styles.companyBox}>
                  <div className={styles.mutedText}>Empresa</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{profile.name}</div>
                  <div className={styles.mutedText}>
                    Contacto: {profile.contactName || "-"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              style={{
                padding: 12,
                background: "rgba(255, 76, 76, 0.1)",
                border: "1px solid rgba(255, 76, 76, 0.3)",
                borderRadius: 8,
                color: "var(--error)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* BranchesForm Component */}
          <BranchesForm
            token={session.token}
            branches={branches}
            onBranchSaved={() => fetchProfile(session.token)}
            clientLogoUrl={profile?.logoUrl}
            companyLogoUrl={session.client.logoUrl}
            apiUrl={API_URL}
          />

          {/* Stats Card */}
          {branches.length > 0 && (
            <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid rgba(76, 175, 80, 0.2)" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Sucursales activas</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#4caf50" }}>
                  {branches.filter((b) => b.isActive !== false).length}
                </div>
              </div>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid rgba(255, 76, 76, 0.2)" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Sucursales inactivas</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#ff4c4c" }}>
                  {branches.filter((b) => b.isActive === false).length}
                </div>
              </div>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid rgba(31,137,252, 0.2)" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Total de sucursales</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{branches.length}</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
