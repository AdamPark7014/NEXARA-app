/**
 * Cuánto tarda, como máximo, una tarea programada entre un disparo y el siguiente.
 *
 * Sirve al vigilante de tareas: una tarea diaria no se juzga como una de cada 5 minutos, y una de lunes a viernes
 * puede callar 72 horas (de viernes a lunes) sin que eso sea una falla. El «hueco máximo» es el periodo más largo
 * que puede pasar sin disparo cuando todo va bien.
 *
 * NO importa el paquete `cron`: no está declarado en `apps/api/package.json` y `comprobar-dependencias-dist.cjs`
 * haría fallar la construcción de la imagen. Esto es un lector mínimo de las expresiones que usa el repo.
 *
 * Soporta 5 campos (`min hora díaMes mes díaSemana`) o 6 (el primero son segundos y se ignora), con `*`, listas
 * (`8,16`), rangos (`12-18`) y pasos (cada 5 minutos, `0-23/2`, `5/10`). El día de la semana `7` vale domingo (`0`). Si el día
 * del mes y el de la semana vienen ambos restringidos, basta con que se cumpla uno (como hace cron). No soporta
 * nombres (`MON`, `JAN`): ninguna tarea los usa y la prueba guardiana avisaría con un error claro.
 *
 * Se recorre día por día sobre 400 días con `Date.UTC` y `getUTC*`: el hueco no depende del huso, y México no tiene
 * horario de verano desde 2022, así que el hueco en hora local es el mismo.
 */

const DIAS_VENTANA = 400;
const MINUTOS_POR_DIA = 1440;
/** Fecha de arranque fija: así el resultado es siempre el mismo y no depende del día en que corra la prueba. */
const INICIO_UTC = Date.UTC(2026, 0, 1);

interface CampoCron {
  min: number;
  max: number;
  /** Nombre para los mensajes de error. */
  nombre: string;
}

const CAMPOS: Record<'minuto' | 'hora' | 'diaMes' | 'mes' | 'diaSemana', CampoCron> = {
  minuto: { min: 0, max: 59, nombre: 'minuto' },
  hora: { min: 0, max: 23, nombre: 'hora' },
  diaMes: { min: 1, max: 31, nombre: 'día del mes' },
  mes: { min: 1, max: 12, nombre: 'mes' },
  // 7 también es domingo: se acepta y se pliega a 0.
  diaSemana: { min: 0, max: 7, nombre: 'día de la semana' },
};

function entero(texto: string, campo: CampoCron, expr: string): number {
  if (!/^\d{1,3}$/.test(texto)) {
    throw new Error(`Expresión cron inválida "${expr}": "${texto}" no es un número válido en ${campo.nombre}`);
  }
  const n = Number(texto);
  if (n < campo.min || n > campo.max) {
    throw new Error(
      `Expresión cron inválida "${expr}": ${n} fuera de rango (${campo.min}-${campo.max}) en ${campo.nombre}`,
    );
  }
  return n;
}

/** Valores que dispara un campo, sin repetir y ordenados. */
function valoresDeCampo(texto: string, campo: CampoCron, expr: string): number[] {
  const salida = new Set<number>();
  for (const parte of texto.split(',')) {
    if (!parte) throw new Error(`Expresión cron inválida "${expr}": lista vacía en ${campo.nombre}`);
    const [rangoTexto, pasoTexto, sobrante] = parte.split('/');
    if (sobrante !== undefined) {
      throw new Error(`Expresión cron inválida "${expr}": "${parte}" tiene más de un paso en ${campo.nombre}`);
    }
    let paso = 1;
    if (pasoTexto !== undefined) {
      paso = entero(pasoTexto, { min: 1, max: 1000, nombre: `paso de ${campo.nombre}` }, expr);
    }
    let desde: number;
    let hasta: number;
    if (rangoTexto === '*') {
      desde = campo.min;
      hasta = campo.nombre === 'día de la semana' ? 6 : campo.max;
    } else if (rangoTexto.includes('-')) {
      const [a, b, extra] = rangoTexto.split('-');
      if (extra !== undefined || a === undefined || b === undefined) {
        throw new Error(`Expresión cron inválida "${expr}": rango "${rangoTexto}" mal formado en ${campo.nombre}`);
      }
      desde = entero(a, campo, expr);
      hasta = entero(b, campo, expr);
      if (desde > hasta) {
        throw new Error(`Expresión cron inválida "${expr}": rango al revés "${rangoTexto}" en ${campo.nombre}`);
      }
    } else {
      desde = entero(rangoTexto, campo, expr);
      // «5/10» = desde 5 hasta el final de campo, de 10 en 10; «5» sin paso es un solo valor.
      hasta = pasoTexto !== undefined ? campo.max : desde;
    }
    for (let v = desde; v <= hasta; v += paso) salida.add(campo.nombre === 'día de la semana' && v === 7 ? 0 : v);
  }
  return [...salida].sort((a, b) => a - b);
}

/** Un campo «restringido» no empieza con `*` (regla de cron para decidir si el día del mes y el de la semana se suman). */
function restringido(texto: string): boolean {
  return !texto.startsWith('*');
}

/**
 * Hueco máximo, en minutos, entre dos disparos consecutivos de la expresión.
 * Una expresión inválida lanza `Error` con el motivo.
 */
export function huecoMaximoMinutos(expr: string): number {
  if (typeof expr !== 'string' || !expr.trim()) {
    throw new Error('Expresión cron inválida: está vacía');
  }
  let campos = expr.trim().split(/\s+/);
  if (campos.length === 6) campos = campos.slice(1); // el primero son segundos
  if (campos.length !== 5) {
    throw new Error(`Expresión cron inválida "${expr}": debe tener 5 o 6 campos y tiene ${campos.length}`);
  }
  const [tMin, tHora, tDiaMes, tMes, tDiaSemana] = campos as [string, string, string, string, string];

  const minutos = valoresDeCampo(tMin, CAMPOS.minuto, expr);
  const horas = valoresDeCampo(tHora, CAMPOS.hora, expr);
  const diasMes = new Set(valoresDeCampo(tDiaMes, CAMPOS.diaMes, expr));
  const meses = new Set(valoresDeCampo(tMes, CAMPOS.mes, expr));
  const diasSemana = new Set(valoresDeCampo(tDiaSemana, CAMPOS.diaSemana, expr));
  const ambosRestringidos = restringido(tDiaMes) && restringido(tDiaSemana);

  let anterior: number | null = null;
  let maximo = 0;
  for (let dia = 0; dia < DIAS_VENTANA; dia++) {
    const fecha = new Date(INICIO_UTC + dia * 86_400_000);
    if (!meses.has(fecha.getUTCMonth() + 1)) continue;
    const okDiaMes = diasMes.has(fecha.getUTCDate());
    const okDiaSemana = diasSemana.has(fecha.getUTCDay());
    if (ambosRestringidos ? !(okDiaMes || okDiaSemana) : !(okDiaMes && okDiaSemana)) continue;
    const base = dia * MINUTOS_POR_DIA;
    for (const h of horas) {
      for (const m of minutos) {
        const disparo = base + h * 60 + m;
        if (anterior !== null && disparo - anterior > maximo) maximo = disparo - anterior;
        anterior = disparo;
      }
    }
  }
  // Menos de dos disparos en la ventana (p. ej. un 29 de febrero): el hueco real es mayor que la ventana.
  return maximo > 0 ? maximo : DIAS_VENTANA * MINUTOS_POR_DIA;
}
