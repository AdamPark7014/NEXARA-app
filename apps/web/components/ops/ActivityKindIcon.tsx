"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import HandymanOutlinedIcon from "@mui/icons-material/HandymanOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import type { ActivityIconKey } from "@/lib/activity-kinds";
import { IconBadge } from "@/components/ui/IconBadge";

/** Glifo por tipo de actividad Core (y subtipo de Tarea). */
export const ACTIVITY_KIND_ICONS: Record<ActivityIconKey, SvgIconComponent> = {
  tarea: ChecklistOutlinedIcon,
  proyecto: FolderOutlinedIcon,
  obra: ConstructionOutlinedIcon,
  servicio: BuildOutlinedIcon,
  comercial: WorkOutlineIcon,
  levantamiento: StraightenOutlinedIcon,
  recoleccion: Inventory2OutlinedIcon,
  entrega: LocalShippingOutlinedIcon,
  junta: HandshakeOutlinedIcon,
  compra: ShoppingCartOutlinedIcon,
  preparacion: HandymanOutlinedIcon,
  tramite: DescriptionOutlinedIcon,
  capacitacion: SchoolOutlinedIcon,
  documentacion: EditNoteOutlinedIcon,
  otro: EditOutlinedIcon,
};

export function activityKindIconComponent(key?: string | null): SvgIconComponent {
  return (key && ACTIVITY_KIND_ICONS[key as ActivityIconKey]) || PushPinOutlinedIcon;
}

type Props = {
  /** Clave de `ActivityKindMeta.icon` / `TAREA_TIPOS[].icon`; sin clave → icono genérico. */
  kind?: ActivityIconKey | string | null;
  size?: number;
  color?: string;
  /** `badge`: cuadrado redondeado con fondo suave (tarjetas de tipo). */
  variant?: "inline" | "badge";
};

export default function ActivityKindIcon({ kind, size = 18, color, variant = "inline" }: Props) {
  const Icon = activityKindIconComponent(kind);
  if (variant === "badge") {
    return <IconBadge icon={Icon} size={size} color={color} />;
  }
  return (
    <Icon
      aria-hidden="true"
      sx={{ fontSize: size, flex: "0 0 auto", verticalAlign: "middle", ...(color ? { color } : {}) }}
    />
  );
}
