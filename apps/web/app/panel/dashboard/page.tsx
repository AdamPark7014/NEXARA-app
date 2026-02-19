"use client";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default function PanelDashboard() {
  const { user } = useUser();
  if (!user || !hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) return null;
  return (
    <div>
      <h1>Bienvenido, {user.nombre}</h1>
      <p>¿Qué panel deseas abrir?</p>
      <ul>
        <li><a href="/panel/console">Panel Interno</a></li>
        <li><a href="/panel/web">Panel Web</a></li>
        <li><a href="/panel/ventas">Panel Ventas</a></li>
      </ul>
    </div>
  );
}
