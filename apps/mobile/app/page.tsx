"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getAccessiblePanels, setActivePanel } from "@/lib/panel-routing";

export default function RootEntryPage() {
  const router = useRouter();
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;
    if (user) {
      const accessiblePanels = getAccessiblePanels(user);
      if (accessiblePanels.length === 1) {
        const singlePanel = accessiblePanels[0];
        setActivePanel(singlePanel.key);
        router.replace(singlePanel.entryPath);
        return;
      }
      router.replace("/paneles");
      return;
    }
    router.replace("/login");
  }, [router, user, isContextReady]);

  return null;
}
