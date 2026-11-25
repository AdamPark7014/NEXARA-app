/**
 * Lo que necesitan los sembradores. Aquí solo va la estructura: las personas NO van en el repositorio, que es público.
 *
 * La lista de cuentas es un JSON local que se señala con SEED_PLANTILLA:
 *   { "cuentas": [{ "nombre", "email", "roleKey", "departmentName", "employeeNumber"?, "puesto"?, "managerEmail"?,
 *                   "moduleAccess"? }], "retiradas": ["correo", …] }
 * La de NEXARA vive en C:\dev\secrets\nexara\seeds\. Nunca lleva contraseñas: salen de SEED_PASSWORD_<CORREO>.
 */
import * as fs from 'fs';
import { type CuentaPlantilla, type Entorno, type RolRequerido, SeedDetenido } from './seed-seguro';

export const ROLES_REQUERIDOS: RolRequerido[] = [
  { orgRoleKey: 'ing_soporte', nombre: 'Ingeniero de Soporte' },
  { orgRoleKey: 'coord_operaciones', nombre: 'Coordinador de Operaciones' },
];

export const DEPARTAMENTOS_REQUERIDOS: string[] = [
  'Dirección General',
  'Operaciones',
  'Servicios',
  'Sistemas',
  'Administración',
  'Obra',
  'Ingeniería',
];

export type Plantilla = { cuentas: CuentaPlantilla[]; retiradas: string[] };

const TEXTOS = ['nombre', 'email', 'roleKey', 'departmentName'] as const;
const CAMPOS = new Set<string>([...TEXTOS, 'employeeNumber', 'puesto', 'managerEmail', 'moduleAccess']);

/** Lee y revisa la plantilla local. Se detiene si falta, si está mal o si trae algo que no debe. */
export function leerPlantilla(entorno: Entorno): Plantilla {
  const ruta = entorno.SEED_PLANTILLA;
  if (!ruta) throw new SeedDetenido(['Define SEED_PLANTILLA con la ruta del JSON de cuentas (es local, no va en el repositorio).']);
  let datos: { cuentas?: unknown; retiradas?: unknown };
  try {
    datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    throw new SeedDetenido([`SEED_PLANTILLA no se puede leer como JSON: ${ruta}`]);
  }
  const problemas: string[] = [];
  const cuentas = Array.isArray(datos?.cuentas) ? (datos.cuentas as Record<string, unknown>[]) : [];
  const retiradas = Array.isArray(datos?.retiradas) ? datos.retiradas : [];
  if (!cuentas.length) problemas.push('La plantilla no trae cuentas.');
  cuentas.forEach((c, i) => {
    const quien = typeof c?.email === 'string' ? c.email : `la cuenta ${i + 1}`;
    for (const campo of TEXTOS) {
      if (typeof c?.[campo] !== 'string' || !(c[campo] as string).trim()) problemas.push(`${quien}: falta ${campo}`);
    }
    if (typeof c?.email === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) problemas.push(`${quien}: no es un correo`);
    // Un campo de más se rechaza: así una contraseña no entra por descuido.
    for (const campo of Object.keys(c ?? {})) if (!CAMPOS.has(campo)) problemas.push(`${quien}: el campo ${campo} no va en la plantilla`);
  });
  if (retiradas.some((r) => typeof r !== 'string')) problemas.push('«retiradas» es una lista de correos.');
  if (problemas.length) throw new SeedDetenido(problemas);
  return { cuentas: cuentas as unknown as CuentaPlantilla[], retiradas: retiradas as string[] };
}
