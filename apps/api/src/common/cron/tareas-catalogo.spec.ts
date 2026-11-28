import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { CronExpression } from '@nestjs/schedule';
import { HORA_CIERRE_AUTOMATICO } from '../../attendance/asistencia-confiable';
import { huecoMaximoMinutos } from './cron-periodo';
import { TAREAS_CATALOGO } from './tareas-catalogo';

/**
 * PRUEBA GUARDIANA de las tareas programadas.
 *
 * Recorre todo `apps/api/src` (sin pruebas) y, para CADA `@Cron`, exige:
 *   (a) que traiga `name`;
 *   (b) que los `name` sean únicos en todo el repo (si dos coinciden, `SchedulerOrchestrator` se queda con una sola en
 *       silencio y la otra deja de correr sin que nadie lo note);
 *   (c) que el cuerpo del método llame a `runScheduledJob(`;
 *   (d) que el primer argumento de ese `runScheduledJob` exista en `TAREAS_CATALOGO`;
 *   (e) que el cron y la zona del catálogo sean los del decorador;
 * y además:
 *   (f) que toda entrada del catálogo que no sea `externo: true` tenga su `@Cron` (sin filas sobrantes);
 *   (g) que ninguna expresión del catálogo haga lanzar a `huecoMaximoMinutos`;
 *   (h) que dos `@Cron` no compartan nombre de tarea en el latido;
 *   (i) que ningún `return` salga ANTES de `runScheduledJob`, salvo `if (process.env.NEXARA_RELEVO === '1') return;`:
 *       una tarea apagada por un interruptor debe seguir latiendo («ok»), no quedarse muda y salir «atrasada».
 *
 * Así un `@Cron` nuevo sin nombre, sin envoltorio o sin fila de catálogo rompe CI. Qué hacer cuando falla: ver el
 * encabezado de `tareas-catalogo.ts`.
 *
 * Las rutas se normalizan con `split(path.sep).join('/')`: en Windows traen barra invertida (esa fue la causa de la
 * prueba roja `vence-al-terminar-su-dia`).
 */

const RAIZ = resolve(__dirname, '..', '..');

// ── Lectura de código ──────────────────────────────────────────────────────────────────────────

/** Si en `i` empieza un comentario, una cadena o una plantilla, devuelve el índice justo después; si no, `i`. */
function saltarTexto(src: string, i: number): number {
  const c = src[i];
  const d = src[i + 1];
  if (c === '/' && d === '/') {
    const fin = src.indexOf('\n', i);
    return fin === -1 ? src.length : fin;
  }
  if (c === '/' && d === '*') {
    const fin = src.indexOf('*/', i + 2);
    return fin === -1 ? src.length : fin + 2;
  }
  if (c === "'" || c === '"') {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  if (c === '`') {
    let j = i + 1;
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') j += 2;
      else if (src[j] === '$' && src[j + 1] === '{') j = cierre(src, j + 1) + 1;
      else j += 1;
    }
    return j + 1;
  }
  return i;
}

