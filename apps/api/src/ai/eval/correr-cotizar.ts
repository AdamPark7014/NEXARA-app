/**
 * Eval de «Cotizar con IA»: cuánto resuelve el código solo y qué tan bien queda con la IA.
 *
 *   npm run eval:cotizar -w apps/api -- [--sin-ia] [--solo c01,c07] [--modelo haiku] [--max-usd 0.05] [--real casos.json]
 *
 * Cada caso corre el mismo camino que producción (`armarPropuesta`), con la misma petición y por la
 * puerta con el token de pruebas. Se califica en código: cliente, renglones, cantidades y modelo.
 *
 * `--real` lee un JSON local con `{ padron, usados, filas, catalogo, casos }` de la empresa real: el
 * repo es público y esos datos no se guardan en git. De ahí el resultado solo sale en cifras. Con
 * `--real` también se compara cada renglón con lo que de verdad se cotizó en esa cotización.
 *
 * `--ia-guardada archivo.json` guarda lo que respondió la IA y lo reutiliza: para afinar el emparejado
 * sin volver a pagar las mismas frases.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService, type UsoClaude } from '../claude/claude.service.js';
import { limpiarSalidaCotizar, peticionCotizar, type SalidaCotizar } from '../cotizar/cotizar-ia.js';
import { CLIENTE_GENERICO, armarPropuesta, type PropuestaCotizacion } from '../../cotizaciones/cotizar-frase.js';
import { CANDIDATOS_FIJOS, candidatosDeUsadas, consultasDeCatalogo, cumpleLoPedido, palabrasDePartida, type CandidatoPartida } from '../../cotizaciones/emparejar-partidas.js';
import { normalizarTexto, type FilaCotizada } from '../../cotizaciones/partidas-frecuentes.js';
import type { FichaComparable } from '../../ventas/clientes-parecidos.js';
import { CASOS_COTIZAR, CLIENTES_USADOS, FILAS_COTIZAR, PADRON_COTIZAR, type CasoCotizar, type LineaEsperada } from './casos-cotizar.js';
import { DIR_RESULTADOS, MODELOS, argumentos, asegurarPresupuesto, cargarLlave, costoLlamada, enParalelo, registrarGasto, restante } from './comun.js';

type CasoReal = CasoCotizar & { antesDe?: number };
type DatosReales = {
  padron: FichaComparable[];
  usados: Array<{ nombre: string; salesClientId: number | null }>;
  filas: FilaCotizada[];
  catalogo: CandidatoPartida[];
  casos: CasoReal[];
};

type Marcador = {
  casos: number;
  perfectos: number;
  clientes: number;
  renglonesEsperados: number;
  renglonesBien: number;
  sobran: number;
  modelosEsperados: number;
  modelosBien: number;
  sinTokens: number;
  renglones: number;
  conPrecio: number;
};

function calificar(caso: CasoCotizar, p: PropuestaCotizacion) {
  const esperado = caso.cliente ?? CLIENTE_GENERICO;
  const clienteBien = normalizarTexto(p.cliente.nombre).includes(normalizarTexto(esperado)) || normalizarTexto(esperado).includes(normalizarTexto(p.cliente.nombre));
  const libres = [...p.partidas];
  let bien = 0;
  let modelosEsperados = 0;
  let modelosBien = 0;
  const fallas: string[] = [];
  for (const linea of caso.lineas) {
    const quiere = linea.busca.flatMap((b) => palabrasDePartida(b));
    // El renglón que trae lo pedido y menos de otras cosas: «ap» es el access point, no su instalación.
    const lugar = (pedido: string[]) => {
      const i = pedido.indexOf(quiere[0]!);
      return i < 0 ? 99 : i;
    };
    const conPalabras = libres
      .map((x, i) => ({ i, pedido: palabrasDePartida(x.pedido), suyas: new Set(palabrasDePartida(`${x.pedido} ${x.name} ${x.model ?? ''}`)) }))
      .filter((x) => quiere.every((b) => x.suyas.has(b)))
      .sort((a, b) => lugar(a.pedido) - lugar(b.pedido) || a.pedido.length - b.pedido.length);
    const i = conPalabras[0]?.i ?? -1;
    if (i < 0) {
      fallas.push(`falta [${linea.busca.join(' ')}]`);
      if (linea.modelo) modelosEsperados += 1;
      continue;
    }
    const hallada = libres.splice(i, 1)[0]!;
    if (hallada.cantidad === linea.cant) bien += 1;
    else fallas.push(`cantidad [${linea.busca.join(' ')}] ${hallada.cantidad} y era ${linea.cant}`);
    if (linea.modelo) {
      modelosEsperados += 1;
      if (normalizarTexto(hallada.model) === normalizarTexto(linea.modelo)) modelosBien += 1;
      else fallas.push(`modelo [${linea.busca.join(' ')}] ${hallada.model ?? 'ninguno'} y era ${linea.modelo}`);
    }
  }
  if (libres.length) fallas.push(`sobran: ${libres.map((x) => x.pedido).join(' · ')}`);
  if (!clienteBien) fallas.push(`cliente «${p.cliente.nombre}» y era «${esperado}»`);
  return { clienteBien, bien, sobran: libres.length, modelosEsperados, modelosBien, fallas };
}

/** Lo que de verdad se cotizó contra lo propuesto. Solo cuenta lo que tiene modelo: es lo único comparable. */
type Verdad = {
  conModelo: number;
  /** El modelo real estaba entre lo que se podía ofrecer (ya cotizado o mayorista). */
  alcanzable: number;
  llenoBien: number;
  /** Se llenó solo con otro modelo: puede ser una alternativa válida, o un error. Se revisa a mano. */
  llenoOtro: number;
  primera: number;
  entreOpciones: number;
};

