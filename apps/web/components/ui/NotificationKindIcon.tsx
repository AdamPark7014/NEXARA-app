"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import AssignmentAddIcon from "@mui/icons-material/AssignmentAdd";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import UndoIcon from "@mui/icons-material/Undo";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import WrongLocationOutlinedIcon from "@mui/icons-material/WrongLocationOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import { IconBadge } from "@/components/ui/IconBadge";
import { notificationKind, type NotificationKind } from "@/lib/notification-kind";

const BLUE = "var(--primary, #2563EB)";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";

export const NOTIFICATION_KIND_META: Record<NotificationKind, { icon: SvgIconComponent; color: string }> = {
  entrada: { icon: LoginIcon, color: BLUE },
  salida: { icon: LogoutIcon, color: BLUE },
  comida: { icon: RestaurantOutlinedIcon, color: BLUE },
  actividad_nueva: { icon: AssignmentAddIcon, color: BLUE },
  inicio: { icon: PlayCircleOutlineIcon, color: BLUE },
  fotos: { icon: PhotoCameraOutlinedIcon, color: BLUE },
  documento: { icon: DescriptionOutlinedIcon, color: BLUE },
  formulario: { icon: FactCheckOutlinedIcon, color: BLUE },
  reasignada: { icon: SwapHorizIcon, color: BLUE },
  reprogramada: { icon: EventRepeatIcon, color: BLUE },
  despacho: { icon: SendOutlinedIcon, color: BLUE },
  por_revisar: { icon: RateReviewOutlinedIcon, color: AMBER },
  correccion: { icon: ReplayIcon, color: AMBER },
  aprobada: { icon: TaskAltIcon, color: GREEN },
  devuelta: { icon: UndoIcon, color: AMBER },
  rechazada: { icon: CancelOutlinedIcon, color: RED },
  atraso: { icon: HourglassTopIcon, color: AMBER },
  vencida: { icon: ErrorOutlineIcon, color: RED },
  fuera_zona: { icon: WrongLocationOutlinedIcon, color: RED },
  cancelada: { icon: BlockOutlinedIcon, color: RED },
  falta_justificada: { icon: EventBusyOutlinedIcon, color: "#7c3aed" },
  cumpleanos: { icon: CakeOutlinedIcon, color: "#db2777" },
  aniversario: { icon: CelebrationOutlinedIcon, color: "#ea580c" },
  cliente: { icon: StorefrontOutlinedIcon, color: BLUE },
  chat: { icon: ChatBubbleOutlineIcon, color: BLUE },
  ubicacion: { icon: PlaceOutlinedIcon, color: BLUE },
  viatico: { icon: PaymentsOutlinedIcon, color: BLUE },
  perfil: { icon: PersonOutlineIcon, color: BLUE },
  general: { icon: NotificationsNoneOutlinedIcon, color: BLUE },
};

type Props = {
  category?: string | null;
  title?: string | null;
  /** Lado del badge en px. */
  size?: number;
  /** `inline`: solo el glifo (para chips). */
  variant?: "badge" | "inline";
  /** Color neutro en vez del semántico (p. ej. notificación ya leída). */
  muted?: boolean;
};

export default function NotificationKindIcon({ category, title, size = 32, variant = "badge", muted }: Props) {
  const meta = NOTIFICATION_KIND_META[notificationKind(category, title)];
  const color = muted ? "var(--text-tertiary, #64748b)" : meta.color;
  if (variant === "inline") {
    const Icon = meta.icon;
    return <Icon aria-hidden="true" sx={{ fontSize: size, color, flex: "0 0 auto" }} />;
  }
  return <IconBadge icon={meta.icon} color={color} size={size} />;
}
