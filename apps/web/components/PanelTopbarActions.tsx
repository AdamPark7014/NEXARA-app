"use client";

/**
 * PanelTopbarActions — grupo unificado de widgets de cabecera del panel.
 *
 * Cada panel grande (console, operacion, ventas, contabilidad) montaba a mano:
 *   <CommandPaletteLauncher /> + <NotificationCenter /> + <PanelSwitcher />
 *
 * Este componente colapsa esos 3 widgets en un único bloque consistente para
 * mantener UX uniforme entre paneles (espaciado, posicionamiento del bell,
 * configuración del centro de notificaciones).
 *
 * Sigue siendo configurable por panel:
 *  - `accentColor`     → color del panel actual (cyan, verde, azul…).
 *  - `panelKey`        → slug del panel actual para el switcher.
 *  - `compact`         → modo móvil (oculta texto, deja solo iconos).
 *  - `notificationProps` → override propiedades del NotificationCenter.
 */

import NotificationCenter from "@/components/NotificationCenter";
import PanelSwitcher from "@/components/PanelSwitcher";
import CommandPaletteLauncher from "@/components/CommandPaletteLauncher";
import type { ComponentProps } from "react";
import type { PanelKey } from "@/lib/panel-routing";

type PanelTopbarActionsProps = {
  panelKey: PanelKey;
  accentColor: string;
  compact?: boolean;
  /** Override de props del bell (autoCloseTime, maxNotifications…). */
  notificationProps?: Partial<ComponentProps<typeof NotificationCenter>>;
};

export default function PanelTopbarActions({
  panelKey,
  accentColor,
  compact = false,
  notificationProps,
}: PanelTopbarActionsProps) {
  return (
    <>
      <CommandPaletteLauncher accentColor={accentColor} compact={compact} />
      <NotificationCenter
        inlineTrigger
        position="top-right"
        maxNotifications={5}
        autoCloseTime={6000}
        mirrorToSystemNotifications
        {...notificationProps}
      />
      <PanelSwitcher currentPanel={panelKey} accentColor={accentColor} compact={compact} />
    </>
  );
}
