import React from "react";

const helpContent: Record<string, Record<string, string>> = {
  activities: {
    superadmin: `Como superadmin puedes ver, crear, editar y reasignar cualquier actividad de la organización. Tienes acceso total a todos los registros y puedes exportar información global.`,
    admin: `Como administrador puedes ver y gestionar las actividades de tu departamento. Puedes crear, editar y asignar actividades a los ingenieros bajo tu cargo. No puedes ver actividades de otros admins ni del superadmin.`,
    ingeniero: `Aquí puedes ver y reportar tus propias actividades. Solo puedes editar o eliminar actividades que tú creaste. Si necesitas ayuda, contacta a tu administrador.`,
    vendedor: `No tienes acceso a este módulo. Si crees que es un error, contacta a tu administrador.`
  },
  users: {
    superadmin: `Como superadmin puedes crear, editar y eliminar cualquier usuario. Puedes asignar cualquier rol y acceso.`,
    admin: `Como administrador puedes gestionar usuarios de tu departamento y asignarles roles compatibles. No puedes modificar otros admins ni el superadmin.`,
    ingeniero: `No tienes permisos para crear o editar usuarios. Solo puedes ver tu propio perfil.`,
    vendedor: `No tienes permisos para crear o editar usuarios. Solo puedes ver tu propio perfil.`
  },
  // ...agregar más módulos aquí...
};

function getProfile(user: any): string {
  if (user?.superadmin || user?.isSuperAdmin) return "superadmin";
  if (user?.admin) return "admin";
  if (user?.ingeniero) return "ingeniero";
  if (user?.vendedor) return "vendedor";
  return "ingeniero";
}

export default function HelpTab({ module, user }: { module: string; user: any }) {
  const profile = getProfile(user);
  const content = helpContent[module]?.[profile] || "No hay ayuda disponible para este módulo.";
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ padding: 8, borderRadius: 8, background: '#007bff', color: '#fff', border: 'none', fontWeight: 600 }}>
        {open ? 'Cerrar ayuda' : '¿Cómo funciona?'}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, minWidth: 320, maxWidth: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          <h4 style={{ marginTop: 0 }}>Ayuda del módulo</h4>
          <div style={{ whiteSpace: 'pre-line', fontSize: 15 }}>{content}</div>
        </div>
      )}
    </div>
  );
}