const mismoModelo = (a: unknown, b: unknown) => {
  const x = normalizarTexto(a);
  const y = normalizarTexto(b);
  return Boolean(x && y && (x === y || (x.length >= 6 && y.startsWith(x)) || (y.length >= 6 && x.startsWith(y))));
};

/** El renglón verdadero de esa cotización para una línea esperada. */
function filaVerdadera(linea: LineaEsperada, propias: FilaCotizada[]): FilaCotizada | null {
  const quiere = linea.busca.flatMap((b) => palabrasDePartida(b));
  return propias.find((f) => {
    const suyas = new Set(palabrasDePartida(`${f.name} ${f.brand ?? ''} ${f.model ?? ''}`));
    return quiere.every((b) => suyas.has(b));
  }) ?? null;
}

async function main() {
  const args = argumentos();
  const real = args.real ? (JSON.parse(readFileSync(args.real, 'utf8')) as DatosReales) : null;
  const conIa = args['sin-ia'] === undefined;
  const modelo = MODELOS[args.modelo ?? 'haiku']!;
  const maxUsd = Number(args['max-usd'] ?? 0.05);
  const solo = args.solo ? new Set(args.solo.split(',')) : null;
  const casos = (real?.casos ?? CASOS_COTIZAR).filter((c) => !solo || solo.has(c.id));

  let claude: ClaudeService | null = null;
  if (conIa) {
    console.log(`Llave: ${cargarLlave()}`);
    asegurarPresupuesto();
    const estimado = costoLlamada(modelo, { entrada: 450, salida: 200 }) * casos.length;
    console.log(`Hasta ${casos.length} llamadas · ${modelo} · ~US$${estimado.toFixed(4)} · quedan US$${restante().toFixed(2)} del libro`);
    if (estimado > maxUsd) throw new Error(`El costo estimado pasa de --max-usd ${maxUsd}`);
    claude = new ClaudeService();
  }

  const archivoIa = args['ia-guardada'] ?? null;
  const guardadas: Record<string, SalidaCotizar> = archivoIa && existsSync(archivoIa) ? JSON.parse(readFileSync(archivoIa, 'utf8')) : {};

  const padron = real?.padron ?? PADRON_COTIZAR;
  const usados = real?.usados ?? CLIENTES_USADOS;
  const generico = padron.find((c) => normalizarTexto(c.name) === normalizarTexto(CLIENTE_GENERICO));

  // Igual que el buscador de producción: todas las palabras en el nombre, modelo o marca, y solo los primeros.
  const textosCatalogo = (real?.catalogo ?? []).map((c) => ({ c, texto: normalizarTexto(`${c.name} ${c.brand ?? ''} ${c.model ?? ''}`) }));
  const tomaCatalogo = Number(args['toma-ct'] ?? 12);
  const delCatalogoReal = (concepto: string) => {
    for (const q of consultasDeCatalogo(concepto)) {
      const palabras = q.split(/[\s,;|/]+/).filter((p) => p.length >= 2).slice(0, 4);
      const hallados = textosCatalogo.filter((x) => palabras.every((p) => x.texto.includes(p)));
      if (hallados.length) return hallados.slice(0, tomaCatalogo).map((x) => x.c);
    }
    return [];
  };

  const filas = await enParalelo(casos, Number(args.concurrencia ?? 4), async (caso: CasoReal) => {
    // En lo real, cada caso solo ve lo cotizado antes que esa cotización.
    const filasCaso = (real?.filas ?? FILAS_COTIZAR).filter((f) => !caso.antesDe || f.cotizacionId < caso.antesDe);
    let ms: number | null = null;
    let uso: UsoClaude | null = null;
    let error: string | undefined;
    const propuesta = await armarPropuesta<UsoClaude | null>(caso.frase, {
      padron,
      usados,
      generico: generico ? { id: generico.id } : null,
      // Lo mismo que producción: lo cotizado, los paquetes y el formato de conceptos.
      candidatos: [...candidatosDeUsadas(filasCaso), ...CANDIDATOS_FIJOS],
      buscarCatalogo: async (concepto) => delCatalogoReal(concepto),
      preguntarIa: async (frase) => {
        const ya = guardadas[frase];
        if (ya) return { ...limpiarSalidaCotizar(ya), uso: null };
        if (!claude) throw new Error('sin IA');
        const p = peticionCotizar(frase);
        const inicio = Date.now();
        try {
          const r = await claude.json<SalidaCotizar>({ ...p, modelo, reintentos: 5, timeoutMs: 60_000, proceso: 'eval-cotizar', companyId: 0 });
          uso = r.uso;
          registrarGasto(`cotizar ${args.modelo ?? 'haiku'}`, r.uso.usdAprox);
          ms = Date.now() - inicio;
          guardadas[frase] = r.datos;
          return { ...limpiarSalidaCotizar(r.datos), uso: r.uso };
        } catch (e) {
          error = (e as Error).message;
          throw e;
        }
      },
    });
    const nota = calificar(caso, propuesta);
    const perfecto = !nota.fallas.length;
    return { caso, propuesta, nota, perfecto, ms, uso: uso as UsoClaude | null, error };
  });

  if (archivoIa) writeFileSync(archivoIa, JSON.stringify(guardadas));

  if (real) {
    const v: Verdad = { conModelo: 0, alcanzable: 0, llenoBien: 0, llenoOtro: 0, primera: 0, entreOpciones: 0 };
    const detalles: string[] = [];
    for (const f of filas) {
      const propias = real.filas.filter((x) => x.cotizacionId === f.caso.antesDe);
      const antes = candidatosDeUsadas(real.filas.filter((x) => x.cotizacionId < (f.caso.antesDe ?? 0)));
      const libres = [...f.propuesta.partidas];
      for (const linea of f.caso.lineas) {
        const verdad = filaVerdadera(linea, propias);
        const quiere = linea.busca.flatMap((b) => palabrasDePartida(b));
        const i = libres.findIndex((x) => {
          const suyas = new Set(palabrasDePartida(`${x.pedido} ${x.name} ${x.model ?? ''}`));
          return quiere.every((b) => suyas.has(b));
        });
        if (!verdad?.model || i < 0) continue;
        const p = libres.splice(i, 1)[0]!;
        v.conModelo += 1;
        const alcanza = [...antes, ...real.catalogo].some((c) => mismoModelo(c.model, verdad.model));
        if (alcanza) v.alcanzable += 1;
        const opciones = p.alternativas;
        if (p.seguridad === 'alta' && mismoModelo(p.model, verdad.model)) v.llenoBien += 1;
        else if (p.seguridad === 'alta') {
          v.llenoOtro += 1;
          detalles.push(`  otro en ${f.caso.id}: pidió «${p.pedido}» → ${p.fuente} «${p.name.slice(0, 44)}» (${p.model ?? '—'}); real ${verdad.model}`);
        }
        if (mismoModelo(opciones[0]?.model, verdad.model)) v.primera += 1;
        if (opciones.some((o) => mismoModelo(o.model, verdad.model))) v.entreOpciones += 1;
        else if (alcanza && p.seguridad !== 'alta') detalles.push(`  no ofrecido en ${f.caso.id}: «${p.pedido}»; real ${verdad.model}; ofreció ${opciones.map((o) => o.model ?? o.name.slice(0, 16)).join(' | ') || 'nada'}`);
      }
    }
    // Las opciones contra lo que se pidió: ¿traen la marca y las cifras? Aquí sirve más de un modelo.
    const opciones = { renglones: 0, primera: 0, alguna: 0, sinOpciones: 0 };
    const malas: string[] = [];
    for (const f of filas) {
      for (const p of f.propuesta.partidas) {
        if (p.seguridad === 'alta' || cumpleLoPedido(p.pedido, { name: p.pedido, brand: null, model: null }) == null) continue;
        opciones.renglones += 1;
        if (!p.alternativas.length) opciones.sinOpciones += 1;
        if (p.alternativas[0] && cumpleLoPedido(p.pedido, p.alternativas[0])) opciones.primera += 1;
        if (p.alternativas.some((o) => cumpleLoPedido(p.pedido, o))) opciones.alguna += 1;
        else malas.push(`  sin opción que cumpla en ${f.caso.id}: «${p.pedido}»; ofreció ${p.alternativas.map((o) => o.model ?? o.name.slice(0, 18)).join(' | ') || 'nada'}`);
      }
    }
    console.log(`Opciones contra lo pedido: renglones con marca o cifras ${opciones.renglones} · la primera cumple ${opciones.primera} · alguna cumple ${opciones.alguna} · sin opciones ${opciones.sinOpciones}`);
    if (args.ver) malas.forEach((d) => console.log(d));
    console.log(`Contra lo cotizado: con modelo ${v.conModelo} · alcanzables ${v.alcanzable} · lleno bien ${v.llenoBien} · lleno con otro ${v.llenoOtro} · primera opción ${v.primera} · entre opciones ${v.entreOpciones}`);
    if (args.ver) detalles.forEach((d) => console.log(d));
  }

  const m: Marcador = { casos: filas.length, perfectos: 0, clientes: 0, renglonesEsperados: 0, renglonesBien: 0, sobran: 0, modelosEsperados: 0, modelosBien: 0, sinTokens: 0, renglones: 0, conPrecio: 0 };
  for (const f of filas) {
    if (f.perfecto) m.perfectos += 1;
    if (f.nota.clienteBien) m.clientes += 1;
    m.renglonesEsperados += f.caso.lineas.length;
    m.renglonesBien += f.nota.bien;
    m.sobran += f.nota.sobran;
    m.modelosEsperados += f.nota.modelosEsperados;
    m.modelosBien += f.nota.modelosBien;
    if (f.propuesta.via !== 'ia') m.sinTokens += 1;
    m.renglones += f.propuesta.partidas.length;
    m.conPrecio += f.propuesta.partidas.filter((x) => x.unitPrice > 0).length;
  }
  const tiempos = filas.flatMap((f) => (f.ms != null ? [f.ms] : [])).sort((a, b) => a - b);
  const usos = filas.flatMap((f) => (f.uso ? [f.uso] : []));
  const usd = usos.reduce((s, u) => s + (u.usdAprox ?? 0), 0);
  const entrada = usos.length ? Math.round(usos.reduce((s, u) => s + u.tokensEntrada + u.tokensCacheLeidos, 0) / usos.length) : 0;
  const salida = usos.length ? Math.round(usos.reduce((s, u) => s + u.tokensSalida, 0) / usos.length) : 0;

  console.log(`Perfectos ${m.perfectos}/${m.casos} · clientes ${m.clientes}/${m.casos} · renglones ${m.renglonesBien}/${m.renglonesEsperados} (sobran ${m.sobran}) · modelos ${m.modelosBien}/${m.modelosEsperados} · sin tokens ${m.sinTokens}/${m.casos} · con precio ${m.conPrecio}/${m.renglones}`);
  if (usos.length) {
    console.log(`IA: ${usos.length} llamadas · p50 ${tiempos[Math.floor(tiempos.length / 2)]} ms · p95 ${tiempos[Math.floor(tiempos.length * 0.95)]} ms · US$${(usd / usos.length).toFixed(6)} por llamada · ~${entrada} de entrada, ~${salida} de salida`);
    const promedio = usd / filas.length;
    console.log(`Costo medio por cotización contando las que no llaman: US$${promedio.toFixed(6)}`);
  }
  for (const f of filas) {
    const faltaSinIa = f.caso.sinIa && f.propuesta.via === 'ia' ? ['debía salir sin IA'] : [];
    const notas = [...f.nota.fallas, ...faltaSinIa, ...(f.error ? [`error ${f.error}`] : [])];
    if (notas.length) console.log(`  ${f.caso.id} (${f.propuesta.via})${real ? '' : ` «${f.caso.frase.replace(/\s+/g, ' ').slice(0, 70)}»`}: ${notas.join(' | ')}`);
    if ((notas.length || args.ver === 'todo') && args.ver) console.log(f.propuesta.partidas.map((x) => `      ${x.cantidad} × ${x.pedido} → [${x.fuente}/${x.seguridad}] ${x.name.slice(0, 60)} (${x.model ?? '—'}) ${x.unitPrice}`).join('\n'));
  }

  // Lo real se queda en la pantalla: solo cifras, y solo lo de muestra se guarda en el repo.
  if (!real && !solo) {
    mkdirSync(DIR_RESULTADOS, { recursive: true });
    writeFileSync(
      join(DIR_RESULTADOS, 'cotizar.json'),
      JSON.stringify(
        {
          fecha: new Date().toISOString(),
          modelo,
          marcador: m,
          msP50: tiempos[Math.floor(tiempos.length / 2)] ?? null,
          msP95: tiempos[Math.floor(tiempos.length * 0.95)] ?? null,
          usdPorLlamada: usos.length ? Number((usd / usos.length).toFixed(6)) : null,
          entrada,
          salida,
          casos: filas.map((f) => ({ id: f.caso.id, via: f.propuesta.via, perfecto: f.perfecto, fallas: f.nota.fallas, ms: f.ms, usd: f.uso?.usdAprox ?? null })),
        },
        null,
        2,
      ) + '\n',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
