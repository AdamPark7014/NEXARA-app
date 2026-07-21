import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("contacto");
}

export const dynamic = "force-dynamic";

export default function ContactoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
