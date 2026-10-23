/**
 * Eval de la minuta automática: simula la grabación (partes de 60 s), toma las notas en vivo
 * con las mismas reglas que producción (`siguienteTramo`, `tramoAlConcluir`), escribe la minuta
 * con cada variante y califica con un juez (Opus 5.5, rúbrica) más revisiones de código
 * (acuerdos, responsables, fechas, temas, cifras, seguimiento).
 *
 *   cd apps/api
 *   node -r ./scripts/ts-node-js-ext.js -r ts-node/register/transpile-only scripts/eval-minutas/correr.ts \
 *     --variantes hh,hs,sC [--juntas m1,m2] [--sin-juez] [--etiqueta texto]
 *
 * Variantes: hh = notas Haiku + minuta Haiku; hs = notas Haiku + minuta Sonnet; sC / hC = minuta
 * Sonnet / Haiku sobre la transcripción completa (sin notas; solo juntas largas).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService } from '../../src/ai/claude/claude.service.js';
import {
  CONFIG_MINUTA,
  UMBRAL_TRANSCRIPCION_COMPLETA,
  construirMinuta,
  contarPalabras,
  entradaMinuta,
  minutaTexto,
  partesNuevas,
  peticionMinuta,
  peticionNotas,
  siguienteTramo,
  tramoAlConcluir,
  transcripcionConMarcas,
  type ContextoReunion,
  type Minuta,
  type MinutaPlan,
  type NotasGuardadas,
  type NotasTramo,
  type ParteTexto,
} from '../../src/meetings/minuta-ia.js';
import { JUNTAS, PERSONAS, type Junta } from './casos.js';
import {
  DIR_EVAL,
  DIR_TRANSCRIPCIONES,
  argumentos,
  asegurarPresupuesto,
  cargarLlave,
  clienteEval,
  enParalelo,
  gastado,
  guardarDetalle,
  plano,
  registrarGasto,
  textoDe,
  usdDe,
} from './comun.js';
import { PALABRAS_POR_MINUTO } from './generar.js';

const JUEZ = 'claude-opus-5-5';
const claude = new ClaudeService();

type Uso = { entrada: number; salida: number; cacheLeida: number; usd: number; llamadas: number; ms: number };
const usoVacio = (): Uso => ({ entrada: 0, salida: 0, cacheLeida: 0, usd: 0, llamadas: 0, ms: 0 });
function sumar(u: Uso, r: { tokensEntrada: number; tokensSalida: number; tokensCacheLeidos: number; usdAprox: number | null }, ms: number) {
  u.entrada += r.tokensEntrada;
  u.salida += r.tokensSalida;
  u.cacheLeida += r.tokensCacheLeidos;
  u.usd += r.usdAprox ?? 0;
  u.llamadas += 1;
  u.ms += ms;
}

/** La transcripción en partes de 60 s, como las sube la web. */
function partesDe(texto: string): ParteTexto[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const partes: ParteTexto[] = [];
  for (let i = 0; i * PALABRAS_POR_MINUTO < palabras.length; i++) {
    partes.push({
      parte: i + 1,
      estado: 'LISTA',
      texto: palabras.slice(i * PALABRAS_POR_MINUTO, (i + 1) * PALABRAS_POR_MINUTO).join(' '),
      inicioMs: i * 60_000,
      duracionMs: 60_000,
    });
  }
  return partes;
}

function contexto(j: Junta, partes: ParteTexto[]): ContextoReunion {
  return {
    titulo: j.titulo,
    fecha: j.fecha,
    horaInicio: '10:00',
    duracionMs: partes.length * 60_000,
    asistentes: j.asistentesIds.map((id) => PERSONAS.find((p) => p.id === id)!.nombre),
    agenda: j.agenda ?? null,
    personas: PERSONAS,
    anterior: j.previa ? { id: 1, titulo: j.previa.titulo, fecha: j.previa.fecha } : null,
    previos: j.previa?.acuerdos ?? [],
  };
}

