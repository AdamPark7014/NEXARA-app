"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { getEvidencesCanonicalPath } from "@/lib/section-views";

/** Mis evidencias viven en Actividades — redirige a la pestaña Evidencias. */
export default function MyEvidencesRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();

  useEffect(() => {
    const base = getEvidencesCanonicalPath(user);
    const activityId = searchParams.get("activityId");
    const url = activityId ? `${base}&activityId=${activityId}` : base;
    router.replace(url);
  }, [router, searchParams, user]);

  return null;
}
