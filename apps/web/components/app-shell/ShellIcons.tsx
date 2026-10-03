"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import SearchIcon from "@mui/icons-material/Search";

/**
 * Iconos del shell (sidebar, barra superior y paleta de comandos).
 *
 * Un solo juego de trazo: SVG de 24×24, trazo 1.8, puntas y uniones redondas
 * (el mismo de las maquetas aprobadas en `.ai/ui-maquetas/maqueta.js`). La
 * variedad viene del significado, no del estilo. Dos módulos que son la misma
 * idea en paneles distintos comparten icono a propósito: chat es chat en ERP,
 * CRM, OPS y Studio.
 */
const PATHS = {
  home: '<path d="m3 10.5 9-7.5 9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userPlus: '<circle cx="10" cy="8" r="4"/><path d="M2.5 21a7.5 7.5 0 0 1 12.5-5.6"/><path d="M19 14v6M16 17h6"/>',
  quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h4"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5 17 4"/>',
  truck: '<path d="M2 6h11v10H2zM13 9h5l3 3v4h-8z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/><path d="M8 7h8"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M15 12h4"/><path d="M4 8h15"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>',
  cctv: '<path d="M3 7.5 15 4l2 6-12 3.5z"/><path d="m17 10 2.5-.8M7 12.8 8.5 17H5M3 20v-6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
  hardhat: '<path d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3"/><path d="M10 8V5h4v3"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  chart: '<path d="M3 20h18"/><path d="M6 16v-4M11 16V7M16 16v-6M21 16V4"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11l2-8H6.2"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  inbox: '<path d="M3 13h5l1.5 3h5l1.5-3h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  web: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9 6.5h.01"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  idCard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 14h3"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  // ── Controles del shell ──
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  chevrons: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m15 10-2 2 2 2"/>',
  sidebarOpen: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m13 10 2 2-2 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  switchUser: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 11-4.7"/><path d="m17 13 3 3-3 3M20 16h-6"/>',
  logout: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
} as const;

export type ShellIconName = keyof typeof PATHS;

/** Icono de trazo del shell. Hereda el color del texto (`currentColor`). */
export function ShellIcon({ name, size = 18, className }: { name: ShellIconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "block", flex: "0 0 auto" }}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

