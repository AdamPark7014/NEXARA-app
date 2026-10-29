import { fechaClave, fechaColumna, esSabadoODomingo } from '../guardias/guardias-reglas.js';
import { workDateKey } from '../common/time/workday.js';
import { comoLeToca, festivosDelRango, type ComoLeToca, type Festivo, type FilaFestivo } from './festivos-reglas.js';

/** Lo mínimo de Prisma que usa (así lo llama quien solo tiene `prisma`). */
type Db = { diaFestivo?: { findMany?: (args: any) => Promise<any[]> }; [modelo: string]: any };

/** Fila de `dias_festivos` → la forma de las reglas. */
export function filaDesdeDb(r: any): FilaFestivo {
  return {
    id: r.id,
    fecha: fechaClave(r.fecha),
    nombre: r.nombre,
    origen: r.origen,
    modo: r.modo,
    horaEntrada: r.horaEntrada ?? null,
    horaSalida: r.horaSalida ?? null,
    personas: Array.isArray(r.personas) ? r.personas : [],
    pagoDoble: r.pagoDoble !== false,
    avisar: r.avisar !== false,
    nota: r.nota ?? null,
    actualizadoPorId: r.actualizadoPorId ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}

/**
 * Festivos de la empresa entre dos fechas (`AAAA-MM-DD`). Si no se puede leer la tabla (pruebas
 * con Prisma simulado, arranque sin la migración, error de base) quedan los de ley tal cual:
 * no saber no es motivo para tratar un 25 de diciembre como día laborable.
 */
export async function leerFestivos(db: Db, companyId: number | null | undefined, desde: string, hasta: string): Promise<Festivo[]> {
  let filas: FilaFestivo[] = [];
  if (companyId != null && typeof db?.diaFestivo?.findMany === 'function') {
    try {
      const rows = await db.diaFestivo.findMany({
        where: { companyId, fecha: { gte: fechaColumna(desde), lte: fechaColumna(hasta) } },
      });
      filas = (rows ?? []).map(filaDesdeDb);
    } catch {
      filas = [];
    }
  }
  return festivosDelRango(desde, hasta, filas);
}

/** El festivo de ese día para una persona, o null si no es festivo. */
export async function festivoParaPersona(
  db: Db,
  p: { userId: number; companyId: number | null | undefined; at: Date; conGuardia?: boolean },
): Promise<{ festivo: Festivo; como: ComoLeToca } | null> {
  const fecha = workDateKey(p.at);
  const [festivo] = await leerFestivos(db, p.companyId, fecha, fecha);
  if (!festivo) return null;
  return { festivo, como: comoLeToca(festivo, { userId: p.userId, conGuardia: p.conGuardia }) };
}

/** ¿Hoy es un festivo en que esta persona no trabaja, entre semana? (la checada se rechaza) */
export async function festivoSinLaborar(
  db: Db,
  p: { userId: number; companyId: number | null | undefined; at: Date },
): Promise<Festivo | null> {
  if (esSabadoODomingo(workDateKey(p.at))) return null;
  const r = await festivoParaPersona(db, p);
  return r && !r.como.trabaja ? r.festivo : null;
}
