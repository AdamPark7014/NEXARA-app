import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("cobertura");
}

export default function CoberturaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
