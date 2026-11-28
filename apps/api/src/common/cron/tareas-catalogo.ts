import { CronExpression } from '@nestjs/schedule';

/**
 * Catálogo de las tareas programadas del API: una fila por cada `@Cron`, con su horario, su zona, a qué área
 * pertenece y qué hace. Lo lee el vigilante de tareas (`evaluar-tareas.ts`) para saber cada cuánto debe latir cada una.
 *
 * REGLA PARA TODO `@Cron` NUEVO (la hace cumplir `tareas-catalogo.spec.ts`; si no, falla CI)
 * ------------------------------------------------------------------------------------------
 *   1. Lleva `name` único en todo el repo (si dos coinciden, `SchedulerOrchestrator` se queda con una sola en silencio).
 *   2. Su cuerpo corre dentro de `runScheduledJob('<nombre>', this.logger, () => ...)`.
 *   3. Tiene aquí su fila, con ese mismo `<nombre>` como clave y el MISMO horario que el decorador.
 *   4. Un interruptor (variable de entorno, fila de `system_settings`, servicio opcional) va DENTRO del trabajo, no antes
 *      de `runScheduledJob`: apagada a propósito, la tarea debe seguir latiendo («ok») y no actuar. Si el interruptor
 *      saliera antes, la tarea nunca dejaría latido y el vigilante la daría por atrasada (falsa alarma). Lo único que
 *      puede ir antes es `if (process.env.NEXARA_RELEVO === '1') return;` (el relevo no corre tareas y el juez lo trata
 *      aparte). También lo hace cumplir `tareas-catalogo.spec.ts`.
 *
 * LA CLAVE es el nombre que se le pasa a `runScheduledJob`, NO el `name` del `@Cron`: en 25 tareas difieren (por
 * ejemplo `actividades:atrasadas` contra `actividades-atrasadas`) y no se renombran para no tocar 25 archivos más.
 *
 * `cron`: la cadena del decorador (o el valor de `CronExpression.X` si el decorador la usa). Se lee por el hueco
 *   máximo entre disparos (`cron-periodo.ts`), así que una tarea de lunes a viernes puede callar 72 horas sin falla.
 * `zona`: `MX` si el decorador trae `timeZone` de México; `UTC` si no (el contenedor corre en UTC). Es informativa:
 *   el hueco entre disparos no depende del huso.
 * `critica`: si falla o se atrasa, el vigilante pone el semáforo en rojo. Es una propuesta que Adam confirma.
 * `factor`: cuántos periodos de silencio se toleran antes de marcarla atrasada (2 por omisión: «no corre en el doble
 *   de su periodo»).
 * `externo`: la tarea no es un `@Cron` de este proceso (la corre el servidor, por ejemplo un respaldo) y el latido
 *   llega por otra vía. La guardiana no exige su `@Cron`.
 *
 * Pendiente de otros cambios del paquete: C8 agrega `pulso:limpieza` y `externo:respaldo-nexara` (`externo: true`).
 * (C6 ya dejó una sola purga de la bitácora: `audit-cleanup` se borró y `purga-bitacora` corre los domingos.)
 */
export interface TareaCatalogo {
  cron: string;
  zona: 'MX' | 'UTC';
  grupo: string;
  /** Qué hace, en una línea y en español sencillo (lo ve Adam en el parte). */
  que: string;
  critica?: boolean;
  factor?: number;
  externo?: boolean;
}

export const FACTOR_OMISION = 2;

