"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Mi cuenta"
      title="Mi perfil"
      description="Tus datos personales, preferencias, sesiones activas y configuración de seguridad."
      icon="👤"
      capabilities={[
        { icon: "🪪", title: "Datos personales", description: "Foto, contacto, dirección, documentos de identidad." },
        { icon: "🔐", title: "Seguridad", description: "Cambio de contraseña, 2FA, sesiones activas en otros dispositivos." },
        { icon: "🌗", title: "Preferencias", description: "Tema oscuro/claro, idioma, notificaciones por canal." },
        { icon: "💼", title: "Mi puesto", description: "Rol vigente, fecha de ingreso, lista de permisos y URLs que puedo tocar." },
      ]}
      relatedLinks={[{ href: "/erp/calendar", label: "Mi calendario", icon: "📅" }]}
    />
  );
}
