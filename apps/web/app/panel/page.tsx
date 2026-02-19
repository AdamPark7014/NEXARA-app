'use client';

import { useEffect } from "react";
import { useUser } from "@/components/UserContext";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useRouter } from "next/navigation";

export default function PanelRedirect() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) {
      router.replace("/panel/dashboard");
      return;
    }
    if (hasPermission(user, PERMISSIONS.PANEL_WEB)) {
      router.replace("/panel/web");
      return;
    }
    if (hasPermission(user, PERMISSIONS.PANEL_VENTAS)) {
      router.replace("/panel/ventas");
      return;
    }
    if (hasAnyPermission(user, [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN])) {
      router.replace("/panel/console");
      return;
    }
  }, [user, router]);

  return null;
}