async function notas(ctx: ContextoReunion, tramo: ParteTexto[], previas: NotasGuardadas[], uso: Uso): Promise<NotasGuardadas> {
  const temas = [...new Set(previas.flatMap((n) => n.notas.temas.map((t) => t.titulo)))];
  const p = peticionNotas(ctx, tramo, temas);
  const t0 = Date.now();
  const { datos, uso: u } = await claude.json<NotasTramo>({ ...p, proceso: 'eval-notas', companyId: 1 });
  sumar(uso, u, Date.now() - t0);
  const ult = tramo[tramo.length - 1];
  return {
    desde: tramo[0].parte,
    hasta: ult.parte,
    inicioMs: tramo[0].inicioMs,
    finMs: (ult.inicioMs ?? 0) + (ult.duracionMs ?? 0),
    palabras: tramo.reduce((s, x) => s + contarPalabras(x.texto), 0),
    notas: datos,
  };
}

/** Lo que pasa durante la junta: llega una parte por minuto y se anota cuando toca. */
async function notasEnVivo(ctx: ContextoReunion, partes: ParteTexto[], uso: Uso, umbral?: number): Promise<NotasGuardadas[]> {
  const guardadas: NotasGuardadas[] = [];
  const hasta = () => (guardadas.length ? guardadas[guardadas.length - 1].hasta : 0);
  for (let n = 1; n <= partes.length; n++) {
    const tramo = siguienteTramo(partesNuevas(partes.slice(0, n), hasta()));
    if (tramo) guardadas.push(await notas(ctx, tramo, guardadas, uso));
  }
  // Al concluir: la cola larga también se anota.
  for (let tramo = tramoAlConcluir(partes, hasta(), umbral); tramo; tramo = tramoAlConcluir(partes, hasta(), umbral)) {
    guardadas.push(await notas(ctx, tramo, guardadas, uso));
  }
  return guardadas;
}

/**
 * completa: la minuta lee la transcripción entera (sin notas). notas: siempre por notas (umbral 0),
 * para medir ese camino también en juntas cortas. Sin ninguno de los dos: la regla de producción.
 */
type Variante = { nombre: string; modelo: string; completa: boolean; umbral?: number };
const VARIANTES: Record<string, Variante> = {
  hh: { nombre: 'hh', modelo: 'claude-haiku-5-5', completa: false },
  hs: { nombre: 'hs', modelo: 'claude-sonnet-5-5', completa: false },
  hhN: { nombre: 'hhN', modelo: 'claude-haiku-5-5', completa: false, umbral: 0 },
  hsN: { nombre: 'hsN', modelo: 'claude-sonnet-5-5', completa: false, umbral: 0 },
  hC: { nombre: 'hC', modelo: 'claude-haiku-5-5', completa: true },
  sC: { nombre: 'sC', modelo: 'claude-sonnet-5-5', completa: true },
};

async function minuta(j: Junta, ctx: ContextoReunion, partes: ParteTexto[], guardadas: NotasGuardadas[], v: Variante, uso: Uso) {
  const entrada = v.completa
    ? { fuente: 'transcripcion' as const, texto: transcripcionConMarcas(partes), palabras: 0 }
    : entradaMinuta(partes, guardadas, v.umbral);
  const p = peticionMinuta(ctx, entrada);
  const t0 = Date.now();
  const { datos, uso: u } = await claude.json<MinutaPlan>({ ...p, modelo: v.modelo, proceso: 'eval-minuta', companyId: 1 });
  sumar(uso, u, Date.now() - t0);
  const m = construirMinuta(datos, PERSONAS, ctx.previos, { anterior: ctx.anterior ?? null, fuente: entrada.fuente });
  return { minuta: m, fuente: entrada.fuente, entradaTokensAprox: Math.round(p.usuario.length / 3.6) };
}

// ── Juez ────────────────────────────────────────────────────────────────

