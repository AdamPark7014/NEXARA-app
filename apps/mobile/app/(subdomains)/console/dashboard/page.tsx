"use client";
import { useUser } from '@/components/UserContext';
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Dashboard from "@/components/Dashboard";

export default function DashboardPage() {
  const { user, isContextReady } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isContextReady) return;
    if (!user) {
      router.replace("/login");
    }
  }, [isContextReady, user, router]);

  if (!isContextReady || !user) return null;
  return <Dashboard />;
}
