"use client";

import { installOfflineFetchGlobal } from "@/lib/install-offline-fetch";
import { traducirFallosDeRed } from "@/lib/red-caida";
import { ThemeProvider } from "../components/ThemeContext";
import { UserProvider } from "../components/UserContext";

if (typeof window !== "undefined") {
  installOfflineFetchGlobal();
  // Sin red, cada pantalla enseñaba «Failed to fetch»: aquí se vuelve una frase clara para todas.
  traducirFallosDeRed();
}
import LoginWelcomeBanner from "../components/LoginWelcomeBanner";
import OfflineNetworkBanner from "../components/OfflineNetworkBanner";
import OfflineQueueFlusher from "../components/OfflineQueueFlusher";
import ServiceWorkerHeadsUpPrep from "../components/ServiceWorkerHeadsUpPrep";
import WebAppBadgeSync from "../components/WebAppBadgeSync";
import WebPushConsentBanner from "../components/WebPushConsentBanner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <OfflineNetworkBanner />
        <OfflineQueueFlusher />
        <ServiceWorkerHeadsUpPrep />
        <WebAppBadgeSync />
        <WebPushConsentBanner />
        <LoginWelcomeBanner />
        {children}
      </ThemeProvider>
    </UserProvider>
  );
}
