"use client";

import { installOfflineFetchGlobal } from "@/lib/install-offline-fetch";
import { ThemeProvider } from "../components/ThemeContext";
import { UserProvider } from "../components/UserContext";

if (typeof window !== "undefined") {
  installOfflineFetchGlobal();
}
import LoginWelcomeBanner from "../components/LoginWelcomeBanner";
import OfflineQueueFlusher from "../components/OfflineQueueFlusher";
import OfflineNetworkBanner from "../components/OfflineNetworkBanner";
import ConsolePushSetup from "../components/ConsolePushSetup";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <OfflineNetworkBanner />
        <LoginWelcomeBanner />
        <ConsolePushSetup />
        <OfflineQueueFlusher />
        {children}
      </ThemeProvider>
    </UserProvider>
  );
}
