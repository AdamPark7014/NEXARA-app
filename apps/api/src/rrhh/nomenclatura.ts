/**
 * Número de empleado oficial de NEXARA (nomenclatura de RH, 16-09-2026):
 *
 *   InicialNombre + InicialApellido + AñoNac(2) + MesNac(2) + AñoIngreso(2) + MesIngreso(2)
 *
 * En la práctica de RH las dos letras son las iniciales de las dos primeras palabras del nombre
 * escrito nombre(s) primero: «Luis Joel Aguilar Castillo» → LJ, «Alejandro González Bustamante» → AG.
 *
 * Las claves que mandó RH se cargan tal cual; este módulo no las corrige, las audita contra la
 * CURP (o la fecha de nacimiento) y la fecha de ingreso para que RH vea cuáles no cuadran.
 */

export type EstadoNomenclatura = 'ok' | 'diferente' | 'invalida' | 'sin_datos';

export type AuditoriaNomenclatura = {
  estado: EstadoNomenclatura;
  /** Clave que resulta de los datos, cuando hay datos suficientes. */
  esperado?: string;
  observaciones: string[];
};

const FORMATO = /^[A-Z]{2}\d{8}$/;

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** «LJ» a partir de «Luis Joel Aguilar Castillo». */
export function inicialesNomenclatura(nombre: string): string {
  const palabras = sinAcentos(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return palabras
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Fecha de nacimiento que codifica la CURP (posiciones 5-10, AAMMDD). El carácter 17 distingue el
 * siglo: dígito → 1900-1999, letra → 2000 en adelante. `null` si la CURP no trae una fecha válida.
 */
export function fechaNacimientoDeCurp(curp?: string | null): Date | null {
  const c = (curp || '').trim().toUpperCase();
  if (c.length < 10) return null;
  const aa = Number(c.slice(4, 6));
  const mm = Number(c.slice(6, 8));
  const dd = Number(c.slice(8, 10));
  if (!Number.isInteger(aa) || !Number.isInteger(mm) || !Number.isInteger(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const siglo = c.length >= 17 && /[A-Z]/.test(c[16]!) ? 2000 : 1900;
  const fecha = new Date(Date.UTC(siglo + aa, mm - 1, dd));
  return fecha.getUTCMonth() === mm - 1 ? fecha : null;
}

export function generarNomenclatura(datos: {
  nombre: string;
  fechaNacimiento?: Date | null;
  curp?: string | null;
  fechaIngreso?: Date | null;
}): string | null {
  const nacimiento = datos.fechaNacimiento ?? fechaNacimientoDeCurp(datos.curp);
  const ingreso = datos.fechaIngreso;
  const iniciales = inicialesNomenclatura(datos.nombre);
  if (!nacimiento || !ingreso || iniciales.length !== 2) return null;
  return (
    iniciales +
    dosDigitos(nacimiento.getUTCFullYear() % 100) +
    dosDigitos(nacimiento.getUTCMonth() + 1) +
    dosDigitos(ingreso.getUTCFullYear() % 100) +
    dosDigitos(ingreso.getUTCMonth() + 1)
  );
}

/** Compara la clave registrada contra lo que dicen el nombre, la CURP/nacimiento y el ingreso. */
export function auditarNomenclatura(datos: {
  codigo?: string | null;
  nombre: string;
  curp?: string | null;
  fechaNacimiento?: Date | null;
  fechaIngreso?: Date | null;
  hoy?: Date;
}): AuditoriaNomenclatura {
  const codigo = (datos.codigo || '').trim().toUpperCase();
  const hoy = datos.hoy ?? new Date();
  const observaciones: string[] = [];
  const esperado =
    generarNomenclatura({
      nombre: datos.nombre,
      fechaNacimiento: datos.fechaNacimiento,
      curp: datos.curp,
      fechaIngreso: datos.fechaIngreso,
    }) ?? undefined;

  if (!codigo) {
    return { estado: 'sin_datos', esperado, observaciones: ['Sin número de empleado'] };
  }
  if (!FORMATO.test(codigo)) {
    return {
      estado: 'invalida',
      esperado,
      observaciones: ['No sigue el formato de 2 letras y 8 dígitos'],
    };
  }

  const mesNac = Number(codigo.slice(4, 6));
  const aaIngreso = Number(codigo.slice(6, 8));
  const mesIngreso = Number(codigo.slice(8, 10));
  if (mesNac < 1 || mesNac > 12) observaciones.push(`Mes de nacimiento imposible (${codigo.slice(4, 6)})`);
  if (mesIngreso < 1 || mesIngreso > 12) observaciones.push(`Mes de ingreso imposible (${codigo.slice(8, 10)})`);
  const anioHoy = hoy.getUTCFullYear() % 100;
  if (aaIngreso > anioHoy && aaIngreso < 70) observaciones.push(`Año de ingreso en el futuro (20${codigo.slice(6, 8)})`);

  const iniciales = inicialesNomenclatura(datos.nombre);
  if (iniciales.length === 2 && codigo.slice(0, 2) !== iniciales) {
    observaciones.push(`Las iniciales no coinciden con el nombre (se esperaba ${iniciales})`);
  }

  const nacimiento = datos.fechaNacimiento ?? fechaNacimientoDeCurp(datos.curp);
  if (nacimiento) {
    const nac = dosDigitos(nacimiento.getUTCFullYear() % 100) + dosDigitos(nacimiento.getUTCMonth() + 1);
    if (codigo.slice(2, 6) !== nac) {
      observaciones.push(`Año/mes de nacimiento no coincide con la CURP (${codigo.slice(2, 6)} vs ${nac})`);
    }
  }
  if (datos.fechaIngreso) {
    const ing =
      dosDigitos(datos.fechaIngreso.getUTCFullYear() % 100) + dosDigitos(datos.fechaIngreso.getUTCMonth() + 1);
    if (codigo.slice(6, 10) !== ing) {
      observaciones.push(`Año/mes de ingreso no coincide con la fecha de ingreso (${codigo.slice(6, 10)} vs ${ing})`);
    }
  }

  const imposible = observaciones.some((o) => o.includes('imposible') || o.includes('futuro'));
  if (imposible) return { estado: 'invalida', esperado, observaciones };
  if (observaciones.length) return { estado: 'diferente', esperado, observaciones };
  if (!nacimiento || !datos.fechaIngreso) {
    return { estado: 'sin_datos', esperado, observaciones: ['Faltan CURP/nacimiento o fecha de ingreso para verificarla'] };
  }
  return { estado: 'ok', esperado, observaciones };
}

/** Revisión de forma de los datos de RH (sin validar contra el SAT/IMSS). */
export function validarDatosRrhh(datos: {
  rfc?: string | null;
  curp?: string | null;
  nss?: string | null;
  correo?: string | null;
}): string[] {
  const obs: string[] = [];
  const rfc = (datos.rfc || '').trim();
  const curp = (datos.curp || '').trim();
  const nss = (datos.nss || '').trim();
  const correo = (datos.correo || '').trim();
  if (!rfc) obs.push('Falta RFC');
  else if (!/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) obs.push('RFC con formato inválido (13 caracteres)');
  if (!curp) obs.push('Falta CURP');
  else if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(curp)) obs.push('CURP con formato inválido (18 caracteres)');
  if (!nss) obs.push('Falta NSS');
  else if (!/^\d{11}$/.test(nss)) obs.push(`NSS debe tener 11 dígitos (tiene ${nss.replace(/\D/g, '').length})`);
  if (!correo) obs.push('Falta correo de contacto');
  else if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(correo)) obs.push('Correo con formato inválido');
  return obs;
}
