/**
 * Empresa ficticia para el eval de IA (el repo es público: ningún dato real).
 * Misma forma que arman los servicios con Prisma.
 */
import type { CatalogosNexara } from '../asistente/asistente-actividades.js';

/** Miércoles 21 de octubre de 2026, 10:30 en Ciudad de México (UTC-6). */
export const AHORA = new Date('2026-10-21T16:30:00Z');
export const AUTOR = 'Adriana Morales Paz';

export const PERSONAS = [
  { id: 1, nombre: 'José Antonio Ramírez Ortega', puesto: 'Técnico de campo' },
  { id: 2, nombre: 'Carolina Pérez Lima', puesto: 'Coordinadora de servicio' },
  { id: 3, nombre: 'Luis Fernando Gómez Reyes', puesto: 'Técnico de campo' },
  { id: 4, nombre: 'María Fernanda Ruiz Cano', puesto: 'Ejecutiva comercial' },
  { id: 5, nombre: 'Ricardo Hernández Salas', puesto: 'Supervisor de obra' },
  { id: 6, nombre: 'Diana Sánchez Mora', puesto: 'Ingeniera de proyectos' },
  { id: 7, nombre: 'Jorge Méndez Aguilar', puesto: 'Almacén y compras' },
  { id: 8, nombre: 'Alejandra Torres Vega', puesto: 'Administración' },
  { id: 9, nombre: 'Antonio Vázquez Luna', puesto: 'Técnico de campo' },
  { id: 10, nombre: 'Patricia Lozano Ibarra', puesto: 'Recepción' },
  { id: 11, nombre: 'Roberto Castillo Núñez', puesto: 'Jefe de soporte' },
  { id: 12, nombre: 'Adriana Morales Paz', puesto: 'Directora de operaciones' },
];

export const CATALOGO: CatalogosNexara = {
  personas: PERSONAS.map((p) => ({ ...p, email: null })),
  clientes: [
    { id: 101, name: 'Grupo Tox' },
    { id: 102, name: 'Hospital San Rafael' },
    { id: 103, name: 'Bodegas Luna' },
    { id: 104, name: 'Colegio Andes' },
    { id: 105, name: 'Hotel Real de Cholula' },
  ],
  sucursales: [
    { id: 201, clientId: 101, clientName: 'Grupo Tox', name: 'CEDIS Puebla', branchNumber: null, address: null, city: 'Puebla', state: 'Puebla' },
    { id: 202, clientId: 101, clientName: 'Grupo Tox', name: 'Nave 2 Cuautlancingo', branchNumber: null, address: null, city: 'Cuautlancingo', state: 'Puebla' },
    { id: 203, clientId: 102, clientName: 'Hospital San Rafael', name: 'Torre Médica', branchNumber: null, address: null, city: 'Puebla', state: 'Puebla' },
    { id: 204, clientId: 103, clientName: 'Bodegas Luna', name: 'Sucursal 14 Angelópolis', branchNumber: '14', address: null, city: 'Puebla', state: 'Puebla' },
    { id: 205, clientId: 103, clientName: 'Bodegas Luna', name: 'Sucursal 22 Atlixco', branchNumber: '22', address: null, city: 'Atlixco', state: 'Puebla' },
    { id: 206, clientId: 104, clientName: 'Colegio Andes', name: 'Campus Zavaleta', branchNumber: null, address: null, city: 'Puebla', state: 'Puebla' },
  ],
  proyectos: [
    { id: 301, title: 'Videovigilancia CEDIS Tox', clientId: 101, clientName: 'Grupo Tox' },
    { id: 302, title: 'Control de acceso Colegio Andes', clientId: 104, clientName: 'Colegio Andes' },
    { id: 303, title: 'Red y CCTV Hotel Real', clientId: 105, clientName: 'Hotel Real de Cholula' },
  ],
};
