"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";

/**
 * Tema de los paneles (Core, portales). El sitio público lleva su propio candado
 * (`PublicSiteThemeLock`, `nexara:public-theme`) y aquí no se toca.
 *
 * Rediseño v3 (21-11): la elección de modo claro u oscuro se guarda en este equipo
 * (`nexara:panel-theme`) y, si la persona nunca eligió, se sigue el modo del sistema.
 * Antes se perdía al recargar y todos volvían a claro.
 */
export const PANEL_THEME_KEY = "nexara:panel-theme";

export type PanelThemePreference = "light" | "dark" | null;

export function readPanelThemePreference(): PanelThemePreference {
  try {
    const v = window.localStorage.getItem(PANEL_THEME_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function writePanelThemePreference(value: "light" | "dark") {
  try {
    window.localStorage.setItem(PANEL_THEME_KEY, value);
  } catch {
    /* modo privado o almacenamiento bloqueado: el cambio vale para esta visita */
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
  } catch {
    return false;
  }
}

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
  /** Lo llaman los shells de panel al montarse: aplica lo guardado o el modo del sistema. */
  adoptPanelTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [darkMode, setDarkMode] = useState(false);
  /** No forzar clase en el primer paint: el sitio público aplica dark vía PublicSiteThemeLock. */
  const hasUserThemePreference = useRef(false);

  // Helper to sync class only on <body>
  const syncDarkClass = (isDark: boolean) => {
    if (typeof document !== "undefined") {
      if (isDark) {
        document.body.classList.add("dark");
        document.body.classList.remove("light");
      } else {
        document.body.classList.add("light");
        document.body.classList.remove("dark");
      }
    }
  };

  // Solo sincronizar <body> cuando el usuario usa el toggle o un panel adopta su tema
  // (no pisar rutas públicas).
  useEffect(() => {
    if (!hasUserThemePreference.current) return;
    syncDarkClass(darkMode);
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    hasUserThemePreference.current = true;
    setDarkMode((prev) => {
      const next = !prev;
      writePanelThemePreference(next ? "dark" : "light");
      return next;
    });
  }, []);

  const adoptPanelTheme = useCallback(() => {
    if (typeof window === "undefined") return;
    const saved = readPanelThemePreference();
    const dark = saved ? saved === "dark" : systemPrefersDark();
    hasUserThemePreference.current = true;
    syncDarkClass(dark);
    setDarkMode(dark);
  }, []);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, adoptPanelTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
