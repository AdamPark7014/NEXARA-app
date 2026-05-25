"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from "@/components/UserContext";
import { setActivePanel } from "@/lib/panel-routing";

export default function OperacionPanel() {
  const router = useRouter();
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    setActivePanel("operacion");

    const hostname = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const isOperacionSubdomain = hostname.startsWith("operacion.");
    router.replace(isOperacionSubdomain ? "/dashboard" : "/operacion/dashboard");
  }, [router, user, isContextReady]);

  return null;
}
