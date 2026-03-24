"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from '@/components/UserContext';
import { setActivePanel } from "@/lib/panel-routing";


export default function ConsolePanel() {
  const router = useRouter();
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    setActivePanel("console");
    router.replace("/console/dashboard");
  }, [router, user, isContextReady]);
  return null;
}
