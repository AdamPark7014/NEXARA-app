"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";

export default function RootEntryPage() {
  const router = useRouter();
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;
    if (user) {
      router.replace("/paneles");
      return;
    }
    router.replace("/login");
  }, [router, user, isContextReady]);

  return null;
}
