"use client";

import type { ReactNode } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AlarmOutlined from "@mui/icons-material/AlarmOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import BusinessCenterOutlined from "@mui/icons-material/BusinessCenterOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import CakeOutlined from "@mui/icons-material/CakeOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import CelebrationOutlined from "@mui/icons-material/CelebrationOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ConfirmationNumberOutlined from "@mui/icons-material/ConfirmationNumberOutlined";
import ConstructionOutlined from "@mui/icons-material/ConstructionOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import DirectionsCarOutlined from "@mui/icons-material/DirectionsCarOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import FactoryOutlined from "@mui/icons-material/FactoryOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import HomeRepairServiceOutlined from "@mui/icons-material/HomeRepairServiceOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import LibraryBooksOutlined from "@mui/icons-material/LibraryBooksOutlined";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import MailOutlineOutlined from "@mui/icons-material/MailOutlineOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import MoveToInboxOutlined from "@mui/icons-material/MoveToInboxOutlined";
import NewspaperOutlined from "@mui/icons-material/NewspaperOutlined";
import NotificationImportantOutlined from "@mui/icons-material/NotificationImportantOutlined";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import OutboxOutlined from "@mui/icons-material/OutboxOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import PauseOutlined from "@mui/icons-material/PauseOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import PushPinOutlined from "@mui/icons-material/PushPinOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import RequestQuoteOutlined from "@mui/icons-material/RequestQuoteOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import RocketLaunchOutlined from "@mui/icons-material/RocketLaunchOutlined";
import RoomServiceOutlined from "@mui/icons-material/RoomServiceOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import SensorsOutlined from "@mui/icons-material/SensorsOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import SmartphoneOutlined from "@mui/icons-material/SmartphoneOutlined";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import SupportOutlined from "@mui/icons-material/SupportOutlined";
import SyncOutlined from "@mui/icons-material/SyncOutlined";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import TrackChangesOutlined from "@mui/icons-material/TrackChangesOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

/**
 * Símbolo del sistema: el ícono de línea que corresponde al emoji que un módulo le pasa a un
 * componente del kit (`icon="📊"`).
 *
 * Decenas de pantallas y mapas de rutas nombran sus íconos con emoji, que se ven distintos en cada
 * sistema operativo y no siguen el color del tema. Convertirlos aquí los arregla todos de un jalón,
 * sin tocar cada módulo. Código nuevo: pasa el ícono directo, no un emoji. Lo que no es un emoji
 * conocido se pinta tal cual.
 */
const ICONOS: Record<string, SvgIconComponent> = {
  "✅": CheckCircleOutlined,
  "⬇": FileDownloadOutlined,
  "⚠": WarningAmberOutlined,
  "💬": ChatBubbleOutlineOutlined,
  "📋": AssignmentOutlined,
  "📊": InsightsOutlined,
  "📈": TrendingUpOutlined,
  "📉": TrendingDownOutlined,
  "📅": CalendarMonthOutlined,
  "📆": EventOutlined,
  "🗓": EventOutlined,
  "📡": SensorsOutlined,
  "🎉": CelebrationOutlined,
  "🎫": ConfirmationNumberOutlined,
  "🎯": TrackChangesOutlined,
  "📄": DescriptionOutlined,
  "📑": ArticleOutlined,
  "📜": ArticleOutlined,
  "🧾": ReceiptLongOutlined,
  "🔧": BuildOutlined,
  "⏳": HourglassEmptyOutlined,
  "🔔": NotificationsNoneOutlined,
  "📥": MoveToInboxOutlined,
  "📤": OutboxOutlined,
  "🔒": LockOutlined,
  "🔐": LockOutlined,
  "👥": GroupOutlined,
  "👤": PersonOutlineOutlined,
  "🧑": PersonOutlineOutlined,
  "📷": PhotoCameraOutlined,
  "📸": PhotoCameraOutlined,
  "📦": Inventory2Outlined,
  "⚙": SettingsOutlined,
  "💼": BusinessCenterOutlined,
  "💰": PaymentsOutlined,
  "💵": PaymentsOutlined,
  "❌": CancelOutlined,
  "🗺": MapOutlined,
  "🛠": HandymanOutlined,
  "🆘": SupportOutlined,
  "🔍": SearchOutlined,
  "🔎": SearchOutlined,
  "🌐": LanguageOutlined,
  "📝": EditNoteOutlined,
  "✏": EditOutlined,
  "🏗": ConstructionOutlined,
  "🚧": ConstructionOutlined,
  "🤝": HandshakeOutlined,
  "💡": LightbulbOutlined,
  "💳": CreditCardOutlined,
  "🔗": LinkOutlined,
  "📎": AttachFileOutlined,
  "🛡": ShieldOutlined,
  "🚀": RocketLaunchOutlined,
  "💸": RequestQuoteOutlined,
  "🚗": DirectionsCarOutlined,
  "🚘": DirectionsCarOutlined,
  "🚙": DirectionsCarOutlined,
  "🚐": DirectionsCarOutlined,
  "🎂": CakeOutlined,
  "🚨": NotificationImportantOutlined,
  "🔑": KeyOutlined,
  "🍽": RestaurantOutlined,
  "📰": NewspaperOutlined,
  "🧰": HomeRepairServiceOutlined,
  "✨": AutoAwesomeOutlined,
  "⏰": AlarmOutlined,
  "⏱": TimerOutlined,
  "🕐": ScheduleOutlined,
  "🚪": MeetingRoomOutlined,
  "🏢": BusinessOutlined,
  "🧪": ScienceOutlined,
  "📁": FolderOutlined,
  "📂": FolderOpenOutlined,
  "📒": MenuBookOutlined,
  "📕": MenuBookOutlined,
  "📘": MenuBookOutlined,
  "📗": MenuBookOutlined,
  "📙": MenuBookOutlined,
  "📚": LibraryBooksOutlined,
  "🏆": EmojiEventsOutlined,
  "🖼": ImageOutlined,
  "📣": CampaignOutlined,
  "🏛": AccountBalanceOutlined,
  "🏦": AccountBalanceOutlined,
  "🏠": HomeOutlined,
  "📌": PushPinOutlined,
  "🔄": SyncOutlined,
  "🏬": StoreOutlined,
  "🏪": StoreOutlined,
  "➕": AddOutlined,
  "💾": SaveOutlined,
  "🎨": PaletteOutlined,
  "📹": VideocamOutlined,
  "🌳": AccountTreeOutlined,
  "🛒": ShoppingCartOutlined,
  "📍": PlaceOutlined,
  "⚡": BoltOutlined,
  "📭": InboxOutlined,
  "🪪": BadgeOutlined,
  "🛎": RoomServiceOutlined,
  "🏭": FactoryOutlined,
  "📱": SmartphoneOutlined,
  "✉": MailOutlineOutlined,
  "📧": MailOutlineOutlined,
  "📞": PhoneOutlined,
  "🤖": SmartToyOutlined,
  "🚩": FlagOutlined,
  "⏸": PauseOutlined,
};

/** El ícono que le toca a un emoji (con o sin el selector de variante U+FE0F), o `null`. */
export function iconoDeSimbolo(valor: unknown): SvgIconComponent | null {
  if (typeof valor !== "string") return null;
  return ICONOS[valor.replace(/️/g, "").trim()] ?? null;
}

export default function Simbolo({ valor, size }: { valor: ReactNode; size?: number }) {
  const Icono = iconoDeSimbolo(valor);
  if (!Icono) return <>{valor}</>;
  return <Icono aria-hidden="true" sx={{ fontSize: size ?? "1.2em", verticalAlign: "-0.2em" }} />;
}
