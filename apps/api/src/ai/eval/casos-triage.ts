/** Casos del eval del triage con IA. Las listas son los valores aceptables. */
import type { ClasificacionTriage, TicketTriage } from '../triage-ia.js';

export type CasoTriage = {
  id: string;
  ticket: TicketTriage;
  prioridad: Array<ClasificacionTriage['priority']>;
  tipo: Array<ClasificacionTriage['ticketType']>;
};

export const CASOS_TRIAGE: CasoTriage[] = [
  { id: 't01', ticket: { title: 'URGENTE: se cayeron todas las cámaras del CEDIS', description: 'Sin video en el NVR desde las 3 am', clientName: 'Grupo Tox' }, prioridad: ['P0'], tipo: ['EMERGENCIA'] },
  { id: 't02', ticket: { title: 'Cámara 4 sin imagen', description: 'La cámara del estacionamiento se ve negra desde ayer' }, prioridad: ['P1'], tipo: ['CORRECTIVO'] },
  { id: 't03', ticket: { title: 'Mantenimiento preventivo trimestral', description: 'Limpieza de domos y revisión de grabación', clientName: 'Hospital San Rafael' }, prioridad: ['P3'], tipo: ['PREVENTIVO'] },
  { id: 't04', ticket: { title: 'Instalar 6 cámaras nuevas en bodega', description: 'Ampliación aprobada por el cliente' }, prioridad: ['P2'], tipo: ['INSTALACION'] },
  { id: 't05', ticket: { title: 'Cotización de control de acceso', description: 'El cliente pide precio de 3 lectores biométricos' }, prioridad: ['P2', 'P3'], tipo: ['OTRO'] },
  { id: 't06', ticket: { title: 'Alarma suena sola en las noches', description: 'Panel de la sucursal Atlixco, falsas alarmas' }, prioridad: ['P1', 'P2'], tipo: ['CORRECTIVO'] },
  { id: 't07', ticket: { title: 'Robo en sucursal, necesitan las grabaciones', description: 'La policía pide el video de anoche, urgente' }, prioridad: ['P0'], tipo: ['EMERGENCIA'] },
  { id: 't08', ticket: { title: 'Lector de huella no reconoce a empleados', description: 'Cliente VIP con SLA de 4 horas' }, prioridad: ['P0'], tipo: ['CORRECTIVO', 'EMERGENCIA'] },
  { id: 't09', ticket: { title: 'Cambiar contraseña del DVR', description: 'El gerente nuevo necesita acceso a la app' }, prioridad: ['P2', 'P3'], tipo: ['OTRO', 'CORRECTIVO'] },
  { id: 't10', ticket: { title: 'Puerta principal no abre con tarjeta', description: 'Los empleados no pueden entrar, el control de acceso está fuera de servicio' }, prioridad: ['P0', 'P1'], tipo: ['EMERGENCIA', 'CORRECTIVO'] },
  { id: 't11', ticket: { title: 'Reubicar cámara de recepción', description: 'Quieren moverla dos metros a la izquierda' }, prioridad: ['P2', 'P3'], tipo: ['INSTALACION', 'OTRO'] },
  { id: 't12', ticket: { title: 'Revisión de rutina del rack', description: 'Checklist mensual de servicio' }, prioridad: ['P3'], tipo: ['PREVENTIVO'] },
];
