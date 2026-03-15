 "use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from '@/components/UserContext';
import { setActivePanel } from "@/lib/panel-routing";


export default function ConsolePanel() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    setActivePanel("console");
    router.replace("/dashboard");
  }, [router, user]);
  return null;
}
