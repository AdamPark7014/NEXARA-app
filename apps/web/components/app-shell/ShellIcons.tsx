"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import WidgetsOutlinedIcon from "@mui/icons-material/WidgetsOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import SearchIcon from "@mui/icons-material/Search";

/**
 * Iconos del shell Core (sidebar, paleta de comandos). Los módulos del catálogo
 * (`lib/access-matrix.ts`) siguen trayendo un emoji como dato heredado; aquí se
 * traduce el id del módulo a un icono de @mui/icons-material.
 */
const MODULE_ICONS: Record<string, SvgIconComponent> = {
  chat: ChatBubbleOutlineIcon,
  "mis-actividades": ChecklistOutlinedIcon,
  pizarra: ViewKanbanOutlinedIcon,
  asistencias: EventAvailableOutlinedIcon,
  "erp-clients": HandshakeOutlinedIcon,
  "my-profile": PersonOutlineIcon,
  "notifications-center": NotificationsNoneOutlinedIcon,
  dashboard: HomeOutlinedIcon,
  executive: InsightsOutlinedIcon,
  calendar: EventOutlinedIcon,
  "activities-daily": ChecklistOutlinedIcon,
  "activities-projects": FolderOutlinedIcon,
  "activities-services": BuildOutlinedIcon,
};

export function moduleIconComponent(moduleId: string): SvgIconComponent {
  return MODULE_ICONS[moduleId] ?? WidgetsOutlinedIcon;
}

export function ModuleIcon({ id, size = 18 }: { id: string; size?: number }) {
  const Icon = moduleIconComponent(id);
  return <Icon aria-hidden="true" sx={{ fontSize: size, display: "block" }} />;
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
  let Icon: SvgIconComponent = SearchIcon;
  if (actionId.startsWith("mod:")) {
    Icon = moduleIconComponent(actionId.slice(4));
  } else if (actionId.startsWith("entity:")) {
    Icon = ENTITY_ICONS[actionId.split(":")[1] ?? ""] ?? SearchIcon;
  } else if (ACTION_ICONS[actionId]) {
    Icon = ACTION_ICONS[actionId];
  } else {
    Icon = WidgetsOutlinedIcon;
  }
  return <Icon aria-hidden="true" sx={{ fontSize: size, display: "block" }} />;
}
