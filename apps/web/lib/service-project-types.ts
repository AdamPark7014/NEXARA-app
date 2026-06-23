/** Espejo web — tipos de proyecto/servicio ERP IT/CCTV. */

export const SERVICE_PROJECT_TYPES = {
  INSTALACION_CCTV: 'INSTALACION_CCTV',
  CABLEADO_ESTRUCTURADO: 'CABLEADO_ESTRUCTURADO',
  CONTROL_ACCESO: 'CONTROL_ACCESO',
  REDES_WIFI: 'REDES_WIFI',
  COMPUTO: 'COMPUTO',
  AUDITORIA_NODOS: 'AUDITORIA_NODOS',
  MANTENIMIENTO: 'MANTENIMIENTO',
  SUSTITUCION_EQUIPOS: 'SUSTITUCION_EQUIPOS',
  PROYECTO_INTEGRAL: 'PROYECTO_INTEGRAL',
  OTRO: 'OTRO',
} as const;

export type ServiceProjectType = (typeof SERVICE_PROJECT_TYPES)[keyof typeof SERVICE_PROJECT_TYPES];

export type ServiceProjectTypeMeta = {
  value: ServiceProjectType;
  label: string;
  description: string;
  example?: string;
};

export const SERVICE_PROJECT_TYPE_OPTIONS: ServiceProjectTypeMeta[] = [
  {
    value: SERVICE_PROJECT_TYPES.PROYECTO_INTEGRAL,
    label: 'Proyecto integral',
    description: 'Varios frentes en un solo despliegue: CCTV, cableado, acceso, cómputo, etc.',
    example: 'Polos del Bienestar — 128 cámaras, cableado, dron, pantallas y control de acceso',
  },
  {
    value: SERVICE_PROJECT_TYPES.INSTALACION_CCTV,
    label: 'Instalación CCTV',
    description: 'Cámaras, NVR, monitoreo y puesta en marcha.',
  },
  {
    value: SERVICE_PROJECT_TYPES.CABLEADO_ESTRUCTURADO,
    label: 'Cableado estructurado',
    description: 'Infraestructura de red, racks, patch panels y certificación.',
  },
  {
    value: SERVICE_PROJECT_TYPES.CONTROL_ACCESO,
    label: 'Control de acceso',
    description: 'Torniquetes, lectores, credenciales e integración.',
  },
  {
    value: SERVICE_PROJECT_TYPES.REDES_WIFI,
    label: 'Redes y WiFi',
    description: 'Enlaces, switches, APs y segmentación.',
  },
  {
    value: SERVICE_PROJECT_TYPES.COMPUTO,
    label: 'Cómputo y endpoints',
    description: 'Equipos, impresoras, comandera, POS.',
  },
  {
    value: SERVICE_PROJECT_TYPES.AUDITORIA_NODOS,
    label: 'Auditoría de nodos / sucursales',
    description: 'Levantamiento por sucursal: qué funciona y qué cambiar.',
    example: 'Soriana — gestión de nodos en todas las sucursales',
  },
  {
    value: SERVICE_PROJECT_TYPES.MANTENIMIENTO,
    label: 'Mantenimiento',
    description: 'Preventivo o correctivo.',
    example: 'TOKS — mantenimiento de impresoras y comandera',
  },
  {
    value: SERVICE_PROJECT_TYPES.SUSTITUCION_EQUIPOS,
    label: 'Sustitución de equipos',
    description: 'Cambio de cabezal, comandera, impresora u otro componente.',
  },
  {
    value: SERVICE_PROJECT_TYPES.OTRO,
    label: 'Otro',
    description: 'Servicio no catalogado.',
  },
];

export const SERVICE_PROJECT_TYPE_BY_VALUE = Object.fromEntries(
  SERVICE_PROJECT_TYPE_OPTIONS.map((o) => [o.value, o]),
) as Record<ServiceProjectType, ServiceProjectTypeMeta>;

export function getServiceProjectTypeLabel(value?: string | null): string {
  if (!value) return 'Sin tipo';
  return SERVICE_PROJECT_TYPE_BY_VALUE[value as ServiceProjectType]?.label ?? value;
}

export const DEFAULT_CATALOG_CATEGORIES = [
  'CCTV',
  'Control de acceso',
  'Cableado estructurado',
  'Redes',
  'Cómputo',
  'Impresión / POS',
  'Drones / inspección',
  'Pantallas / señalización',
  'Servicios',
  'Mantenimiento',
];
