import CrossPanelRedirect from "@/components/CrossPanelRedirect";

export default function PanelNotificationsRedirect() {
  return (
    <CrossPanelRedirect
      panel="erp"
      path="/erp/notifications-center"
      label="Abriendo centro de notificaciones…"
    />
  );
}
