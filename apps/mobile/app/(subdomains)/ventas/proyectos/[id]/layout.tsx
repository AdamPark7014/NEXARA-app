// Server component — provides generateStaticParams for Capacitor static export.
// dynamicParams = false: unknown [id] slugs return 404 on direct URL access,
// but all in-app navigation via the Next.js router works normally (SPA mode).
export const dynamicParams = false;
export async function generateStaticParams() {
  // Project IDs are resolved at runtime via useParams(); no paths need pre-rendering.
  return [];
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
