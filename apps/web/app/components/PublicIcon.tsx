import type { SVGProps } from "react";

/**
 * Set de iconos de línea del sitio público (24×24, trazo 1.75, esquinas
 * redondeadas). Inline para no depender de librerías y heredar `currentColor`.
 */
export type PublicIconName =
  | "camera"
  | "wifi"
  | "server"
  | "headset"
  | "code"
  | "layers"
  | "shield"
  | "store"
  | "factory"
  | "hotel"
  | "hospital"
  | "school"
  | "landmark"
  | "mapPin"
  | "check"
  | "clipboard"
  | "search"
  | "hardhat"
  | "refresh"
  | "alert"
  | "network"
  | "lock"
  | "monitor"
  | "arrowRight"
  | "clock"
  | "building"
  | "users"
  | "fileCheck"
  | "phone"
  | "target";

const PATHS: Record<PublicIconName, JSX.Element> = {
  camera: (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="m16 10 5-2.5v9L16 14" />
      <circle cx="9.5" cy="12" r="2" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 8.5a14 14 0 0 1 19 0" />
      <path d="M5.5 12a9.5 9.5 0 0 1 13 0" />
      <path d="M8.5 15.5a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  headset: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" />
      <path d="M19 19a3 3 0 0 1-3 2h-3" />
    </>
  ),
  code: (
    <>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m14 5-4 14" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  store: (
    <>
      <path d="M4 9 5.5 4h13L20 9" />
      <path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5 11.5V20h14v-8.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  factory: (
    <>
      <path d="M3 20V10l5 3v-3l5 3v-3l5 3v7" />
      <path d="M3 20h18" />
      <path d="M17 13V5h3v8" />
      <path d="M7 17h2M12 17h2" />
    </>
  ),
  hotel: (
    <>
      <path d="M3 18V7" />
      <path d="M3 12h18v6" />
      <path d="M3 16h18" />
      <path d="M7 12V9.5A1.5 1.5 0 0 1 8.5 8h3A1.5 1.5 0 0 1 13 9.5V12" />
    </>
  ),
  hospital: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 8v6M9 11h6" />
      <path d="M9 21v-3h6v3" />
    </>
  ),
  school: (
    <>
      <path d="m2 9 10-4 10 4-10 4z" />
      <path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
      <path d="M22 9v5" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9" />
      <path d="m2 10 10-6 10 6z" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  hardhat: (
    <>
      <path d="M3 17h18" />
      <path d="M5 17a7 7 0 0 1 14 0" />
      <path d="M10 11V6h4v5" />
      <path d="M4 20h16" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3L20 8" />
      <path d="M20 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-14 5.3L4 16" />
      <path d="M4 20v-4h4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4M12 11l-5.5 6M12 11l5.5 6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" />
      <path d="M10 21v-3h4v3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M17.5 14a6.5 6.5 0 0 1 4 6" />
    </>
  ),
  fileCheck: (
    <>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3v5h5" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5V7M12 17v3.5M3.5 12H7M17 12h3.5" />
    </>
  ),
};

type PublicIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: PublicIconName;
  size?: number;
};

export default function PublicIcon({ name, size = 24, ...rest }: PublicIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
