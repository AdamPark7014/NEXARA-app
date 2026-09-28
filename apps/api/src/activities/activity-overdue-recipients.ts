/**
 * A quién se le avisa cuando una actividad entra en rojo.
 *
 * - Quien la tiene (responsable y el equipo que sigue asignado).
 * - El jefe directo de cada uno (`managerId`, un solo nivel).
 * - La coordinación del mismo departamento y de la misma empresa
 *   (coordinadores, encargado de soporte y el encargado de diseño).
 *
 * No sube toda la cadena de mando ni avisa a dirección de otra área.
 * Antonio coordina soporte aunque su rol siga siendo `ing_soporte`.
 */

export const ROLES_COORDINACION_DEPARTAMENTO = [
  'coord_operaciones',
  'coord_admin',
  'coord_ventas',
  'enc_soporte',
  'lider_diseno',
] as const;

const ENCARGADO_POR_CORREO = new Set(['jose.ramirez@nexara.com.mx']);

export type PersonaAviso = {
  id: number;
  managerId: number | null;
  departmentId: number | null;
  roleKey?: string | null;
  email?: string | null;
  /** Empresa del departamento. Otra empresa no entra, aunque el id coincida. */
  companyId: number | null;
};

export function esCoordinacionDeDepartamento(persona: {
  roleKey?: string | null;
  email?: string | null;
}): boolean {
  const rol = (persona.roleKey || '').trim();
  if ((ROLES_COORDINACION_DEPARTAMENTO as readonly string[]).includes(rol)) return true;
  return ENCARGADO_POR_CORREO.has((persona.email || '').trim().toLowerCase());
}

/**
 * Ids a notificar, ya sin repetir. Solo gente de `companyId`.
 * `equipo` es responsable + asignados activos. `coordinadores` es la lista
 * ya filtrada por rol; aquí se queda la del mismo departamento.
 */
export function destinatariosDeAtraso(
  companyId: number,
  equipo: PersonaAviso[],
  coordinadores: PersonaAviso[],
): number[] {
  const propios = equipo.filter((p) => p.id > 0 && p.companyId === companyId);
  const departamentos = new Set(
    propios.map((p) => p.departmentId).filter((id): id is number => id != null && id > 0),
  );
  const ids = new Set<number>();
  for (const p of propios) {
    ids.add(p.id);
    if (p.managerId != null && p.managerId > 0) ids.add(p.managerId);
  }
  for (const c of coordinadores) {
    if (c.companyId !== companyId) continue;
    if (!esCoordinacionDeDepartamento(c)) continue;
    if (c.departmentId != null && departamentos.has(c.departmentId)) ids.add(c.id);
  }
  return [...ids];
}

export const TITULO_AVISO_ATRASO = 'Actividad atrasada';

/**
 * Texto del push y de la campana.
 * Quien la tiene (responsable o asignado): «Tu actividad AN · título…».
 * Jefe o coordinación: «La actividad AN · título de {nombre} está atrasada.»
 * `relatedUrl` de la actividad es aparte: al tocarla se abre el detalle.
 */
export function textoAvisoAtraso(input: {
  anNumber?: string | null;
  titulo?: string | null;
  nombreResponsable?: string | null;
  paraQuienLaTiene: boolean;
}): { title: string; message: string } {
  const an = (input.anNumber || '').trim();
  const titulo = (input.titulo || '').trim();
  const pieza = [an, titulo].filter(Boolean).join(' · ') || 'sin nombre';
  if (input.paraQuienLaTiene) {
    return {
      title: TITULO_AVISO_ATRASO,
      message: `Tu actividad ${pieza} está atrasada. Asegúrate de cumplirla en tiempo y forma.`,
    };
  }
  const nombre = (input.nombreResponsable || '').trim() || 'el responsable';
  return {
    title: TITULO_AVISO_ATRASO,
    message: `La actividad ${pieza} de ${nombre} está atrasada.`,
  };
}
