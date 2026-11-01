/**
 * Categorías de costo con las que arranca una empresa, deducidas del puesto. Se pueden renombrar y
 * cada persona se puede mover de categoría a mano. Módulo puro.
 */
import { normalizar } from './calculos/sugerir-liga.js';

export type CategoriaBase = { clave: string; nombre: string; tipo: 'DIRECTO' | 'INDIRECTO'; orden: number };

export const CATEGORIAS_BASE: readonly CategoriaBase[] = [
  { clave: 'INSTALADOR', nombre: 'Instalador', tipo: 'DIRECTO', orden: 1 },
  { clave: 'SOPORTE', nombre: 'Soporte técnico', tipo: 'DIRECTO', orden: 2 },
  { clave: 'ENCARGADO', nombre: 'Encargado de obra o servicio', tipo: 'DIRECTO', orden: 3 },
  { clave: 'OFICINA', nombre: 'Oficina', tipo: 'INDIRECTO', orden: 4 },
];

/** La clave de categoría que le toca a un puesto; null si no se sabe. */
export function categoriaPorPuesto(puesto: string | null | undefined): string | null {
  const p = normalizar(puesto);
  if (!p) return null;
  if (/\bencargad[oa]\b/.test(p) && !/comercial/.test(p)) return 'ENCARGADO';
  if (/soporte/.test(p)) return 'SOPORTE';
  if (/instalador|tecnic[oa] de campo|ingeniero de campo|\bcampo\b|\bobra\b/.test(p)) return 'INSTALADOR';
  if (/administrativ|contador|auxiliar|comercial|recepcion|ventas|director|gerente/.test(p)) return 'OFICINA';
  return null;
}
