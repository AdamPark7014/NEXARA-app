"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PanelRootPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  useEffect(() => {
    if (slug) {
      // Redirigir automáticamente a /dashboard
      router.replace('/dashboard');
    }
  }, [slug, router]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Cargando panel {slug}...</h1>
      <p>Redirigiendo al dashboard...</p>
    </div>
  );
}
