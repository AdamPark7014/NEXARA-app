"use client";

import React from 'react';
import { useTheme } from './ThemeContext';

interface HelpTabProps {
  module: string;
  user?: any;
}

const helpContent: Record<string, Record<string, string>> = {
  fines: {
    superadmin: 'Aquí puedes gestionar y auditar todas las multas de la organización, revisar historial y dar seguimiento global a incidencias.',
    admin: 'Aquí puedes registrar multas para tu equipo y consultar el historial con motivos, importes y fechas.',
    ingeniero: 'Aquí puedes consultar tus multas, su motivo y estatus para dar seguimiento a cualquier incidencia.',
    vendedor: 'Si tienes acceso, aquí puedes consultar tus multas y su detalle. Si hay datos incorrectos, pide revisión con administración.',
  },
  'lunch-breaks': {
    superadmin: 'Aquí puedes monitorear los breaks de comida de toda la organización y detectar registros fuera de horario para control operativo.',
    admin: 'Aquí puedes dar seguimiento a los breaks de tu equipo, validar entradas y regresos, y revisar incidencias de tiempo.',
    ingeniero: 'Aquí registras tu entrada a comida y tu regreso al trabajo con evidencia, además de consultar tu historial.',
    vendedor: 'Si tienes acceso, aquí puedes registrar y consultar tus breaks. Si no aparece el flujo correcto, revisa permisos con administración.',
  },
  attendance: {
    superadmin: 'Aquí puedes supervisar la asistencia de toda la organización, revisar entradas y salidas y detectar incidencias por área.',
    admin: 'Aquí puedes dar seguimiento a la asistencia de tu equipo, validar marcajes diarios y detectar retrasos o faltas.',
    ingeniero: 'Aquí puedes registrar y consultar tu asistencia diaria (entrada, salida y estado de jornada).',
    vendedor: 'Si tienes acceso, aquí puedes registrar y consultar tu asistencia. Si no aparece el flujo esperado, revisa permisos con administración.',
  },
  hr: {
    superadmin: 'Aquí puedes supervisar todo RRHH: permisos, evaluaciones y métricas globales de la organización.',
    admin: 'Aquí puedes consultar y gestionar datos de RRHH como permisos, evaluaciones y tableros según permisos.',
    ingeniero: 'Aquí puedes consultar información de RRHH disponible para tu perfil, como permisos y evaluaciones.',
    vendedor: 'Si tienes acceso, aquí puedes consultar secciones de RRHH. Si falta algo esperado, revisa permisos con administración.',
  },
  clients: {
    superadmin: 'Aquí administras los clientes corporativos de toda la organización. Puedes revisar datos clave de la cuenta, responsables, documentos y su relación con ventas y operación.',
    admin: 'Aquí gestionas los clientes corporativos de tu alcance, manteniendo contactos, datos fiscales, documentos y seguimiento comercial actualizados.',
    ingeniero: 'Aquí puedes consultar la información corporativa de los clientes relacionados con tu operación para entender contexto, contactos y referencias de servicio.',
    vendedor: 'Aquí das seguimiento a tus clientes corporativos, revisando contactos, documentos y contexto comercial para sostener la relación y atender oportunidades.',
  },
  cotizaciones: {
    superadmin: 'Aquí puedes diseñar, revisar, exportar y enviar cotizaciones de toda la organización, controlando datos del cliente, partidas, impuestos y condiciones comerciales.',
    admin: 'Aquí puedes gestionar cotizaciones del equipo, validar montos, descuentos, IVA y condiciones de pago antes de generar el PDF o enviarlo al cliente.',
    ingeniero: 'Si tu perfil tiene acceso, aquí puedes consultar cotizaciones relacionadas con proyectos o clientes para revisar alcance, conceptos y compromisos comerciales.',
    vendedor: 'Aquí preparas y das seguimiento a cotizaciones comerciales: capturas datos del cliente, agregas conceptos, ajustas importes y generas el PDF final para compartirlo.',
  },
  'contact-messages': {
    superadmin: 'Aquí puedes revisar todos los mensajes de contacto que llegan desde formularios públicos o canales comerciales para clasificarlos y asegurar seguimiento oportuno.',
    admin: 'Aquí puedes gestionar mensajes de contacto del equipo, revisando remitente, categoría, origen y estatus para canalizarlos correctamente.',
    ingeniero: 'Si tu perfil tiene acceso, aquí puedes consultar mensajes relevantes para entender requerimientos del cliente y coordinar seguimiento técnico.',
    vendedor: 'Aquí puedes revisar mensajes entrantes de prospectos o clientes e identificar oportunidades comerciales para darles seguimiento.',
  },
  'sales-management': {
    superadmin: 'Aquí supervisas la gestión comercial completa: pipeline, ingresos, desempeño por vendedor, prioridades de coaching y carga de proyectos operacionales para tomar decisiones ejecutivas.',
    admin: 'Aquí das seguimiento al rendimiento comercial del equipo, comparando ingresos, productividad, puntualidad y focos rojos por vendedor.',
    ingeniero: 'Si tu perfil tiene acceso, aquí puedes consultar indicadores comerciales y operativos para entender prioridades y contexto del equipo.',
    vendedor: 'Aquí puedes revisar el tablero comercial del equipo, desempeño, prioridades de coaching y proyectos vinculados a clientes corporativos.',
  },
  projects: {
    superadmin: 'Aquí puedes crear y supervisar proyectos operacionales, asignar vendedor responsable, vincular cliente corporativo, distribuir ingenieros y controlar estados con trazabilidad.',
    admin: 'Aquí gestionas proyectos de operación por cliente: creas proyectos, asignas ingenieros y controlas el ciclo de vida según el avance operativo.',
    ingeniero: 'Aquí puedes consultar los proyectos donde estás asignado, el cliente relacionado y su estado para coordinar mejor tus actividades.',
    vendedor: 'Aquí puedes revisar tus proyectos por cliente corporativo y su estado operativo para seguimiento comercial y coordinación con el equipo técnico.',
  },
  gps: {
    superadmin: 'Aquí puedes monitorear en mapa al personal operativo de toda la organización para supervisión y seguimiento en campo.',
    admin: 'Aquí puedes dar seguimiento al personal de tu área en tiempo real y validar rutas o zonas atendidas.',
    ingeniero: 'Aquí puedes consultar el monitoreo GPS en mapa para ubicar actividades y referencia de operación en campo.',
    vendedor: 'Si tienes acceso, aquí puedes ver el monitoreo GPS para seguimiento operativo. Si falta información, revisa permisos con administración.',
  },
  'service-sheets': {
    superadmin: 'Aquí puedes ver todas las hojas de servicio por actividad, revisar su estado y descargar el PDF cuando lo necesites.',
    admin: 'Aquí consultas las hojas de servicio del equipo, las buscas por cliente, técnico o actividad y descargas su PDF para seguimiento.',
    ingeniero: 'Aquí puedes consultar la hoja de servicio de tus actividades y descargar el PDF con el resumen del trabajo realizado.',
    vendedor: 'Si tu perfil tiene acceso, aquí puedes ver hojas de servicio y su PDF. Si no aparece la información esperada, revisa permisos con administración.',
  },
  viatics: {
    superadmin: 'Aquí puedes revisar y administrar todos los viáticos registrados en la organización. Filtra por estatus, usuario y razón para validar comprobantes y controlar aprobaciones.',
    admin: 'Aquí puedes gestionar los viáticos de tu equipo. Revisa montos, motivos, tickets adjuntos y el estatus de cada solicitud antes de aprobarla o rechazarla.',
    ingeniero: 'Aquí puedes solicitar viáticos para tus actividades. Captura monto, razón y comprobante, y revisa el estatus para saber si tu solicitud fue aprobada o requiere ajustes.',
    vendedor: 'Si tu perfil tiene acceso, aquí puedes consultar el estado de tus viáticos y sus comprobantes. Si el flujo no corresponde a tu rol, revísalo con tu administrador.',
  },
  vehicles: {
    superadmin: 'Aquí puedes administrar el control vehicular completo de la organización, revisar inventario, estatus de unidades y seguimiento de solicitudes.',
    admin: 'Aquí gestionas los vehículos de tu área, revisas disponibilidad, solicitudes del equipo y el estado operativo de cada unidad.',
    ingeniero: 'Aquí puedes consultar tus vehículos asignados y registrar solicitudes de unidad para actividades de campo, con seguimiento de estatus.',
    vendedor: 'Si tienes acceso, aquí puedes consultar unidades disponibles y el estado de tus solicitudes. Si no aparece el flujo esperado, revisa permisos con administración.',
  },
  cvs: {
    superadmin: 'Aquí puedes supervisar todo el pipeline de CVs, aprobar o descartar candidatos y convertir aprobados en usuarios.',
    admin: 'Aquí puedes revisar CVs, mover candidatos por etapas y registrar decisiones administrativas del proceso.',
    ingeniero: 'Si participas en reclutamiento, aquí puedes subir CVs y dar seguimiento al proceso por columnas.',
    vendedor: 'Si tienes acceso, aquí puedes consultar el estado de candidatos. Si faltan acciones, revisa permisos con administración.',
  },
};

