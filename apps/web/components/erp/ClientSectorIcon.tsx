"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import type { ClientSectorIconKey } from "@/lib/client-sectors";

/** Glifo por sector del padrón de clientes (`CLIENT_SECTOR_META[s].icon`). */
export const CLIENT_SECTOR_ICONS: Record<ClientSectorIconKey, SvgIconComponent> = {
  proyecto: FolderOutlinedIcon,
  corporativo: BusinessOutlinedIcon,
  comercial: HandshakeOutlinedIcon,
};

type Props = {
  icon: ClientSectorIconKey;
  size?: number;
  color?: string;
};

export default function ClientSectorIcon({ icon, size = 16, color }: Props) {
  const Icon = CLIENT_SECTOR_ICONS[icon] ?? FolderOutlinedIcon;
  return (
    <Icon
      aria-hidden="true"
      sx={{ fontSize: size, flex: "0 0 auto", verticalAlign: "middle", ...(color ? { color } : {}) }}
    />
  );
}
