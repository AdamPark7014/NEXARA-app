"use client";
export const dynamic = "force-dynamic";
import { useUser } from '@/components/UserContext';
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Dashboard from "@/app/components/Dashboard"; // Importación directa de Dashboard

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      console.log("[DASHBOARD] Usuario no presente, redirigiendo a login");
      router.replace("/dashboard/login");
    } else {
      console.log("[DASHBOARD] Usuario presente:", user);
    }
  }, [user, router]);

  if (!user) return null;
  return <Dashboard />;
}
