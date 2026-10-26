import type { Metadata } from "next";

/** Alias de marca: redirige a `/`; la URL canónica es la home. */
export const metadata: Metadata = {
  title: "Nexara Ingenieros",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function NexaraIngenierosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
