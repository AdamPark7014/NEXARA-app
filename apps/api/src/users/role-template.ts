import { BadRequestException } from '@nestjs/common';
import { ORG_ROLE_BY_KEY, ORG_ROLE_TEMPLATES, type OrgRoleKey } from '../common/org-roles.js';

/**
 * Creación de roles apoyada en plantillas.
 *
 * Un rol cuya clave no está en la matriz v2 no tiene ninguna línea base de
 * permisos: `RbacGuard` no puede resolverlo y (antes de endurecerlo) se saltaba
 * la matriz por completo. La creación permitía justo eso, porque solo pedía un
 * nombre y unas casillas sueltas.
 *
 * Ahora todo rol nace de una plantilla organizacional, que aporta el
 * `orgRoleKey` con el que la matriz decide, el nivel de autoridad y unas
 * banderas por defecto coherentes. Quien crea el rol puede afinar las banderas,
 * pero no dejarlo sin plantilla.
 */

export type RoleTemplateSummary = {
  orgRoleKey: string;
  nombre: string;
  label: string;
  description: string;
  nivelAutoridad: number;
  departmentHint?: string;
};

/** Plantillas disponibles, en el formato que consume la interfaz. */
export function listRoleTemplates(): RoleTemplateSummary[] {
  return ORG_ROLE_TEMPLATES.map((t) => ({
    orgRoleKey: t.orgRoleKey,
    nombre: t.nombre,
    label: t.label,
    description: t.description,
    nivelAutoridad: t.nivelAutoridad,
    departmentHint: t.departmentHint,
  }));
}

/** Claves válidas, para mensajes de error accionables. */
export function validTemplateKeys(): string[] {
  return ORG_ROLE_TEMPLATES.map((t) => t.orgRoleKey);
}

/**
 * Resuelve la plantilla de un alta de rol.
 *
 * Acepta la clave explícita o, por compatibilidad con los formularios
 * antiguos, el nombre de una plantilla conocida.
 */
export function resolveTemplateOrThrow(input: {
  orgRoleKey?: string | null;
  nombre?: string | null;
}) {
  const explicit = String(input.orgRoleKey ?? '').trim();
  if (explicit) {
    const found = ORG_ROLE_BY_KEY[explicit as OrgRoleKey];
    if (!found) {
      throw new BadRequestException(
        `La plantilla "${explicit}" no existe. Plantillas válidas: ${validTemplateKeys().join(', ')}`,
      );
    }
    return found;
  }

  // Sin clave explícita: se intenta por nombre exacto de plantilla.
  const byName = String(input.nombre ?? '').trim().toLowerCase();
  const found = ORG_ROLE_TEMPLATES.find((t) => t.nombre.toLowerCase() === byName);
  if (found) return found;

  throw new BadRequestException(
    'Debes elegir una plantilla de permisos para el rol. ' +
      `Plantillas válidas: ${validTemplateKeys().join(', ')}`,
  );
}

/**
 * Combina la plantilla con los ajustes enviados.
 *
 * La plantilla marca la línea base; las banderas explícitas del formulario la
 * afinan. `orgRoleKey` y `nivelAutoridad` no son negociables: son lo que hace
 * que la matriz sepa qué puede hacer el rol.
 */
export function buildRoleData(
  template: (typeof ORG_ROLE_TEMPLATES)[number],
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const { orgRoleKey: _ignoredKey, nivelAutoridad: _ignoredTier, ...rest } = overrides;

  const flagOverrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key.startsWith('acceso') && typeof value === 'boolean') {
      flagOverrides[key] = value;
    }
  }

  return {
    ...template.flags,
    ...rest,
    ...flagOverrides,
    orgRoleKey: template.orgRoleKey,
    nivelAutoridad: template.nivelAutoridad,
  };
}
