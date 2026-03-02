"use client";
export const dynamic = "force-dynamic";
import { useUser } from '@/components/UserContext';
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Dashboard from "@/app/components/Dashboard"; // Importación directa de Dashboard

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace("/dashboard/login");
    }
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) return null;
  return <Dashboard />;
}