const RUBRICA = `Calificas minutas de junta generadas por IA para NEXARA, empresa mexicana de seguridad electrónica. Recibes la transcripción automática de la junta (sin nombres de quién habla), lo que la minuta debía traer (E = acuerdos esperados, X = lo que no debe aparecer como acuerdo o decisión) y la minuta generada (S = sus acuerdos).

Devuelve:
- acuerdos: por cada E, { esperado: "E1", minuta: el S que lo cubre ("S3") o null }. Cuenta como cubierto si el S describe el mismo compromiso aunque con otras palabras (responsable y fecha se revisan aparte).
- temasOmitidos: asuntos de trabajo relevantes de la transcripción que la minuta no menciona en ninguna parte (no cuentes plática social).
- inventos: afirmaciones de la minuta sin sustento en la transcripción: personas, cifras, fechas, hechos, acuerdos o decisiones que no se dijeron; una propuesta rechazada registrada como decisión; plática social convertida en pendiente o riesgo; un responsable o fecha que nadie dijo; cualquier X. Cita el texto de la minuta y di por qué.
- errores: datos que sí se trataron pero quedaron mal (persona, cifra, fecha o estado distinto al que se dijo).
Lo que la minuta tome de la lista de acuerdos de la reunión anterior (si viene) no es invento.
Cada elemento de temasOmitidos, inventos y errores en una sola frase corta (máximo 25 palabras); a lo más 12 por lista, los más graves primero.
- cobertura (1-5): ¿trae todo lo importante con detalle suficiente?
- fidelidad (1-5): 5 = nada inventado ni deformado.
- utilidad (1-5): ¿sirve como registro oficial para quien no estuvo, bien organizada y sin relleno?
Sé estricto y concreto. Responde en español.`;

const ESQUEMA_JUEZ = {
  type: 'object',
  additionalProperties: false,
  required: ['acuerdos', 'temasOmitidos', 'inventos', 'errores', 'cobertura', 'fidelidad', 'utilidad'],
  properties: {
    acuerdos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['esperado', 'minuta'],
        properties: { esperado: { type: 'string' }, minuta: { type: ['string', 'null'] } },
      },
    },
    temasOmitidos: { type: 'array', items: { type: 'string' } },
    inventos: { type: 'array', items: { type: 'string' } },
    errores: { type: 'array', items: { type: 'string' } },
    cobertura: { type: 'integer' },
    fidelidad: { type: 'integer' },
    utilidad: { type: 'integer' },
  },
};

type Veredicto = {
  acuerdos: Array<{ esperado: string; minuta: string | null }>;
  temasOmitidos: string[];
  inventos: string[];
  errores: string[];
  cobertura: number;
  fidelidad: number;
  utilidad: number;
};

function minutaParaJuez(m: Minuta): string {
  const acuerdos = m.acuerdos
    .map((a, i) => `S${i + 1}. ${a.descripcion} · responsable: ${a.responsable?.nombre ?? a.textoResponsable ?? 'ninguno'} · fecha: ${a.fechaCompromiso ?? 'ninguna'} · prioridad ${a.prioridad}`)
    .join('\n');
  return `${minutaTexto({ ...m, acuerdos: [] })}\n\nACUERDOS (S)\n${acuerdos || '(ninguno)'}`;
}

