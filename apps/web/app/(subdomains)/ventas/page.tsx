"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { isSalesManagerUser } from "@/lib/panel-user";

export default function VentasIndex() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }

    if (isSalesManagerUser(user)) {
      router.replace("/gestion-vendedores");
      return;
    }

    router.replace("/my-profile");
  }, [router, user]);

  return null;
}
