/**
 * Tipos de actividad que entiende el asistente y a quién se le puede asignar cada uno.
 *
 * Archivo hoja (solo importa los correos de las cuentas, que no importan nada): lo comparten `asistente-actividades.ts` y
 * `complejidad/tiempos-tipicos.ts` sin dependencia circular.
 */
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail } from '../../common/platform-accounts.js';

export const TIPOS_ACTIVIDAD = ['tarea', 'proyecto', 'obra', 'servicio', 'comercial'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

/**
 * Subtipos de Tarea: el catálogo cerrado del 28-10 (mismos textos que `TAREA_TIPOS` en la web;
 * viajan en ticketTypeCustom). «Otro» ya no se ofrece al modelo: queda solo de respaldo si no
 * elige ninguno.
 */
export const SUBTIPOS_TAREA = [
  'Instalación',
  'Cableado y canalización',
  'Mantenimiento preventivo',
  'Correctivo y diagnóstico',
  'Levantamiento',
  'Recolección',
  'Entrega',
  'Preparación de equipo',
  'Diseño, CAD y memoria técnica',
  'Configuración y soporte remoto',
  'Trámite',
  'Compra de material',
  'Facturación y contabilidad',
  'Reporte / documentación',
  'Capacitación',
  'Junta',
  'Evento o guardia',
] as const;

export const TIPOS_SERVICIO = ['PREVENTIVO', 'CORRECTIVO', 'EMERGENCIA', 'INSTALACION'] as const;

/**
 * Qué recibe cada persona: espejo de `RECEIVE_BY_EMAIL` en `apps/web/lib/activity-kinds.ts`, que es
 * lo que la tarjeta exige al confirmar. Quien no está aquí solo recibe tarea (toda la cuadrilla
 * nueva). Sin esto el asistente proponía un servicio a quien no lo puede recibir y la tarjeta
 * quedaba bloqueada.
 */
const RECIBE_POR_CORREO: Record<string, readonly TipoActividad[]> = {
  'operaciones@nexara.com.mx': ['tarea', 'proyecto', 'obra', 'comercial'],
  'direccion.operaciones@nexara.com.mx': ['tarea', 'proyecto', 'servicio', 'comercial'],
  'jose.ramirez@nexara.com.mx': ['tarea', 'proyecto', 'servicio', 'comercial'],
  'joan.sanchez@nexara.com.mx': ['tarea', 'proyecto', 'obra'],
  'israel.ramos@nexara.com.mx': ['tarea', 'proyecto', 'obra'],
  'juan.gonzalez@nexara.com.mx': ['tarea', 'proyecto', 'obra'],
  'soporte@nexara.com.mx': ['tarea', 'proyecto', 'servicio'],
  'alejandro.gonzalez@nexara.com.mx': ['tarea', 'proyecto', 'servicio'],
  'roberto.vivanco@nexara.com.mx': ['tarea', 'proyecto', 'servicio'],
  'daniela.hernandez@nexara.com.mx': ['tarea', 'comercial'],
  'soluciones@nexara.com.mx': ['tarea', 'comercial'],
  'finanzas@nexara.com.mx': ['tarea', 'comercial'],
  'infraestructura@nexara.com.mx': ['tarea', 'proyecto', 'obra', 'comercial'],
};

export function tiposQueRecibe(email: string | null | undefined): TipoActividad[] {
  return [...(RECIBE_POR_CORREO[(email ?? '').trim().toLowerCase()] ?? ['tarea'])];
}

/**
 * Lo que asigna cada quien: espejo de `CREATE_BY_EMAIL` en `apps/web/lib/activity-kinds.ts`. Quién
 * entra a «Asignar con IA» no se decide aquí, sino en `quien-asigna.ts`, por su gente a cargo.
 */
const CREA_POR_CORREO: Record<string, readonly TipoActividad[]> = {
  'operaciones@nexara.com.mx': ['tarea', 'proyecto', 'obra', 'comercial'],
  'direccion.operaciones@nexara.com.mx': ['tarea', 'proyecto', 'servicio', 'comercial'],
  'jose.ramirez@nexara.com.mx': ['tarea', 'proyecto', 'servicio', 'comercial'],
  'daniela.hernandez@nexara.com.mx': ['tarea', 'comercial'],
  'soluciones@nexara.com.mx': ['tarea', 'comercial'],
  'finanzas@nexara.com.mx': ['tarea', 'comercial'],
  'infraestructura@nexara.com.mx': ['tarea', 'proyecto', 'obra', 'comercial'],
};

/** Lo que puede asignar quien escribe. Dirección, todo; un mando sin renglón aquí, tareas, como en la web. */
export function tiposQueCrea(email: string | null | undefined): TipoActividad[] {
  if (isCeoEquivalentEmail(email) || isDeveloperSuperAdminEmail(email)) return [...TIPOS_ACTIVIDAD];
  return [...(CREA_POR_CORREO[(email ?? '').trim().toLowerCase()] ?? ['tarea'])];
}

const TAREA_DE_SERVICIO: Record<string, (typeof SUBTIPOS_TAREA)[number]> = {
  CORRECTIVO: 'Correctivo y diagnóstico',
  EMERGENCIA: 'Correctivo y diagnóstico',
  PREVENTIVO: 'Mantenimiento preventivo',
  INSTALACION: 'Instalación',
};

/** Lo que dice el verbo del título cuando el tipo que llegó no sirve («Capacitar…» no es un correctivo). */
const TAREA_POR_TITULO: Array<[RegExp, (typeof SUBTIPOS_TAREA)[number]]> = [
  [/^capacit/, 'Capacitación'],
  [/^configur/, 'Configuración y soporte remoto'],
  [/^(llevar|entregar)/, 'Entrega'],
  [/^(recoger|recolectar|ir por)/, 'Recolección'],
  [/^preparar/, 'Preparación de equipo'],
  [/^levant/, 'Levantamiento'],
];

/** La tarea que equivale a un trabajo cuando su tipo no se puede usar (mismo mapeo que la web). */
export function subtipoEquivalente(tipo: TipoActividad, subtipo: string | null | undefined, titulo?: string | null): (typeof SUBTIPOS_TAREA)[number] {
  const inicio = (titulo ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  const delTitulo = TAREA_POR_TITULO.find(([verbo]) => verbo.test(inicio))?.[1];
  if (delTitulo) return delTitulo;
  if (tipo === 'servicio') return TAREA_DE_SERVICIO[subtipo ?? ''] ?? 'Correctivo y diagnóstico';
  if (tipo === 'obra') return 'Instalación';
  return 'Reporte / documentación';
}