/** Dado el índice de un `(`, `{` o `[`, devuelve el de su cierre (por balance, sin contar texto ni comentarios). */
function cierre(src: string, abre: number): number {
  const par: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const abrir = src[abre]!;
  const cerrar = par[abrir];
  if (!cerrar) throw new Error(`No es un delimitador: ${abrir}`);
  let profundidad = 0;
  let i = abre;
  while (i < src.length) {
    const salto = saltarTexto(src, i);
    if (salto !== i) {
      i = salto;
      continue;
    }
    if (src[i] === abrir) profundidad += 1;
    else if (src[i] === cerrar) {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
    i += 1;
  }
  throw new Error('Delimitador sin cerrar');
}

/** Posiciones de `@Cron(` que están en código (no en comentarios ni en cadenas). */
function posicionesCron(src: string): number[] {
  const salida: number[] = [];
  let i = 0;
  while (i < src.length) {
    const salto = saltarTexto(src, i);
    if (salto !== i) {
      i = salto;
      continue;
    }
    if (src.startsWith('@Cron(', i)) salida.push(i);
    i += 1;
  }
  return salida;
}

/** Primer argumento de una lista de argumentos (hasta la primera coma de nivel 0). */
function primerArgumento(args: string): { primero: string; resto: string } {
  let i = 0;
  while (i < args.length) {
    const salto = saltarTexto(args, i);
    if (salto !== i) {
      i = salto;
      continue;
    }
    const c = args[i]!;
    if (c === '(' || c === '{' || c === '[') {
      i = cierre(args, i) + 1;
      continue;
    }
    if (c === ',') return { primero: args.slice(0, i).trim(), resto: args.slice(i + 1).trim() };
    i += 1;
  }
  return { primero: args.trim(), resto: '' };
}

/** Cuerpo del método que sigue al decorador (entre llaves, sin ellas) y su nombre. */
function metodoSiguiente(src: string, desde: number): { metodo: string; cuerpo: string } {
  let i = desde;
  // Saltar espacios, comentarios y otros decoradores hasta el nombre del método.
  let abreParams = -1;
  while (i < src.length) {
    const salto = saltarTexto(src, i);
    if (salto !== i) {
      i = salto;
      continue;
    }
    if (src[i] === '(') {
      abreParams = i;
      break;
    }
    i += 1;
  }
  if (abreParams === -1) throw new Error('No hay método después del decorador');
  const antes = src.slice(desde, abreParams).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const metodo = (antes.match(/([A-Za-z_$][\w$]*)\s*$/) ?? [])[1] ?? '?';
  let j = cierre(src, abreParams) + 1;
  // Tipo de retorno: puede traer llaves dentro de `<...>` (Promise<{ a: number }>), que no son el cuerpo.
  let angulos = 0;
  while (j < src.length) {
    const salto = saltarTexto(src, j);
    if (salto !== j) {
      j = salto;
      continue;
    }
    const c = src[j]!;
    if (c === '<') angulos += 1;
    else if (c === '>' && src[j - 1] !== '=') angulos -= 1;
    else if (c === '(' || c === '[') {
      j = cierre(src, j) + 1;
      continue;
    } else if (c === '{' && angulos <= 0) break;
    else if (c === '{') {
      j = cierre(src, j) + 1;
      continue;
    }
    j += 1;
  }
  if (j >= src.length) throw new Error(`No encuentro el cuerpo de ${metodo}`);
  return { metodo, cuerpo: src.slice(j + 1, cierre(src, j)) };
}

// ── Resolución del horario ─────────────────────────────────────────────────────────────────────

function resolverCron(expr: string, src: string): string {
  const texto = expr.trim();
  const literal = texto.match(/^(['"])(.*)\1$/s);
  if (literal) return literal[2]!;

  const enumerado = texto.match(/^CronExpression\.([A-Z0-9_]+)$/);
  if (enumerado) {
    const valor = (CronExpression as Record<string, string>)[enumerado[1]!];
    if (!valor) throw new Error(`CronExpression.${enumerado[1]} no existe en @nestjs/schedule`);
    return valor;
  }

  const constante = texto.match(/^[A-Z][A-Z0-9_]*$/);
  if (constante) {
    const def = src.match(new RegExp(`const\\s+${texto}\\s*=\\s*(['"])(.*?)\\1`));
    if (!def) throw new Error(`No encuentro const ${texto} = '...' en el mismo archivo`);
    return def[2]!;
  }

  const plantilla = texto.match(/^`([\s\S]*)`$/);
  if (plantilla) {
    return plantilla[1]!.replace(/\$\{\s*HORA_CIERRE_AUTOMATICO\.(hora|minuto)\s*\}/g, (_m, campo: 'hora' | 'minuto') =>
      String(HORA_CIERRE_AUTOMATICO[campo]),
    );
  }
  throw new Error(`No sé resolver el horario: ${texto}`);
}

// ── Lo que dice cada archivo ───────────────────────────────────────────────────────────────────

interface CronEncontrado {
  archivo: string;
  metodo: string;
  nombre: string | null;
  cron: string;
  conZona: boolean;
  /** Nombres que el cuerpo le pasa a `runScheduledJob`. */
  tareas: string[];
  llamaAEnvoltura: boolean;
  /** Lo que no se pudo leer del primer argumento de algún `runScheduledJob` (no es una cadena fija). */
  argumentosNoFijos: number;
  /** Condiciones de los `return` que salen antes del primer `runScheduledJob`, sin los de `NEXARA_RELEVO`. */
  salidasAntes: string[];
}

/**
 * Los `return` del cuerpo que quedan antes del primer `runScheduledJob`, con el texto de la sentencia que los lleva
 * (por ejemplo `if (!(await capturaGuiadaPrendida(this.prisma)))`). La única salida permitida es la del relevo.
 */
function salidasAntesDelEnvoltorio(cuerpo: string): string[] {
  const envoltura = cuerpo.search(/runScheduledJob\s*(?:<[^>(]*>)?\(/);
  if (envoltura === -1) return [];
  const antes = cuerpo.slice(0, envoltura).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const salidas: string[] = [];
  for (const m of antes.matchAll(/\breturn\b/g)) {
    const previo = antes.slice(0, m.index);
    const inicio = Math.max(previo.lastIndexOf(';'), previo.lastIndexOf('{'), previo.lastIndexOf('}')) + 1;
    const sentencia = previo.slice(inicio).replace(/\s+/g, ' ').trim();
    if (/^if \( ?process\.env\.NEXARA_RELEVO === '1' ?\)$/.test(sentencia)) continue;
    salidas.push(sentencia || 'return');
  }
  return salidas;
}

function leerCrons(archivo: string, src: string): CronEncontrado[] {
  return posicionesCron(src).map((pos) => {
    const abre = pos + '@Cron'.length;
    const cierra = cierre(src, abre);
    const { primero, resto } = primerArgumento(src.slice(abre + 1, cierra));
    const { metodo, cuerpo } = metodoSiguiente(src, cierra + 1);

    const tareas: string[] = [];
    let argumentosNoFijos = 0;
    for (const m of cuerpo.matchAll(/runScheduledJob\s*(?:<[^>(]*>)?\(\s*([^,)]*)/g)) {
      const arg = m[1]!.trim();
      const fijo = arg.match(/^(['"`])([^'"`$]+)\1$/);
      if (fijo) tareas.push(fijo[2]!);
      else argumentosNoFijos += 1;
    }

    const nombre = resto.match(/\bname\s*:\s*(['"])([^'"]+)\1/);
    return {
      archivo,
      metodo,
      nombre: nombre ? nombre[2]! : null,
      cron: resolverCron(primero, src),
      conZona: /\btimeZone\s*:/.test(resto),
      tareas,
      llamaAEnvoltura: /runScheduledJob\s*(?:<[^>(]*>)?\(/.test(cuerpo),
      argumentosNoFijos,
      salidasAntes: salidasAntesDelEnvoltorio(cuerpo),
    };
  });
}

function archivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') && !nombre.endsWith('.d.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

const rel = (ruta: string) => relative(RAIZ, ruta).split(sep).join('/');

function todosLosCrons(): CronEncontrado[] {
  const salida: CronEncontrado[] = [];
  for (const ruta of archivosTs(RAIZ)) {
    const src = readFileSync(ruta, 'utf8');
    if (!src.includes('@Cron(')) continue;
    for (const c of leerCrons(rel(ruta), src)) salida.push(c);
  }
  return salida;
}

const etiqueta = (c: CronEncontrado) => `${c.archivo} → ${c.metodo}()`;

// ── La guardiana ───────────────────────────────────────────────────────────────────────────────

describe('tareas programadas: guardiana', () => {
  const crons = todosLosCrons();
  const entradas = Object.entries(TAREAS_CATALOGO);

  it('el recorrido ve las tareas (si no, la guardiana pasaría vacía)', () => {
    expect(crons.length).toBeGreaterThanOrEqual(62);
    expect(new Set(crons.map((c) => c.archivo)).size).toBeGreaterThanOrEqual(40);
    // Las rutas están normalizadas: nunca barra invertida.
    expect(crons.every((c) => !c.archivo.includes('\\'))).toBe(true);
  });

  it('(a) todo @Cron trae name', () => {
    expect(crons.filter((c) => !c.nombre).map(etiqueta)).toEqual([]);
  });

  it('(b) los name de @Cron son únicos en todo el repo', () => {
    const veces = new Map<string, string[]>();
    for (const c of crons) {
      if (!c.nombre) continue;
      veces.set(c.nombre, [...(veces.get(c.nombre) ?? []), etiqueta(c)]);
    }
    const repetidos = [...veces.entries()].filter(([, donde]) => donde.length > 1);
    expect(repetidos).toEqual([]);
  });

  it('(c) el cuerpo de todo @Cron llama a runScheduledJob', () => {
    expect(crons.filter((c) => !c.llamaAEnvoltura).map(etiqueta)).toEqual([]);
  });

  it('(d) el nombre que se le pasa a runScheduledJob es una cadena fija y existe en el catálogo', () => {
    const sinNombreFijo = crons.filter((c) => c.llamaAEnvoltura && c.tareas.length === 0).map(etiqueta);
    expect(sinNombreFijo).toEqual([]);
    const fueraDelCatalogo = crons.flatMap((c) =>
      c.tareas.filter((t) => !(t in TAREAS_CATALOGO)).map((t) => `${etiqueta(c)} usa «${t}», que no está en tareas-catalogo.ts`),
    );
    expect(fueraDelCatalogo).toEqual([]);
  });

  it('(h) dos @Cron no comparten nombre de tarea en el latido', () => {
    const quien = new Map<string, string[]>();
    for (const c of crons) {
      for (const t of new Set(c.tareas)) quien.set(t, [...(quien.get(t) ?? []), etiqueta(c)]);
    }
    expect([...quien.entries()].filter(([, donde]) => donde.length > 1)).toEqual([]);
  });

  it('(i) ningún interruptor sale antes de runScheduledJob (solo NEXARA_RELEVO): apagada, la tarea sigue latiendo', () => {
    const conSalida = crons.filter((c) => c.salidasAntes.length > 0).map((c) => `${etiqueta(c)}: ${c.salidasAntes.join(' | ')}`);
    expect(conSalida).toEqual([]);
  });

  it('(e) el cron y la zona del catálogo son los del decorador', () => {
    const distintos: string[] = [];
    for (const c of crons) {
      const tarea = c.tareas[0];
      const fila = tarea ? TAREAS_CATALOGO[tarea] : undefined;
      if (!fila) continue;
      if (fila.cron !== c.cron) distintos.push(`${etiqueta(c)}: catálogo «${fila.cron}», decorador «${c.cron}»`);
      if ((fila.zona === 'MX') !== c.conZona) {
        distintos.push(`${etiqueta(c)}: catálogo dice zona ${fila.zona} y el decorador ${c.conZona ? 'trae' : 'no trae'} timeZone`);
      }
    }
    expect(distintos).toEqual([]);
  });

  it('(f) toda fila del catálogo que no es externa tiene su @Cron', () => {
    const conCron = new Set(crons.flatMap((c) => c.tareas));
    const sobrantes = entradas.filter(([nombre, fila]) => !fila.externo && !conCron.has(nombre)).map(([nombre]) => nombre);
    expect(sobrantes).toEqual([]);
  });

  it('(g) ninguna expresión del catálogo ni de los decoradores hace lanzar a huecoMaximoMinutos', () => {
    const malas: string[] = [];
    for (const [nombre, fila] of entradas) {
      try {
        expect(huecoMaximoMinutos(fila.cron)).toBeGreaterThan(0);
      } catch (e) {
        malas.push(`${nombre}: ${(e as Error).message}`);
      }
    }
    for (const c of crons) {
      try {
        huecoMaximoMinutos(c.cron);
      } catch (e) {
        malas.push(`${etiqueta(c)}: ${(e as Error).message}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('el catálogo está completo: cada fila dice qué hace y a qué grupo pertenece', () => {
    const incompletas = entradas
      .filter(([, f]) => !f.que?.trim() || !f.grupo?.trim() || !['MX', 'UTC'].includes(f.zona))
      .map(([nombre]) => nombre);
    expect(incompletas).toEqual([]);
    for (const [nombre, f] of entradas) {
      if (f.factor !== undefined) expect([nombre, f.factor > 0]).toEqual([nombre, true]);
    }
  });

  it('hay tantas filas de catálogo como @Cron (más las externas)', () => {
    const externas = entradas.filter(([, f]) => f.externo).length;
    expect(entradas.length - externas).toBe(new Set(crons.flatMap((c) => c.tareas)).size);
  });
});

// ── La prueba de la prueba: el lector entiende código raro y detecta lo malo ───────────────────

describe('tareas programadas: el lector de la guardiana', () => {
  const MUESTRA = `
    import { Cron, CronExpression } from '@nestjs/schedule';
    const CRON_X = '*/7 * * * *';
    // Un comentario que menciona @Cron('0 0 * * *', { name: 'falso-en-comentario' }) no cuenta.
    const texto = "tampoco @Cron('0 0 * * *') dentro de una cadena";
    export class Demo {
      @Cron('0 8 * * *', { name: 'con-todo', timeZone: WORKDAY_TIMEZONE })
      async uno(): Promise<{ n: number }> {
        await runScheduledJob('tarea-uno', this.logger, async () => {
          const plantilla = \`llave } suelta \${1 + 1}\`;
          if (plantilla) return { a: '}' };
        });
        return { n: 1 };
      }

      @Cron(CronExpression.EVERY_HOUR)
      async dos() {
        try { await this.hacer(); } catch (e) { /* se traga el error */ }
      }

      @Cron(CRON_X, { name: 'con-constante' })
      // un comentario entre el decorador y el método
      async tres() {
        await runScheduledJob(nombreVariable, this.logger, () => this.x());
      }

      @Cron(\`\${HORA_CIERRE_AUTOMATICO.minuto} \${HORA_CIERRE_AUTOMATICO.hora} * * *\`, { name: 'plantilla', timeZone: WORKDAY_TIMEZONE })
      async cuatro() {
        await runScheduledJob<number>('tarea-cuatro', this.logger, async () => 1);
      }
    }
  `;

  it('lee decoradores, nombres, horarios (literal, enum, constante y plantilla) y cuerpos', () => {
    const r = leerCrons('demo.ts', MUESTRA);
    expect(r.map((c) => c.metodo)).toEqual(['uno', 'dos', 'tres', 'cuatro']);
    expect(r.map((c) => c.nombre)).toEqual(['con-todo', null, 'con-constante', 'plantilla']);
    expect(r.map((c) => c.cron)).toEqual([
      '0 8 * * *',
      CronExpression.EVERY_HOUR,
      '*/7 * * * *',
      `${HORA_CIERRE_AUTOMATICO.minuto} ${HORA_CIERRE_AUTOMATICO.hora} * * *`,
    ]);
    expect(r.map((c) => c.conZona)).toEqual([true, false, false, true]);
    expect(r.map((c) => c.llamaAEnvoltura)).toEqual([true, false, true, true]);
    expect(r[0]!.tareas).toEqual(['tarea-uno']);
    expect(r[3]!.tareas).toEqual(['tarea-cuatro']);
  });

  it('detecta un nombre de tarea que no es una cadena fija', () => {
    const r = leerCrons('demo.ts', MUESTRA);
    expect(r[2]!.tareas).toEqual([]);
    expect(r[2]!.argumentosNoFijos).toBe(1);
  });

  it('un @Cron nuevo sin name, sin envoltorio y sin catálogo se vería en los tres chequeos', () => {
    const nuevo = `class Nuevo { @Cron('*/3 * * * *') async hola() { await this.hacer(); } }`;
    const [c] = leerCrons('nuevo.ts', nuevo);
    expect(c!.nombre).toBeNull();
    expect(c!.llamaAEnvoltura).toBe(false);
    expect(c!.tareas).toEqual([]);
  });

  it('detecta un interruptor que sale antes del envoltorio y deja pasar el del relevo', () => {
    const codigo = `class Guardas {
      @Cron('0 8 * * *', { name: 'solo-relevo' })
      async a() {
        // el relevo no corre tareas
        if (process.env.NEXARA_RELEVO === '1') return;
        await runScheduledJob('a', this.logger, async () => { if (!this.prendido()) return; });
      }
      @Cron('0 8 * * *', { name: 'interruptor-antes' })
      async b() {
        if (!(await capturaGuiadaPrendida(this.prisma))) return;
        await runScheduledJob('b', this.logger, async () => 1);
      }
      @Cron('0 8 * * *', { name: 'relevo-mas-interruptor' })
      async c() {
        if (process.env.NEXARA_RELEVO === '1' || !resumenDiarioEncendido()) return;
        await runScheduledJob('c', this.logger, async () => 1);
      }
      @Cron('0 8 * * *', { name: 'servicio-opcional' })
      async d() {
        if (!this.webhooks) return;
        await runScheduledJob('d', this.logger, async () => 1);
      }
    }`;
    const r = leerCrons('guardas.ts', codigo);
    expect(r.map((c) => c.salidasAntes)).toEqual([
      [],
      ['if (!(await capturaGuiadaPrendida(this.prisma)))'],
      ["if (process.env.NEXARA_RELEVO === '1' || !resumenDiarioEncendido())"],
      ['if (!this.webhooks)'],
    ]);
  });

  it('normaliza las rutas de Windows', () => {
    const ruta = ['alerts', 'alerts.service.ts'].join(sep);
    expect(ruta.split(sep).join('/')).toBe('alerts/alerts.service.ts');
  });
});
