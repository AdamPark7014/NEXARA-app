"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getAccessiblePanels, setActivePanel } from "@/lib/panel-routing";
import styles from "./page.module.css";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dias";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

export default function PanelHubPage() {
  const router = useRouter();
  const { user, logout } = useUser();
  const [now, setNow] = useState<Date>(() => new Date());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [router, user]);

  const panels = useMemo(() => getAccessiblePanels(user), [user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredPanels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return panels;
    return panels.filter((panel) => {
      const haystack = `${panel.name} ${panel.description}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [panels, query]);

  useEffect(() => {
    if (!user) return;
    if (panels.length !== 1) return;

    const singlePanel = panels[0];
    setActivePanel(singlePanel.key);
    router.replace(singlePanel.entryPath);
  }, [panels, router, user]);

  if (!user) {
    return null;
  }

  const handleEnterPanel = (panelKey: "console" | "ventas" | "contabilidad" | "web" | "tickets", entryPath: string) => {
    setActivePanel(panelKey);
    router.push(entryPath);
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>NEXARA APP</p>
        <h1 className={styles.title}>
          {getGreeting()}, {user.nombre}
        </h1>
        <p className={styles.subtitle}>Tu jornada está lista. El día de hoy, ¿a qué panel deseas ingresar?</p>
        <div className={styles.metaRow}>
          <span>{now.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" })}</span>
          <span>{now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>
      </header>

      {panels.length === 0 ? (
        <div className={styles.empty}>
          Tu cuenta no tiene paneles habilitados por el momento. Contacta a superadministracion para asignar permisos.
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`input ${styles.search}`}
              placeholder="Buscar panel por nombre"
            />
            <span className={styles.counter}>{filteredPanels.length} panel(es)</span>
          </div>
          <div className={styles.grid}>
          {filteredPanels.map((panel) => (
            <article key={panel.key} className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}><span className={styles.cardIcon}>{panel.icon}</span>{panel.name}</h2>
                <span className={styles.pill}>Disponible</span>
              </div>
              <p className={styles.cardDescription}>{panel.description}</p>
              <button
                type="button"
                className="button-primary"
                onClick={() => handleEnterPanel(panel.key, panel.entryPath)}
              >
                Entrar a {panel.name}
              </button>
            </article>
          ))}
          </div>
          {filteredPanels.length === 0 && (
            <div className={styles.empty}>
              No hay paneles que coincidan con tu búsqueda.
            </div>
          )}
        </>
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
