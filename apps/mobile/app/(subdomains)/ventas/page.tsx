"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { setActivePanel } from "@/lib/panel-routing";
import { isSalesManagerUser } from "@/lib/panel-user";

export default function VentasIndex() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    setActivePanel("ventas");

    if (isSalesManagerUser(user)) {
      router.replace("/ventas/gestion-vendedores");
      return;
    }

    router.replace("/ventas/my-profile");
  }, [router, user]);

  return null;
}