async function juzgar(j: Junta, transcripcion: string, m: Minuta): Promise<{ v: Veredicto; usd: number }> {
  asegurarPresupuesto(0.1);
  const esperado = [
    `Fecha de la reunión: ${j.fecha}`,
    j.previa
      ? `Acuerdos de la reunión anterior (los conocía la IA):\n${j.previa.acuerdos.map((x) => `${x.ref}. ${x.descripcion} — ${x.responsable} — ${x.fechaCompromiso}`).join('\n')}`
      : '',
    `Acuerdos esperados:\n${j.acuerdos.map((a, i) => `E${i + 1}. ${a.descripcion}`).join('\n')}`,
    `No debe aparecer como acuerdo o decisión:\n${j.noDebe.map((x, i) => `X${i + 1}. ${x}`).join('\n') || '(nada)'}`,
  ].join('\n\n');
  const r = await clienteEval().messages.create({
    model: JUEZ,
    max_tokens: 4_000,
    system: [
      { type: 'text', text: RUBRICA },
      { type: 'text', text: `TRANSCRIPCIÓN\n${transcripcion}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: `${esperado}\n\nMINUTA GENERADA\n${minutaParaJuez(m)}` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_JUEZ } },
  });
  const usd = usdDe(JUEZ, r.usage);
  registrarGasto('juez (opus)', usd);
  return { v: JSON.parse(textoDe(r)) as Veredicto, usd };
}

// ── Revisiones de código ────────────────────────────────────────────────

function revisar(j: Junta, m: Minuta, v: Veredicto | null) {
  const todo = plano(minutaTexto(m));
  const re = (pats: string[]) => pats.some((p) => new RegExp(plano(p), 'i').test(todo));
  const temas = j.temas.filter((t) => re(t.patrones)).length / Math.max(1, j.temas.length);
  const cifras = j.cifras.filter((c) => re(c.patrones)).length / Math.max(1, j.cifras.length);
  const fallos: string[] = [];
  for (const t of j.temas) if (!re(t.patrones)) fallos.push(`tema: ${t.nombre}`);
  for (const c of j.cifras) if (!re(c.patrones)) fallos.push(`cifra: ${c.nombre}`);

  let encontrados = 0;
  let responsables = 0;
  let fechas = 0;
  j.acuerdos.forEach((e, i) => {
    // Con juez, su emparejamiento; sin juez, el primer acuerdo que traiga una pista.
    const ref = v ? v.acuerdos.find((a) => a.esperado === `E${i + 1}`)?.minuta : null;
    const s = v
      ? ref
        ? m.acuerdos[Number(ref.replace(/\D/g, '')) - 1]
        : undefined
      : m.acuerdos.find((x) => e.pistas.some((p) => plano(x.descripcion).includes(plano(p))));
    if (!s) {
      fallos.push(`falta E${i + 1}: ${e.descripcion}`);
      return;
    }
    encontrados++;
    const id = s.responsable?.id ?? null;
    if (e.responsableId.includes(id)) responsables++;
    else fallos.push(`E${i + 1} responsable: ${s.responsable?.nombre ?? s.textoResponsable ?? 'ninguno'}`);
    if (e.fecha.includes(s.fechaCompromiso)) fechas++;
    else fallos.push(`E${i + 1} fecha: ${s.fechaCompromiso ?? 'ninguna'} (esperada ${e.fecha.join(' o ')})`);
  });
  let seguimiento: number | null = null;
  if (j.seguimiento) {
    const real = (ref: string) => m.seguimiento.find((s) => s.ref === ref)?.estado;
    const ok = Object.entries(j.seguimiento).filter(([ref, estados]) => estados.includes(real(ref)!)).length;
    seguimiento = ok / Object.keys(j.seguimiento).length;
    for (const [ref, estados] of Object.entries(j.seguimiento)) {
      if (!estados.includes(real(ref)!)) fallos.push(`seguimiento ${ref}: ${real(ref)} (esperado ${estados.join(' o ')})`);
    }
  }
  const n = Math.max(1, j.acuerdos.length);
  const piezas = [encontrados / n, responsables / n, fechas / n, temas, cifras, ...(seguimiento == null ? [] : [seguimiento])];
  const base = piezas.reduce((s, x) => s + x, 0) / piezas.length;
  const penal = v ? 0.02 * (v.inventos.length + v.errores.length) : 0;
  return {
    puntaje: Number(Math.max(0, base - penal).toFixed(4)),
    acuerdos: encontrados / n,
    responsables: responsables / n,
    fechas: fechas / n,
    temas,
    cifras,
    seguimiento,
    inventos: v?.inventos.length ?? null,
    errores: v?.errores.length ?? null,
    juez: v ? Number(((v.cobertura + v.fidelidad + v.utilidad) / 3).toFixed(2)) : null,
    fallos,
  };
}

// ── Corrida ─────────────────────────────────────────────────────────────

async function main() {
  const a = argumentos();
  console.log(`Llave: ${cargarLlave()} · gastado antes: $${gastado().toFixed(4)}`);
  const variantes = (a.variantes ?? 'hh,hs').split(',').map((n) => VARIANTES[n]).filter(Boolean);
  const juntas = (a.juntas ? JUNTAS.filter((j) => a.juntas.split(',').includes(j.id)) : JUNTAS).filter((j) =>
    existsSync(join(DIR_TRANSCRIPCIONES, `${j.id}.txt`)),
  );
  const sello = new Date().toISOString().replace(/[:.]/g, '-');

  const filas = await enParalelo(juntas, 4, async (j) => {
    const transcripcion = readFileSync(join(DIR_TRANSCRIPCIONES, `${j.id}.txt`), 'utf8');
    const partes = partesDe(transcripcion);
    const ctx = contexto(j, partes);
    const palabras = contarPalabras(transcripcion);
    const usoNotas = usoVacio();
    const necesitaNotas = variantes.some((v) => !v.completa);
    // Las notas se toman una vez (con el umbral más bajo pedido) y las comparten las variantes.
    const umbral = Math.min(...variantes.map((v) => v.umbral ?? Infinity));
    const guardadas = necesitaNotas ? await notasEnVivo(ctx, partes, usoNotas, Number.isFinite(umbral) ? umbral : undefined) : [];
    registrarGasto('notas (haiku)', usoNotas.usd);
    const salida: Array<Record<string, unknown>> = [];
    for (const v of variantes) {
      if (v.completa && palabras <= UMBRAL_TRANSCRIPCION_COMPLETA && !a['todas-completas']) continue; // igual que hh/hs: ya lee todo
      asegurarPresupuesto(0.05);
      const usoMinuta = usoVacio();
      try {
        const r = await minuta(j, ctx, partes, guardadas, v, usoMinuta);
        registrarGasto(`minuta ${v.nombre}`, usoMinuta.usd);
        const sinJuez = a['sin-juez'] === 'si' || (a['sin-juez'] ?? '').split(',').includes(v.nombre);
        const juez = sinJuez ? null : await juzgar(j, transcripcion, r.minuta);
        const rev = revisar(j, r.minuta, juez?.v ?? null);
        guardarDetalle(`${sello}-${j.id}-${v.nombre}.json`, { junta: j.id, variante: v.nombre, notas: guardadas, minuta: r.minuta, juez: juez?.v, rev });
        salida.push({
          junta: j.id,
          minutos: partes.length,
          palabras,
          variante: v.nombre,
          fuente: r.fuente,
          tramos: v.completa ? 0 : guardadas.length,
          notas: v.completa ? null : usoNotas,
          minuta: usoMinuta,
          usdTotal: Number(((v.completa ? 0 : usoNotas.usd) + usoMinuta.usd).toFixed(5)),
          usdJuez: juez?.usd ?? 0,
          ...rev,
        });
        console.log(`${j.id} ${v.nombre}: puntaje ${rev.puntaje} · juez ${rev.juez} · inventos ${rev.inventos} · $${(usoNotas.usd + usoMinuta.usd).toFixed(4)}`);
      } catch (e) {
        console.log(`${j.id} ${v.nombre}: ERROR ${(e as Error).message}`);
        salida.push({ junta: j.id, variante: v.nombre, error: (e as Error).message });
      }
    }
    return salida;
  });

  const todas = filas.flat();
  const resumen = variantes.map((v) => {
    const f = todas.filter((x) => x.variante === v.nombre && !x.error) as Array<Record<string, any>>;
    const media = (k: string) => (f.length ? Number((f.reduce((s, x) => s + (Number(x[k]) || 0), 0) / f.length).toFixed(4)) : null);
    return {
      variante: v.nombre,
      casos: f.length,
      puntaje: media('puntaje'),
      juez: media('juez'),
      acuerdos: media('acuerdos'),
      responsables: media('responsables'),
      fechas: media('fechas'),
      temas: media('temas'),
      cifras: media('cifras'),
      inventos: f.reduce((s, x) => s + (x.inventos ?? 0), 0),
      errores: f.reduce((s, x) => s + (x.errores ?? 0), 0),
      usdMedio: media('usdTotal'),
    };
  });
  console.table(resumen);
  const archivo = join(DIR_EVAL, 'resultados.json');
  const previos = existsSync(archivo) ? (JSON.parse(readFileSync(archivo, 'utf8')) as unknown[]) : [];
  previos.push({ fecha: new Date().toISOString(), etiqueta: a.etiqueta ?? null, config: CONFIG_MINUTA, resumen, filas: todas });
  writeFileSync(archivo, JSON.stringify(previos, null, 2) + '\n');
  console.log(`Gastado total del eval: $${gastado().toFixed(4)}`);
}

void main();
