/**
 * Eval de «Cotizar con IA»: cuánto resuelve el código solo y qué tan bien queda con la IA.
 *
 *   npm run eval:cotizar -w apps/api -- [--sin-ia] [--solo c01,c07] [--modelo haiku] [--max-usd 0.05] [--real casos.json]
 *
 * Cada caso corre el mismo camino que producción (`armarPropuesta`), con la misma petición y por la
 * puerta con el token de pruebas. Se califica en código: cliente, renglones, cantidades y modelo.
 *
 * `--real` lee un JSON local con `{ padron, usados, filas, catalogo, casos }` de la empresa real: el
 * repo es público y esos datos no se guardan en git. De ahí el resultado solo sale en cifras.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService, type UsoClaude } from '../claude/claude.service.js';
import { limpiarSalidaCotizar, peticionCotizar, type SalidaCotizar } from '../cotizar/cotizar-ia.js';
import { CLIENTE_GENERICO, armarPropuesta, type PropuestaCotizacion } from '../../cotizaciones/cotizar-frase.js';
import { candidatosDeUsadas, palabrasDePartida, type CandidatoPartida } from '../../cotizaciones/emparejar-partidas.js';
import { normalizarTexto, type FilaCotizada } from '../../cotizaciones/partidas-frecuentes.js';
import type { FichaComparable } from '../../ventas/clientes-parecidos.js';
import { CASOS_COTIZAR, CLIENTES_USADOS, FILAS_COTIZAR, PADRON_COTIZAR, type CasoCotizar } from './casos-cotizar.js';
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

  const padron = real?.padron ?? PADRON_COTIZAR;
  const usados = real?.usados ?? CLIENTES_USADOS;
  const generico = padron.find((c) => normalizarTexto(c.name) === normalizarTexto(CLIENTE_GENERICO));

  // El catálogo real son miles: se indexa una vez y cada concepto ve solo lo que comparte palabras.
  const porPalabra = new Map<string, CandidatoPartida[]>();
  for (const c of real?.catalogo ?? []) {
    for (const palabra of palabrasDePartida(`${c.name} ${c.brand ?? ''} ${c.model ?? ''}`)) {
      const lista = porPalabra.get(palabra);
      if (lista) lista.push(c);
      else porPalabra.set(palabra, [c]);
    }
  }
  const delCatalogoReal = (concepto: string) => {
    const palabras = palabrasDePartida(concepto).filter((p) => (porPalabra.get(p)?.length ?? 0) > 0);
    const raras = palabras.sort((a, b) => porPalabra.get(a)!.length - porPalabra.get(b)!.length).slice(0, 2);
    return [...new Set(raras.flatMap((p) => porPalabra.get(p)!.slice(0, 200)))];
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
      candidatos: candidatosDeUsadas(filasCaso),
      buscarCatalogo: async (concepto) => delCatalogoReal(concepto),
      preguntarIa: async (frase) => {
        if (!claude) throw new Error('sin IA');
        const p = peticionCotizar(frase);
        const inicio = Date.now();
        try {
          const r = await claude.json<SalidaCotizar>({ ...p, modelo, reintentos: 5, timeoutMs: 60_000, proceso: 'eval-cotizar', companyId: 0 });
          uso = r.uso;
          registrarGasto(`cotizar ${args.modelo ?? 'haiku'}`, r.uso.usdAprox);
          ms = Date.now() - inicio;
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
