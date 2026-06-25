"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";
import { getUserAllowedPanels, getUserPanelSwitchPath } from "@/lib/user-access";
import styles from "./page.module.css";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dias";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

const getPrimaryName = (fullName?: string) => {
  if (!fullName) return "Usuario";

  const sanitized = fullName.replace(/\([^)]*\)/g, " ").trim();
  const [firstName] = sanitized.split(/\s+/);
  return firstName || "Usuario";
};

export default function PanelHubPage() {
  const router = useRouter();
  const { user, logout, isContextReady } = useUser();
  const [now, setNow] = useState<Date>(() => new Date());
  const [query, setQuery] = useState("");
  const primaryName = getPrimaryName(user?.nombre);
  const isSuperAdmin = !!user?.isSuperAdmin;
  const headerKicker = isSuperAdmin ? "NEXARA OWNER" : "NEXARA APP";
  const headerSubtitle = isSuperAdmin
    ? "Vista de dirección general. Selecciona el panel estratégico que deseas gestionar."
    : "Tu jornada está lista. Selecciona el panel en el que deseas trabajar.";

  const panels = useMemo(() => getUserAllowedPanels(user), [user]);
  const userJson = useMemo(() => (user ? JSON.stringify(user) : null), [user]);

  useEffect(() => {
    if (!isContextReady) return;
    if (!user) {
      router.replace("/login");
    }
  }, [router, user, isContextReady]);

  useEffect(() => {
    if (!isContextReady || !user) return;
    if (panels.length !== 1) return;
    const onlyPanel = panels[0];
    const url = buildCrossPanelUrl(
      onlyPanel.id,
      getUserPanelSwitchPath(user, onlyPanel.id),
      userJson,
    );
    window.location.assign(url);
  }, [isContextReady, user, panels, userJson]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredPanels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return panels;
    return panels.filter((panel) => {
      const haystack = `${panel.name} ${panel.tagline}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [panels, query]);

  if (!user) {
    return null;
  }

  if (panels.length === 1) {
    return null;
  }

  const handleEnterPanel = (panelId: typeof panels[number]["id"]) => {
    const url = buildCrossPanelUrl(
      panelId,
      getUserPanelSwitchPath(user, panelId),
      userJson,
    );
    window.location.assign(url);
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>{headerKicker}</p>
        <h1 className={styles.title}>
          {getGreeting()}, {primaryName}
        </h1>
        <p className={styles.subtitle}>{headerSubtitle}</p>
        <div className={styles.metaRow}>
          <span className={styles.metaChip}>{now.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" })}</span>
          <span className={styles.metaChip}>{now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>
      </header>

      {panels.length === 0 ? (
        <div className={styles.empty}>
          Tu cuenta no tiene paneles habilitados por el momento. Contacta a superadministración para asignar permisos.
        </div>
      ) : (
        <section className={styles.panelsSection}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionKicker}>Paneles</p>
              <h2 className={styles.sectionTitle}>Accesos disponibles</h2>
            </div>
            <span className={styles.counter}>{filteredPanels.length} paneles</span>
          </div>

          <div className={styles.toolbar}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`input ${styles.search}`}
              placeholder="Buscar panel por nombre"
            />
          </div>
          <div className={styles.grid}>
          {filteredPanels.map((panel) => (
            <article key={panel.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}><span className={styles.cardIcon}>{panel.icon}</span>{panel.name}</h2>
                <span className={styles.pill}>Disponible</span>
              </div>
              <p className={styles.cardDescription}>{panel.tagline}</p>
              <button
                type="button"
                className={styles.enterButton}
                onClick={() => handleEnterPanel(panel.id)}
              >
                Abrir panel
              </button>
            </article>
          ))}
          </div>
          {filteredPanels.length === 0 && (
            <div className={styles.empty}>
              No hay paneles que coincidan con tu búsqueda.
            </div>
          )}
        </section>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.logout}
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}