function getProfile(user: any): string {
  if (user?.superadmin || user?.isSuperAdmin) return 'superadmin';
  if (user?.admin) return 'admin';
  if (user?.ingeniero) return 'ingeniero';
  if (user?.vendedor) return 'vendedor';
  return 'ingeniero';
}

const HelpTab: React.FC<HelpTabProps> = ({ module, user }) => {
  const { darkMode } = useTheme();
  if (module === 'login') return null;
  const profile = getProfile(user);
  const content = helpContent[module]?.[profile] || `Aquí aparecerán indicaciones y tips personalizados para este módulo según tu perfil.`;

  return (
    <div
      style={{
        background: darkMode
          ? 'linear-gradient(165deg, rgba(12, 22, 36, 0.94), rgba(8, 14, 24, 0.98))'
          : 'linear-gradient(165deg, rgba(255, 255, 255, 0.96), rgba(239, 247, 255, 0.96))',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        border: darkMode ? '1px solid rgba(45, 138, 255, 0.22)' : '1px solid rgba(15, 106, 214, 0.14)',
        boxShadow: darkMode ? '0 14px 26px rgba(3, 11, 24, 0.34)' : '0 12px 20px rgba(15, 106, 214, 0.08)',
        transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, color 0.25s ease',
      }}
    >
      <strong style={{ color: darkMode ? '#eaf4ff' : '#163553' }}>Ayuda para {module}</strong>
      <div style={{ fontSize: 13, color: darkMode ? '#9fb7cf' : '#6b7280', marginTop: 4, transition: 'color 0.25s ease' }}>
        {content}
      </div>
    </div>
  );
};

export default HelpTab;
