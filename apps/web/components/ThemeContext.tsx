"use client";
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
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

  // Solo sincronizar <body> cuando el usuario usa el toggle (no pisar rutas públicas).
  useEffect(() => {
    if (!hasUserThemePreference.current) return;
    syncDarkClass(darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    hasUserThemePreference.current = true;
    setDarkMode((prev) => !prev);
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
