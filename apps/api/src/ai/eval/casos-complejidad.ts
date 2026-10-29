/**
 * Casos del eval de la sugerencia de complejidad. Las listas son los niveles aceptables: donde
 * dos personas razonables elegirían distinto, van los dos. Textos inventados (el repo es público).
 */
import type { ActividadAClasificar } from '../complejidad/complejidad-ia.js';
import type { Complejidad } from '../complejidad/tiempos-tipicos.js';

export type CasoComplejidad = { id: string; actividad: ActividadAClasificar; aceptables: Complejidad[] };

export const CASOS_COMPLEJIDAD: CasoComplejidad[] = [
  { id: 'c01', actividad: { tipo: 'Tarea · Entrega', titulo: 'Entregar factura en oficinas de Grupo Tox' }, aceptables: ['BASICA'] },
  { id: 'c02', actividad: { tipo: 'Tarea · Recolección', titulo: 'Recoger 2 cajas de cable UTP en el proveedor' }, aceptables: ['BASICA'] },
  { id: 'c03', actividad: { tipo: 'Tarea · Instalación', titulo: 'Instalar 2 cámaras domo en recepción', indicaciones: 'Ya hay cableado' }, aceptables: ['BASICA', 'ESTANDAR'] },
  { id: 'c04', actividad: { tipo: 'Tarea · Instalación', titulo: 'Instalar 12 cámaras en bodega con tubería conduit', indicaciones: 'Trabajo en altura, 8 m, usar andamio' }, aceptables: ['COMPLEJA'] },
  { id: 'c05', actividad: { tipo: 'Servicio · CORRECTIVO', titulo: 'Cámaras se apagan solas en la noche', indicaciones: 'Falla intermitente desde hace una semana, no se sabe la causa' }, aceptables: ['COMPLEJA'] },
  { id: 'c06', actividad: { tipo: 'Servicio · EMERGENCIA', titulo: 'Sin grabación en todo el CEDIS', indicaciones: 'El NVR no enciende, operación de seguridad detenida' }, aceptables: ['CRITICA'] },
  { id: 'c07', actividad: { tipo: 'Servicio · PREVENTIVO', titulo: 'Preventivo trimestral sucursal Atlixco', indicaciones: 'Limpieza de 6 cámaras y revisión de grabación' }, aceptables: ['ESTANDAR', 'BASICA'] },
  { id: 'c08', actividad: { tipo: 'Tarea · Correctivo y diagnóstico', titulo: 'Control de acceso no abre la puerta principal', indicaciones: 'Los empleados no pueden entrar' }, aceptables: ['CRITICA'] },
  { id: 'c09', actividad: { tipo: 'Tarea · Reporte / documentación', titulo: 'Reporte del servicio de ayer en Hospital San Rafael' }, aceptables: ['BASICA', 'ESTANDAR'] },
  { id: 'c10', actividad: { tipo: 'Tarea · Diseño, CAD y memoria técnica', titulo: 'Memoria técnica y planos del proyecto de 3 plantas', indicaciones: 'CCTV, acceso y red; entregar al cliente el viernes' }, aceptables: ['COMPLEJA'] },
  { id: 'c11', actividad: { tipo: 'Tarea · Configuración y soporte remoto', titulo: 'Cambiar contraseña del DVR del gerente nuevo' }, aceptables: ['BASICA'] },
  { id: 'c12', actividad: { tipo: 'Tarea · Configuración y soporte remoto', titulo: 'Integrar 3 NVR al Hik-Connect del corporativo', indicaciones: 'Coordinar con TI del cliente, puertos y VPN' }, aceptables: ['COMPLEJA'] },
  { id: 'c13', actividad: { tipo: 'Tarea · Cableado y canalización', titulo: 'Tender 1 nodo de red a escritorio' }, aceptables: ['BASICA', 'ESTANDAR'] },
  { id: 'c14', actividad: { tipo: 'Tarea · Cableado y canalización', titulo: 'Canalización de 120 m entre naves para fibra', indicaciones: 'Zanja y tubería, dos cuadrillas' }, aceptables: ['COMPLEJA'] },
  { id: 'c15', actividad: { tipo: 'Tarea · Junta', titulo: 'Junta semanal de operación' }, aceptables: ['ESTANDAR', 'BASICA'] },
  { id: 'c16', actividad: { tipo: 'Tarea · Compra de material', titulo: 'Comprar conectores RJ45 urgente', indicaciones: 'Se acabaron, se ocupan hoy' }, aceptables: ['BASICA'] },
  { id: 'c17', actividad: { tipo: 'Tarea · Levantamiento', titulo: 'Levantamiento para cotizar CCTV en plaza comercial', indicaciones: '4 accesos, estacionamiento y 30 locales' }, aceptables: ['COMPLEJA', 'ESTANDAR'] },
  { id: 'c18', actividad: { tipo: 'Tarea · Evento o guardia', titulo: 'Guardia nocturna por robo en sucursal', indicaciones: 'Revisar grabaciones con la policía y dejar el sistema operando' }, aceptables: ['CRITICA'] },
  { id: 'c19', actividad: { tipo: 'Tarea · Facturación y contabilidad', titulo: 'Facturar los servicios de octubre' }, aceptables: ['ESTANDAR'] },
  { id: 'c20', actividad: { tipo: 'Tarea · Capacitación', titulo: 'Capacitar al guardia en el uso del monitor' }, aceptables: ['BASICA', 'ESTANDAR'] },
  { id: 'c21', actividad: { tipo: 'Tarea · Mantenimiento preventivo', titulo: 'URGENTE limpieza de domos en recepción', indicaciones: 'Se ven empañados' }, aceptables: ['BASICA', 'ESTANDAR'] },
  { id: 'c22', actividad: { tipo: 'Obra', titulo: 'Montaje de rack y migración de red en corporativo', indicaciones: 'Fin de semana, sin cortar operación del lunes' }, aceptables: ['COMPLEJA', 'CRITICA'] },
];
