import { SERVICIOS_IMAGES } from "../servicios/serviciosImagery";
import { PROYECTOS_SECTOR_COVERS } from "../proyectos/proyectosSectorCovers";

/**
 * Fotografía principal por servicio (mismas fuentes que /servicios y /proyectos).
 */
export const SOLUCION_SERVICE_IMAGES: Record<string, string> = {
  "erp-industrial": SERVICIOS_IMAGES.processMethod,
  "camaras-cctv": PROYECTOS_SECTOR_COVERS["videovigilancia-seguridad"],
  "equipo-de-computo": SERVICIOS_IMAGES.offerEquipment,
  "redes-y-conectividad": SERVICIOS_IMAGES.offerInfrastructure,
  "soporte-ti-pyme": SERVICIOS_IMAGES.includeLeasing,
  "ciberseguridad-empresas": SERVICIOS_IMAGES.benefitsContext,
  "infraestructura-ti": SERVICIOS_IMAGES.integrationVenues,
  "mesa-de-ayuda-ti": SERVICIOS_IMAGES.includeSupport,
  "automatizacion-de-procesos": SERVICIOS_IMAGES.hero,
  "servicios-gestionados-ti": SERVICIOS_IMAGES.offerManaged,
};

export function getSolucionHeroImage(serviceSlug: string): string {
  return SOLUCION_SERVICE_IMAGES[serviceSlug] ?? SERVICIOS_IMAGES.hero;
}
