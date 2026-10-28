export type Integrante = { clave: string; nombre: string; rol: string };

/**
 * Equipo que se muestra en Nosotros: el organigrama sin la dirección general, sin quien todavía no tiene retrato
 * con uniforme y sin Mónica García (Adam pidió quitarla el 28-10). Nombre corto (nombre y primer apellido) y puesto
 * del organigrama. El retrato vive en `/public/fotos/equipo/<clave>.webp`, recortado a fondo transparente para que
 * sirva en claro y en oscuro.
 */
export const EQUIPO: Integrante[] = [
  { clave: "josue-cervantes", nombre: "Josué Cervantes", rol: "Encargado de obra" },
  { clave: "david-morales", nombre: "David Morales", rol: "Encargado de instalación" },
  { clave: "luis-aguilar", nombre: "Luis Joel Aguilar", rol: "Encargado de servicios" },
  { clave: "jose-ramirez", nombre: "José Antonio Ramírez", rol: "Encargado de soporte" },
  { clave: "daniela-hernandez", nombre: "Daniela Hernández", rol: "Encargada comercial" },
  { clave: "alejandro-gonzalez", nombre: "Alejandro González", rol: "Ingeniero de soporte" },
  { clave: "carolina-juarez", nombre: "Carolina Juárez", rol: "Ingeniera de campo" },
  { clave: "roberto-vivanco", nombre: "Roberto Vivanco", rol: "Ingeniero de campo" },
  { clave: "ivan-camargo", nombre: "Iván Camargo", rol: "Técnico instalador" },
  { clave: "israel-ramos", nombre: "Israel Ramos", rol: "Técnico instalador" },
  { clave: "paulina-tlapaltotoli", nombre: "Paulina Tlapaltotoli", rol: "Contadora general" },
];

export const retrato = (clave: string) => `/fotos/equipo/${clave}.webp`;
