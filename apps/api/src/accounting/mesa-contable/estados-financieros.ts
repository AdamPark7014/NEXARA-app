/**
 * Estado de resultados y balance general a partir de saldos por cuenta (pólizas contabilizadas).
 *
 * La clasificación sigue el catálogo base (`base-chart-of-accounts.ts`): 4xx ingresos (404 son
 * productos financieros), 5xx costo, 6xx gastos (603 financieros, 604 ISR, 606 cambiaria). En el
 * balance, el activo circulante va hasta la 119 y el pasivo de corto plazo hasta la 249.
 *
 * A diferencia de `getBalanceSheet`, el resultado del ejercicio sí entra al capital: sin pólizas de
 * cierre el balance nunca cuadraba.
 */

export type TipoCuenta = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface SaldoCuenta {
  cuentaId: number;
  codigo: string;
  nombre: string;
  tipo: TipoCuenta | string;
  agrupador: string | null;
  debe: number;
  haber: number;
}

export interface FilaEstado {
  cuentaId: number | null;
  codigo: string;
  nombre: string;
  agrupador: string | null;
  actual: number;
  anterior: number;
  pctIngresos: number | null;
  variacionPct: number | null;
}

export interface TotalEstado {
  nombre: string;
  actual: number;
  anterior: number;
  pctIngresos: number | null;
  variacionPct: number | null;
}

export interface SeccionEstado {
  clave: string;
  titulo: string;
  filas: FilaEstado[];
  total: TotalEstado | null;
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const pct1 = (n: number) => Math.round(n * 10) / 10;

export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return pct1(((actual - anterior) / Math.abs(anterior)) * 100);
}

const prefijo = (codigo: string) => Number(String(codigo).slice(0, 3));

type Grupo = 'ingresos' | 'costos' | 'gastos' | 'financieros' | null;

export function grupoResultados(s: Pick<SaldoCuenta, 'codigo' | 'tipo'>): Grupo {
  const p = prefijo(s.codigo);
  if (s.tipo === 'REVENUE') return p === 404 ? 'financieros' : 'ingresos';
  if (s.tipo !== 'EXPENSE') return null;
  if (p >= 500 && p < 600) return 'costos';
  if (p === 603 || p === 604 || p === 606) return 'financieros';
  return 'gastos';
}

/** Importe con el signo con el que se lee en el estado: ingresos y gastos positivos en su sección. */
function importeResultados(s: SaldoCuenta): number {
  return s.tipo === 'REVENUE' ? s.haber - s.debe : s.debe - s.haber;
}

export interface EstadoResultadosArmado {
  secciones: SeccionEstado[];
  ingresos: { actual: number; anterior: number };
  utilidadBruta: { actual: number; anterior: number };
  utilidadOperacion: { actual: number; anterior: number };
  utilidadNeta: TotalEstado;
}

export function armarEstadoResultados(actual: SaldoCuenta[], anterior: SaldoCuenta[]): EstadoResultadosArmado {
  const porCodigo = new Map<string, { s: SaldoCuenta; a: number; b: number }>();
  for (const s of actual) {
    if (!grupoResultados(s)) continue;
    porCodigo.set(s.codigo, { s, a: importeResultados(s), b: 0 });
  }
  for (const s of anterior) {
    if (!grupoResultados(s)) continue;
    const x = porCodigo.get(s.codigo);
    if (x) x.b = importeResultados(s);
    else porCodigo.set(s.codigo, { s, a: 0, b: importeResultados(s) });
  }

  const filas = (g: Grupo) =>
    [...porCodigo.values()]
      .filter((x) => grupoResultados(x.s) === g && (Math.abs(x.a) >= 0.005 || Math.abs(x.b) >= 0.005))
      .sort((x, y) => x.s.codigo.localeCompare(y.s.codigo));
  type Renglon = { s: SaldoCuenta; a: number; b: number };
  const suma = (lista: Renglon[], signo: (x: Renglon) => number = () => 1) => ({
    a: cents(lista.reduce((t, x) => t + x.a * signo(x), 0)),
    b: cents(lista.reduce((t, x) => t + x.b * signo(x), 0)),
  });

  const ing = filas('ingresos');
  const cos = filas('costos');
  const gas = filas('gastos');
  const fin = filas('financieros');
  // En financieros los productos suman y los gastos restan.
  const signoFin = (x: { s: SaldoCuenta }) => (x.s.tipo === 'REVENUE' ? 1 : -1);

  const tIng = suma(ing);
  const tCos = suma(cos);
  const tGas = suma(gas);
  const tFin = suma(fin, signoFin);
  const ub = { a: cents(tIng.a - tCos.a), b: cents(tIng.b - tCos.b) };
  const uo = { a: cents(ub.a - tGas.a), b: cents(ub.b - tGas.b) };
  const un = { a: cents(uo.a + tFin.a), b: cents(uo.b + tFin.b) };

  const pctDe = (v: number) => (tIng.a ? pct1((Math.abs(v) / tIng.a) * 100) : null);
  const fila = (x: { s: SaldoCuenta; a: number; b: number }, signo = 1): FilaEstado => ({
    cuentaId: x.s.cuentaId,
    codigo: x.s.codigo,
    nombre: x.s.nombre,
    agrupador: x.s.agrupador,
    actual: cents(x.a * signo),
    anterior: cents(x.b * signo),
    pctIngresos: pctDe(x.a),
    variacionPct: variacion(x.a, x.b),
  });
  const total = (nombre: string, v: { a: number; b: number }): TotalEstado => ({
    nombre,
    actual: v.a,
    anterior: v.b,
    pctIngresos: tIng.a ? pct1((v.a / tIng.a) * 100) : null,
    variacionPct: variacion(v.a, v.b),
  });

  return {
    secciones: [
      { clave: 'ingresos', titulo: 'Ingresos', filas: ing.map((x) => fila(x)), total: total('Total de ingresos', tIng) },
      { clave: 'costos', titulo: 'Costo de ventas', filas: cos.map((x) => fila(x)), total: total('Utilidad bruta', ub) },
      { clave: 'gastos', titulo: 'Gastos de operación', filas: gas.map((x) => fila(x)), total: total('Utilidad de operación', uo) },
      {
        clave: 'financieros',
        titulo: 'Resultado de financiamiento e impuestos',
        filas: fin.map((x) => fila(x, signoFin(x))),
        total: null,
      },
    ],
    ingresos: { actual: tIng.a, anterior: tIng.b },
    utilidadBruta: { actual: ub.a, anterior: ub.b },
    utilidadOperacion: { actual: uo.a, anterior: uo.b },
    utilidadNeta: total('Utilidad neta', un),
  };
}

