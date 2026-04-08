/**
 * Fotos de ejemplo (Unsplash, uso acorde a su licencia).
 * Sustituye por assets propios cuando los tengas en /public.
 */
const u = (id: string, sig: string) =>
  `https://images.unsplash.com/photo-${id}-${sig}?auto=format&fit=crop&w=1200&q=82`;

export const PROYECTOS_SECTOR_COVERS = {
  "computo-empresarial": u("1517694712202", "14dd9538aa97"), // laptop / desarrollo
  "redes-conectividad": u("1544197150", "b99a580bb7a8"), // infraestructura de red / rack
  "videovigilancia-seguridad": u("1563986768609", "322da13575f3"), // CCTV / seguridad (ID verificado)
  licenciamiento: u("1460925895917", "afdab827c52f"), // tablero / software analítico
  gubernamental: u("1486406146926", "c627a92ad1ab"), // edificio institucional
  educativo: u("1503676260728", "1c00da094a0b"), // aula / aprendizaje
  pymes: u("1600880292203", "757bb62b4baf"), // equipo en oficina
  salud: u("1579684385127", "1ef15d508118"), // entorno clínico
  industrial: u("1581092160562", "40aa08e78837"), // planta / ingeniería
} as const;
