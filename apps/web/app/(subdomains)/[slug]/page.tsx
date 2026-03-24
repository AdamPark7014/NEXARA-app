"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from "@/components/UserContext";

export default function PanelRootPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { user, isContextReady } = useUser();

  useEffect(() => {
    if (!isContextReady) return;
    if (!slug) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(`/${slug}/dashboard`);
  }, [slug, router, user, isContextReady]);

  return null;
}
