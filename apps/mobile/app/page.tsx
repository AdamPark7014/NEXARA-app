"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";

export default function RootEntryPage() {
  const router = useRouter();
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;

    if (typeof window !== "undefined") {
      const branchSessionRaw = window.sessionStorage.getItem("branchSession");
      if (branchSessionRaw) {
        try {
          const branchSession = JSON.parse(branchSessionRaw) as { branch?: { id?: number; branchNumber?: string | null } };
          const branchSlug = branchSession.branch?.branchNumber || (branchSession.branch?.id ? `branch-${branchSession.branch.id}` : null);
          if (branchSlug) {
            router.replace(`/tickets/${branchSlug}`);
            return;
          }
        } catch {
          window.sessionStorage.removeItem("branchSession");
        }
      }

      const clientSessionRaw = window.sessionStorage.getItem("clientSession");
      if (clientSessionRaw) {
        router.replace("/tickets");
        return;
      }
    }

    if (user) {
      router.replace("/paneles");
      return;
    }
    router.replace("/login");
  }, [router, user, isContextReady]);

  return null;
}
