 "use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from '@/components/UserContext';


export default function ConsolePanel() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/panel/console/dashboard/login");
  }, [router]);
  return null;
}
