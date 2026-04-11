import type { Metadata } from "next";

/** Registro de dispositivo: no debe indexarse en buscadores. */
export const metadata: Metadata = {
  title: "Registrar dispositivo",
  robots: { index: false, follow: false },
};

export default function DeviceRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