/** Utilidad (ingresos − costos − gastos, con financieros) de un conjunto de saldos. */
export function resultadoDe(saldos: SaldoCuenta[]): number {
  return armarEstadoResultados(saldos, []).utilidadNeta.actual;
}

export interface FilaBalance {
  cuentaId: number | null;
  nombre: string;
  agrupador: string | null;
  saldo: number;
}
export interface SeccionBalance {
  titulo: string;
  filas: FilaBalance[];
  total: number;
}
export interface LadoBalance {
  total: number;
  secciones: SeccionBalance[];
}

export interface BalanceArmado {
  activo: LadoBalance;
  pasivo: LadoBalance;
  capital: LadoBalance;
  cuadra: boolean;
  diferencia: number;
  indicadores: { liquidez: number | null; pruebaAcida: number | null; diasCobro: number | null; endeudamiento: number | null };
}

function seccion(titulo: string, filas: FilaBalance[]): SeccionBalance {
  return { titulo, filas, total: cents(filas.reduce((s, f) => s + f.saldo, 0)) };
}

/**
 * @param saldos acumulados de todas las cuentas hasta el corte
 * @param resultadoEjercicio utilidad del 1 de enero al corte (sin póliza de cierre)
 * @param resultadoAnteriores utilidad de antes del 1 de enero que no se ha traspasado
 * @param ventasMes ingresos del último mes, para los días de cobro
 * @param diasMes días del último mes
 */
