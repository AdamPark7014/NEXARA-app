"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { setActivePanel } from "@/lib/panel-routing";

export default function VentasIndex() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    setActivePanel("ventas");
    router.replace("/dashboard");
  }, [router, user]);

  return null;
}
