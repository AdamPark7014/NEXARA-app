"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [darkMode, setDarkMode] = useState(false);

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

  // Always start in light mode on each load.
  useEffect(() => {
    setDarkMode(false);
    syncDarkClass(false);
  }, []);

  // Sync class on change
  useEffect(() => {
    syncDarkClass(darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
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