export function armarBalance(
  saldos: SaldoCuenta[],
  resultadoEjercicio: number,
  resultadoAnteriores: number,
  ventasMes: number,
  diasMes: number,
): BalanceArmado {
  const fila = (s: SaldoCuenta, saldo: number): FilaBalance => ({ cuentaId: s.cuentaId, nombre: s.nombre, agrupador: s.agrupador, saldo: cents(saldo) });
  const vivos = (lista: FilaBalance[]) => lista.filter((f) => Math.abs(f.saldo) >= 0.005);
  const orden = [...saldos].sort((a, b) => a.codigo.localeCompare(b.codigo));

  const activos = orden.filter((s) => s.tipo === 'ASSET');
  const circulante = vivos(activos.filter((s) => prefijo(s.codigo) < 120).map((s) => fila(s, s.debe - s.haber)));
  const fijo = vivos(activos.filter((s) => prefijo(s.codigo) >= 120).map((s) => fila(s, s.debe - s.haber)));

  const pasivos = orden.filter((s) => s.tipo === 'LIABILITY');
  const corto = vivos(pasivos.filter((s) => prefijo(s.codigo) < 250).map((s) => fila(s, s.haber - s.debe)));
  const largo = vivos(pasivos.filter((s) => prefijo(s.codigo) >= 250).map((s) => fila(s, s.haber - s.debe)));

  const capitalFilas = vivos([
    ...orden.filter((s) => s.tipo === 'EQUITY').map((s) => fila(s, s.haber - s.debe)),
    { cuentaId: null, nombre: 'Resultados de ejercicios anteriores (sin traspasar)', agrupador: null, saldo: cents(resultadoAnteriores) },
    { cuentaId: null, nombre: 'Resultado del ejercicio', agrupador: null, saldo: cents(resultadoEjercicio) },
  ]);

  const activo: LadoBalance = {
    secciones: [seccion('Circulante', circulante), seccion('No circulante', fijo)].filter((s) => s.filas.length),
    total: 0,
  };
  activo.total = cents(activo.secciones.reduce((s, x) => s + x.total, 0));
  const pasivo: LadoBalance = {
    secciones: [seccion('Pasivo a corto plazo', corto), seccion('Pasivo a largo plazo', largo)].filter((s) => s.filas.length),
    total: 0,
  };
  pasivo.total = cents(pasivo.secciones.reduce((s, x) => s + x.total, 0));
  const capital: LadoBalance = { secciones: [seccion('Capital contable', capitalFilas)].filter((s) => s.filas.length), total: 0 };
  capital.total = cents(capital.secciones.reduce((s, x) => s + x.total, 0));

  const diferencia = cents(activo.total - pasivo.total - capital.total);
  const totalCirc = cents(circulante.reduce((s, f) => s + f.saldo, 0));
  const totalCorto = cents(corto.reduce((s, f) => s + f.saldo, 0));
  const inventario = saldos.filter((s) => s.tipo === 'ASSET' && prefijo(s.codigo) === 115).reduce((t, s) => t + s.debe - s.haber, 0);
  const clientes = saldos.filter((s) => s.tipo === 'ASSET' && prefijo(s.codigo) === 105).reduce((t, s) => t + s.debe - s.haber, 0);
  const dos = (n: number) => Math.round(n * 100) / 100;

  return {
    activo,
    pasivo,
    capital,
    cuadra: Math.abs(diferencia) < 0.01,
    diferencia,
    indicadores: {
      liquidez: totalCorto > 0 ? dos(totalCirc / totalCorto) : null,
      pruebaAcida: totalCorto > 0 ? dos((totalCirc - inventario) / totalCorto) : null,
      diasCobro: ventasMes > 0 ? Math.round((clientes / ventasMes) * diasMes) : null,
      endeudamiento: activo.total > 0 ? pct1((pasivo.total / activo.total) * 100) : null,
    },
  };
}

export type Periodicidad = 'mes' | 'trimestre' | 'anio';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const capital1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Rango {
  etiqueta: string;
  from: string;
  to: string;
}

/** El periodo que contiene `fecha` (YYYY-MM) y el inmediato anterior, para comparar. */
export function rangosPeriodo(periodo: string | undefined, fecha: string | undefined, hoy: string): { actual: Rango; anterior: Rango; periodicidad: Periodicidad } {
  const p: Periodicidad = periodo === 'trimestre' || periodo === 'anio' ? periodo : 'mes';
  const m = /^(\d{4})-(\d{2})/.exec(String(fecha ?? '')) ?? /^(\d{4})-(\d{2})/.exec(hoy)!;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const rango = (y0: number, m0: number, meses: number): Rango => {
    let yF = y0;
    let mF = m0 + meses - 1;
    while (mF > 12) {
      mF -= 12;
      yF += 1;
    }
    const etiqueta =
      meses === 1
        ? `${capital1(MESES[m0 - 1])} ${y0}`
        : meses === 3
          ? `${capital1(MESES[m0 - 1]).slice(0, 3)}–${MESES[mF - 1].slice(0, 3)} ${y0}`
          : `${y0}`;
    return { etiqueta, from: `${y0}-${pad(m0)}-01`, to: `${yF}-${pad(mF)}-${pad(ultimoDia(yF, mF))}` };
  };
  if (p === 'anio') return { periodicidad: p, actual: rango(y, 1, 12), anterior: rango(y - 1, 1, 12) };
  if (p === 'trimestre') {
    const q = Math.floor((mes - 1) / 3) * 3 + 1;
    const prevQ = q - 3 < 1 ? { y: y - 1, m: 10 } : { y, m: q - 3 };
    return { periodicidad: p, actual: rango(y, q, 3), anterior: rango(prevQ.y, prevQ.m, 3) };
  }
  const prev = mes === 1 ? { y: y - 1, m: 12 } : { y, m: mes - 1 };
  return { periodicidad: p, actual: rango(y, mes, 1), anterior: rango(prev.y, prev.m, 1) };
}

export function etiquetaCorte(to: string): string {
  const [y, m, d] = to.split('-').map(Number);
  return `Al ${d} de ${MESES[m - 1]} de ${y}`;
}

export function mesCorto(ymd: string): string {
  return MESES[Number(ymd.slice(5, 7)) - 1].slice(0, 3);
}
