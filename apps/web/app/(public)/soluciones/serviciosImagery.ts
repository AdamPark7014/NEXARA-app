/**
 * Fotografías de referencia (Unsplash). Sustituir por material propio en /public si lo deseas.
 */
const q = (w: number) => `auto=format&fit=crop&w=${w}&q=82`;

export const SERVICIOS_IMAGES = {
  /** Operación y espacio corporativo */
  hero: `https://images.unsplash.com/photo-1497366216548-37526070297c?${q(1400)}`,
  /** Rack / infraestructura de red */
  offerInfrastructure: `https://images.unsplash.com/photo-1544197150-b99a580bb7a8?${q(900)}`,
  /** Equipos de cómputo y entorno de trabajo */
  offerEquipment: `https://images.unsplash.com/photo-1517694712202-14dd9538aa97?${q(900)}`,
  /** Equipo y servicio coordinado */
  offerManaged: `https://images.unsplash.com/photo-1551434678-e076c223a692?${q(900)}`,
  /** Planificación y control de proyecto */
  processMethod: `https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?${q(1200)}`,
  /** Dirección y mejora continua */
  benefitsContext: `https://images.unsplash.com/photo-1552664730-d307ca884978?${q(1000)}`,
  /** Sedes y operación distribuida */
  integrationVenues: `https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?${q(1000)}`,
  /** Soporte y colaboración */
  includeSupport: `https://images.unsplash.com/photo-1522071820081-009f0129c71c?${q(900)}`,
  /** Inversión y renovación tecnológica */
  includeLeasing: `https://images.unsplash.com/photo-1554224155-6726b3ff858f?${q(900)}`,
} as const;