export const TAREAS_CATALOGO: Record<string, TareaCatalogo> = {
  // ── Actividades ──────────────────────────────────────────────────────────────────────────────
  'actividades:atrasadas': {
    cron: '*/5 * * * *', zona: 'UTC', grupo: 'actividades', critica: true,
    que: 'Avisa de las actividades que ya pasaron su fecha de entrega.',
  },
  'actividades:tiempo-excedido': {
    cron: '*/15 * * * *', zona: 'UTC', grupo: 'actividades',
    que: 'Avisa cuando una actividad en curso lleva más tiempo del estimado.',
  },
  'actividades:recordatorios-jornada': {
    cron: '*/5 * * * *', zona: 'UTC', grupo: 'actividades',
    que: 'Con la jornada abierta, recuerda a quien no tiene actividad corriendo o a quien se le vence una.',
  },
  'actividades-barrido-no-cumplida': {
    cron: '10 0 * * *', zona: 'MX', grupo: 'actividades', critica: true,
    que: 'De madrugada marca «No cumplida» lo que quedó sin entregar al terminar el día.',
  },
  'evidencias:escaladas': {
    cron: '30 10 * * 1-5', zona: 'MX', grupo: 'actividades',
    que: 'Sube de nivel las evidencias que nadie ha revisado.',
  },
  'resumen-diario-direccion': {
    cron: '30 8 * * *', zona: 'MX', grupo: 'direccion',
    que: 'Manda a dirección el resumen de lo que se cerró o detectó solo en las últimas 24 horas.',
  },
  'ticket-alerts:sla-proximo': {
    cron: '*/1 * * * *', zona: 'UTC', grupo: 'actividades', critica: true,
    que: 'Avisa de los tickets cuyo plazo de atención está por vencer.',
  },
  'sla-breach-escalate': {
    cron: CronExpression.EVERY_HOUR, zona: 'UTC', grupo: 'actividades', critica: true,
    que: 'Avisa a responsables y jefes de los tickets que ya vencieron su plazo.',
  },

  // ── Asistencia y jornada ─────────────────────────────────────────────────────────────────────
  'asistencia:recordatorio-entrada': {
    cron: '* * * * *', zona: 'UTC', grupo: 'asistencia', critica: true,
    que: 'Da los buenos días y recuerda checar la entrada a quien aún no ha checado.',
  },
  'attendance-cierre-automatico': {
    cron: '30 23 * * *', zona: 'MX', grupo: 'asistencia', critica: true, factor: 1.5,
    que: 'A las 23:30 cierra la jornada de quien olvidó checar su salida.',
  },
  'attendance-cierre-noche': {
    cron: '5 * * * *', zona: 'MX', grupo: 'asistencia', critica: true, factor: 1.5,
    que: 'Cada hora cierra los turnos de noche que pasaron su tope sin salida.',
  },
  'comida:avisos': {
    cron: '* 12-18 * * *', zona: 'MX', grupo: 'asistencia',
    que: 'Avisa a cada persona de su hora de comida y de su regreso.',
  },
  'gps-latido-jornada': {
    cron: '*/5 * * * *', zona: 'UTC', grupo: 'asistencia',
    que: 'Le pide un punto de ubicación al teléfono de quien lleva rato sin enviarlo.',
  },
  'celebraciones': {
    cron: '0 8,11,14 * * *', zona: 'MX', grupo: 'rh',
    que: 'Felicita cumpleaños y aniversarios del día.',
  },
  'festivos:aviso': {
    cron: '0 10,13 * * *', zona: 'MX', grupo: 'rh',
    que: 'Avisa de los días festivos que se acercan.',
  },
  'rh-alertas-diarias': {
    cron: '0 9 * * *', zona: 'MX', grupo: 'rh',
    que: 'Avisa a RH de documentos por vencer, contratos por terminar y personas sin jefe.',
  },
  'rh-escalar-solicitudes-24h': {
    cron: '15 * * * *', zona: 'MX', grupo: 'rh',
    que: 'Sube de nivel las solicitudes de vacaciones o permiso que llevan más de 24 horas sin respuesta.',
  },
  'inactive-users-warn': {
    cron: '0 9 * * *', zona: 'MX', grupo: 'rh',
    que: 'Avisa de los usuarios que llevan 30 días sin entrar.',
  },

  // ── Avisos y seguimiento comercial ───────────────────────────────────────────────────────────
  'avisos:recortes': {
    cron: '0 9 * * 1-6', zona: 'MX', grupo: 'avisos',
    que: 'Avisa al desarrollador cuando una consulta se cortó por llegar al tope de filas.',
  },
  'avisos:resumen': {
    cron: '0 11,17 * * 1-6', zona: 'MX', grupo: 'avisos',
    que: 'Dos veces al día junta en una sola tarjeta los avisos agrupados de cada persona.',
  },
  'avisos:proyectos-incompletos': {
    cron: '0 9 * * 1-6', zona: 'MX', grupo: 'avisos',
    que: 'Avisa a quien creó un proyecto al que todavía le faltan datos.',
  },
  'cotizaciones:seguimiento': {
    cron: '0 10 * * 1-6', zona: 'MX', grupo: 'cotizaciones',
    que: 'Le pregunta a quien hizo la cotización cómo va y qué pasó con sus borradores.',
  },
  'cotizaciones-vencidas': {
    cron: '0 6 * * *', zona: 'MX', grupo: 'cotizaciones',
    que: 'Marca como vencidas las cotizaciones enviadas cuya vigencia ya pasó.',
  },
  'cotizaciones-por-vencer': {
    cron: '5 10 * * 1-6', zona: 'MX', grupo: 'cotizaciones',
    que: 'Avisa de las cotizaciones que vencen en los próximos 3 días.',
  },
  'cotizaciones-borrador-vencidas': {
    cron: '0 */30 * * * *', zona: 'UTC', grupo: 'cotizaciones',
    que: 'Avisa de los borradores de cotización que vencieron sin enviarse.',
  },
  'ceo-daily-brief': {
    cron: '0 8 * * 1-5', zona: 'MX', grupo: 'direccion',
    que: 'Prepara el parte diario del director.',
  },
  'supervision:plan-manana': {
    cron: '0 17 * * 1-5', zona: 'MX', grupo: 'supervision',
    que: 'Recuerda a los supervisores armar el plan de mañana.',
  },
  'supervision:cierre-dia': {
    cron: '30 18 * * 1-5', zona: 'MX', grupo: 'supervision',
    que: 'Recuerda a los supervisores cerrar el día.',
  },
  'chat:reparar-canales': {
    cron: '20 4 * * *', zona: 'MX', grupo: 'chat',
    que: 'Repara los canales de chat por omisión y las membresías que quedaron incompletas.',
  },

  // ── Dinero, compras y almacén ────────────────────────────────────────────────────────────────
  'overdue-invoices': {
    cron: '0 8 * * *', zona: 'MX', grupo: 'finanzas',
    que: 'Avisa de las facturas vencidas.',
  },
  'gestion-viaticos:tickets-hoy': {
    cron: '0 15 * * *', zona: 'MX', grupo: 'finanzas',
    que: 'A las 15:00 recuerda los tickets de viáticos que vencen hoy y siguen por facturar.',
  },
  'costos:libro': {
    cron: '20 3 * * *', zona: 'MX', grupo: 'finanzas',
    que: 'Recalcula de madrugada el libro de costos de los proyectos.',
  },
  'project-margin-alerts': {
    cron: '0 10 * * *', zona: 'MX', grupo: 'finanzas',
    que: 'Avisa de los proyectos con costos que se comen su margen.',
  },
  'alertas-margen': {
    cron: CronExpression.EVERY_HOUR, zona: 'UTC', grupo: 'finanzas',
    que: 'Avisa de los proyectos con margen real por debajo del 10 %.',
  },
  'po-reminders': {
    cron: '0 9 * * *', zona: 'MX', grupo: 'compras',
    que: 'Recuerda las órdenes de compra que llegan en los próximos 3 días.',
  },
  'purchase-orders-overdue': {
    cron: '30 9 * * 1-5', zona: 'MX', grupo: 'compras',
    que: 'Manda un resumen de las órdenes de compra que ya pasaron su fecha esperada sin recibirse.',
  },
  'inventory-health-alerts': {
    cron: '0 7 * * *', zona: 'MX', grupo: 'inventario',
    que: 'Avisa del inventario bajo y del que lleva 90 días sin moverse.',
  },
  'alertas-stock': {
    cron: CronExpression.EVERY_2_HOURS, zona: 'UTC', grupo: 'inventario',
    que: 'Avisa de los productos por debajo de su mínimo en el almacén.',
  },
  'reabastecimiento-diario': {
    cron: CronExpression.EVERY_DAY_AT_3AM, zona: 'MX', grupo: 'inventario',
    que: 'Recalcula de madrugada los mínimos y máximos de cada producto según su consumo.',
  },
  'herramientas-por-vencer': {
    cron: CronExpression.EVERY_DAY_AT_8AM, zona: 'MX', grupo: 'inventario',
    que: 'Avisa de las herramientas prestadas que vencen pronto.',
  },
  'kits-por-inspeccionar': {
    cron: '30 8 * * *', zona: 'MX', grupo: 'inventario',
    que: 'Avisa de los kits de herramienta que ya tocaba revisar.',
  },
  'herramientas-vencidas': {
    cron: '0 9 * * *', zona: 'MX', grupo: 'inventario',
    que: 'Avisa de los préstamos de herramienta cuyo día de devolución ya pasó.',
  },

  // ── Mantenimiento y vehículos ────────────────────────────────────────────────────────────────
  'maintenance-contracts-auto-ot': {
    cron: '15 * * * *', zona: 'UTC', grupo: 'mantenimiento',
    que: 'Genera las órdenes de trabajo de los contratos de mantenimiento que ya tocan.',
  },
  'maintenance-reminders': {
    cron: '0 7 * * *', zona: 'MX', grupo: 'mantenimiento',
    que: 'Avisa de los mantenimientos planeados para los próximos 7 días.',
  },
  'alertas-sla-mantenimiento': {
    cron: CronExpression.EVERY_30_MINUTES, zona: 'UTC', grupo: 'mantenimiento',
    que: 'Avisa de las visitas de mantenimiento cuyo plazo está por vencer o ya venció.',
  },
  'vehicle-usage-expiring': {
    cron: '0 8,16 * * *', zona: 'MX', grupo: 'vehiculos',
    que: 'Avisa de las asignaciones de vehículo que vencen en las próximas 24 horas.',
  },
  'vehiculos-avisos-retraso': {
    cron: '*/10 8-20 * * *', zona: 'MX', grupo: 'vehiculos',
    que: 'Avisa de las unidades que no se han devuelto a tiempo.',
  },
  'workflow-timeouts': {
    cron: CronExpression.EVERY_HOUR, zona: 'UTC', grupo: 'flujos',
    que: 'Escala las aprobaciones que pasaron el plazo de su paso.',
  },

  // ── Contabilidad ─────────────────────────────────────────────────────────────────────────────
  'buzon-sat:diario': {
    cron: '0 6 * * *', zona: 'MX', grupo: 'contabilidad',
    que: 'Pone en cola la descarga diaria de comprobantes del buzón del SAT.',
  },
  'buzon-sat:69b': {
    cron: '0 7 * * 1', zona: 'MX', grupo: 'contabilidad',
    que: 'Actualiza la lista 69-B del SAT (contribuyentes con operaciones presuntamente inexistentes).',
  },

  // ── Catálogo CT (mayorista) ──────────────────────────────────────────────────────────────────
  'ct-catalog-json-sync': {
    cron: '*/15 * * * *', zona: 'UTC', grupo: 'ct', critica: true,
    que: 'Pone en cola la actualización de precio y existencia del catálogo de CT.',
  },
  'ct-catalog-xml-sync': {
    cron: '0 6,14,22 * * *', zona: 'UTC', grupo: 'ct',
    que: 'Pone en cola la actualización completa del catálogo de CT, tres veces al día.',
  },

  // ── INTEGRA (cámaras y control de acceso) ────────────────────────────────────────────────────
  'integra-reconciliar-espejo': {
    cron: '*/15 * * * *', zona: 'UTC', grupo: 'integra', critica: true,
    que: 'Compara el espejo de INTEGRA con los equipos de cada sitio y corrige diferencias.',
  },
  'integra-precalentado-streams': {
    cron: '*/10 * * * *', zona: 'UTC', grupo: 'integra',
    que: 'Registra en el servidor de video las cámaras que le faltan, para que el muro abra rápido.',
  },
  'integra-sondeo-capacidades': {
    cron: '41 3 * * *', zona: 'UTC', grupo: 'integra',
    que: 'Una vez al día pregunta a las cámaras que nunca se han sondeado qué saben hacer.',
  },
  'integra-purga-diaria': {
    cron: '27 4 * * *', zona: 'MX', grupo: 'integra',
    que: 'Borra los eventos viejos de las cámaras y sus fotos.',
  },
  'integra-purga-ruido': {
    cron: '17 * * * *', zona: 'UTC', grupo: 'integra',
    que: 'Cada hora borra el ruido de eventos (latidos y movimiento) para cuidar el disco.',
  },
  'integra-visitas-expiran': {
    cron: '12 * * * *', zona: 'UTC', grupo: 'integra',
    que: 'Da de baja en los equipos a las visitas recurrentes que ya vencieron.',
  },

  // ── Sistema ──────────────────────────────────────────────────────────────────────────────────
  'kpi-snapshot': {
    cron: CronExpression.EVERY_HOUR, zona: 'UTC', grupo: 'sistema',
    que: 'Guarda cada hora una foto de los números del negocio para las gráficas.',
  },
  'webhook-retries': {
    cron: CronExpression.EVERY_5_MINUTES, zona: 'UTC', grupo: 'sistema', critica: true,
    que: 'Reintenta los avisos a sistemas externos que no se pudieron entregar.',
  },
  'purga-bitacora': {
    cron: '15 4 * * 0', zona: 'MX', grupo: 'sistema',
    que: 'Los domingos borra de la bitácora, por tandas, lo que pasó la retención configurada (si nadie la cambia, 90 días).',
  },

  // ── Pulso (vigilancia de las propias tareas) ─────────────────────────────────────────────────
  'pulso:vigilante': {
    cron: '*/5 * * * *', zona: 'UTC', grupo: 'pulso',
    que: 'Cada 5 minutos revisa que las demás tareas sigan corriendo y deja un solo aviso en el log por cada una que se atrase o se atore.',
  },
};