/** Módulo → icono. Lo que no esté aquí cae en la cuadrícula genérica. */
const MODULE_ICONS: Record<string, ShellIconName> = {
  // ── Hoy ──
  executive: "chart",
  dashboard: "home",
  "mis-actividades": "task",
  pizarra: "board",
  asistencias: "clock",
  "kpis-equipo": "target",
  chat: "chat",
  reuniones: "users",
  approvals: "shield",
  bi: "trend",

  // ── Clientes y obra ──
  "erp-clients": "users",
  "erp-cotizaciones": "quote",
  "erp-proyectos": "folder",
  "activities-daily": "task",
  "activities-projects": "folder",
  "activities-services": "tool",

  // ── Recursos ──
  "erp-almacen": "box",
  "erp-herramientas": "tool",
  "erp-vehiculos": "truck",
  "erp-organigrama": "org",
  warehouse: "box",
  procurement: "cart",

  // ── Finanzas ──
  "erp-contabilidad": "book",
  accounting: "book",
  invoicing: "receipt",
  banking: "bank",
  "viatics-admin": "wallet",
  "expenses-admin": "money",
  "employee-payments": "briefcase",
  exports: "download",

  // ── Personas ──
  hr: "idCard",
  attendance: "clock",
  "lunch-breaks": "coffee",
  fines: "alert",
  orgchart: "org",
  "kpis-hr": "chart",
  users: "users",

  // ── Gobierno y auditoría ──
  companies: "building",
  settings: "settings",
  architecture: "map",
  kb: "book",
  documents: "file",
  audit: "history",
  "notifications-center": "bell",
  news: "news",

  // ── Mi cuenta ──
  calendar: "calendar",
  "my-profile": "user",

  // ── CRM ──
  "crm-dashboard": "grid",
  "crm-chat": "chat",
  "crm-leads": "userPlus",
  "crm-opportunities": "trend",
  "crm-pipeline": "kanban",
  "crm-agenda": "calendar",
  "crm-clients": "users",
  "crm-products": "tag",
  "crm-quotes": "quote",
  "crm-templates": "file",
  "crm-projects": "folder",
  "crm-tenders": "flag",
  "crm-sales-team": "users",
  "crm-targets": "target",
  "crm-reports": "chart",

  // ── OPS ──
  "ops-dashboard": "grid",
  "ops-dispatch": "send",
  "ops-chat": "chat",
  "ops-projects": "folder",
  "ops-activities": "board",
  "ops-my-activities": "task",
  "ops-evidences": "camera",
  "ops-my-evidences": "image",
  "ops-viatics": "wallet",
  "ops-my-viatics": "wallet",
  "ops-vehicles": "truck",
  "ops-my-vehicles": "truck",
  "ops-gps": "pin",
  "ops-tools": "tool",
  "ops-service-clients": "users",
  "ops-maintenance": "hardhat",
  "ops-maintenance-contracts": "file",
  "ops-assets": "box",
  "ops-noc": "pulse",
  "ops-support-inbox": "inbox",
  "ops-support-sla": "timer",
  "ops-cvs": "file",

  // ── Studio ──
  "studio-dashboard": "grid",
  "studio-chat": "chat",
  "studio-hero": "image",
  "studio-pages": "web",
  "studio-cases": "briefcase",
  "studio-news": "news",
  "studio-social": "share",
  "studio-newsletter": "mail",
  "studio-contacts": "users",
  "studio-leads": "userPlus",

  // ── Lab ──
  "lab-home": "grid",
  "lab-chat": "chat",
  "lab-ai": "sparkle",
  "lab-flags": "flag",
  "lab-health": "pulse",

  // ── INTEGRA (control de acceso y video) ──
  "facilities-access": "key",
  "integra-home": "grid",
  "integra-video": "cctv",
  "integra-detection": "eye",
  "integra-events": "list",
  "integra-alarms": "alert",
  "integra-access": "key",
  "integra-people": "users",
  "integra-schedules": "calendar",
  "integra-espacios": "building",
  "integra-attendance": "clock",
  "integra-visitors": "userPlus",
  "integra-vehicles": "truck",
  "integra-anpr": "scan",
  "integra-settings": "settings",
  "integra-audit": "history",
  "integra-map": "map",
  "integra-notifications": "bell",
  "integra-my-profile": "user",
};

export function moduleIconName(moduleId: string): ShellIconName {
  return MODULE_ICONS[moduleId] ?? "grid";
}

export function ModuleIcon({ id, size = 18 }: { id: string; size?: number }) {
  return <ShellIcon name={moduleIconName(id)} size={size} />;
}

const ACTION_ICONS: Record<string, SvgIconComponent> = {
  "act:dark": DarkModeOutlinedIcon,
  "act:logout": LogoutIcon,
  "act:create-client": BusinessOutlinedIcon,
};

const ENTITY_ICONS: Record<string, SvgIconComponent> = {
  activity: AssignmentOutlinedIcon,
  "sales-client": BusinessOutlinedIcon,
};

/** Icono para una acción de la paleta a partir de su id (`mod:*`, `act:*`, `entity:<tipo>:<id>`). */
export function PaletteActionIcon({ actionId, size = 18 }: { actionId: string; size?: number }) {
  if (actionId.startsWith("mod:")) {
    return <ModuleIcon id={actionId.slice(4)} size={size} />;
  }
  let Icon: SvgIconComponent = SearchIcon;
  if (actionId.startsWith("entity:")) {
    Icon = ENTITY_ICONS[actionId.split(":")[1] ?? ""] ?? SearchIcon;
  } else if (ACTION_ICONS[actionId]) {
    Icon = ACTION_ICONS[actionId];
  }
  return <Icon aria-hidden="true" sx={{ fontSize: size, display: "block" }} />;
}
